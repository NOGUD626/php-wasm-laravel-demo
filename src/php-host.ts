// ブラウザ内で Laravel を動かす中核。
//   1. @php-wasm/web で PHP ランタイム(WASM)を起動
//   2. fetch した laravel-app.zip を fflate で展開し、VFS(/var/www)へ書き込む
//   3. PHPRequestHandler を Web サーバーのように使い request() で応答を得る
import { loadWebRuntime } from '@php-wasm/web';
import { PHP, PHPRequestHandler } from '@php-wasm/universal';
import type { AllPHPVersion, HTTPMethod } from '@php-wasm/universal';
import { unzipSync } from 'fflate';

// iframe ナビゲーションを Service Worker で中継するための URL スコープ。
// サイトのデプロイ先サブパス (Vite の base) に追従するため import.meta.env.BASE_URL を前置する。
//   - base='/'                          → '/laravel'
//   - base='/php-wasm-laravel-demo/'    → '/php-wasm-laravel-demo/laravel'
// BASE_URL は末尾スラッシュ付きの規約。
export const URL_SCOPE = `${import.meta.env.BASE_URL}laravel`.replace(/\/{2,}/g, '/');

export type BootOptions = {
  phpVersion?: string;
  zipUrl?: string;
  onLog: (line: string) => void;
};

export type LaravelHost = {
  handler: PHPRequestHandler;
  request: (method: string, path: string) => Promise<{
    status: number;
    headers: Record<string, string[]>;
    text: string;
  }>;
};

const DOC_ROOT = '/var/www';

export async function bootLaravel(opts: BootOptions): Promise<LaravelHost> {
  const { onLog } = opts;
  const phpVersion = opts.phpVersion ?? '8.4';
  // zip もサブパス配信に追従させる
  const zipUrl = opts.zipUrl ?? `${import.meta.env.BASE_URL}laravel-app.zip`.replace(/\/{2,}/g, '/');

  onLog(`[host] loadWebRuntime(PHP ${phpVersion}) ...`);
  const t0 = performance.now();
  const php = new PHP(
    await loadWebRuntime(phpVersion as AllPHPVersion, {
      emscriptenOptions: { processId: 1 },
    }),
  );
  onLog(`[host] runtime booted in ${Math.round(performance.now() - t0)}ms`);

  // Laravel アプリの取得・展開
  onLog(`[host] fetching ${zipUrl} ...`);
  const buf = new Uint8Array(await (await fetch(zipUrl)).arrayBuffer());
  onLog(`[host] downloaded ${(buf.length / 1024 / 1024).toFixed(1)}MB. unzipping...`);

  const tUnzip = performance.now();
  const entries = unzipSync(buf);
  const names = Object.keys(entries);
  php.mkdir(DOC_ROOT);
  for (const name of names) {
    const data = entries[name];
    const full = `${DOC_ROOT}/${name}`;
    const dir = full.slice(0, full.lastIndexOf('/'));
    php.mkdir(dir);
    if (!name.endsWith('/')) php.writeFile(full, data);
  }
  onLog(
    `[host] unpacked ${names.length} files into ${DOC_ROOT} in ` +
      `${Math.round(performance.now() - tUnzip)}ms`,
  );

  // .env の APP_URL を「実オリジン + /laravel」に書き換える。
  // Laravel(AppServiceProvider)がこれを URL::forceRootUrl に使い、
  // 生成リンクに /laravel が付いて Service Worker のスコープ内に収まる。
  const scopedUrl = `${location.origin}${URL_SCOPE}`;
  try {
    const envPath = `${DOC_ROOT}/.env`;
    let env = php.readFileAsText(envPath);
    env = /^APP_URL=.*$/m.test(env)
      ? env.replace(/^APP_URL=.*$/m, `APP_URL=${scopedUrl}`)
      : env + `\nAPP_URL=${scopedUrl}\n`;
    php.writeFile(envPath, env);
    onLog(`[host] APP_URL = ${scopedUrl}`);
  } catch (e: any) {
    onLog(`[host] WARN: .env 書き換え失敗: ${e?.message || e}`);
  }

  const handler = new PHPRequestHandler({
    php,
    documentRoot: `${DOC_ROOT}/public`,
    // パスのスコープ(/laravel)は Service Worker ブリッジ側で剥がして渡すので、
    // ここは素のオリジン。REQUEST_URI が /app... になり Laravel のルートが一致する。
    absoluteUrl: location.origin,
    // 実ファイルが無いURLは Laravel のフロントコントローラへ（try_files 相当）
    getFileNotFoundAction: () => ({ type: 'internal-redirect', uri: '/index.php' }),
  });

  onLog('[host] Laravel ready ✅');

  return {
    handler,
    async request(method: string, path: string) {
      const res = await handler.request({ method: method as HTTPMethod, url: path });
      return {
        status: res.httpStatusCode,
        headers: res.headers,
        text: res.text,
      };
    },
  };
}
