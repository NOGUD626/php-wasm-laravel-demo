// 検証②: 実物の Laravel 13 アプリ(laravel-app/)を php-wasm に丸ごとマウントし、
// PHPRequestHandler で「Webサーバーのように」リクエストを処理できるか確かめる。
//   - documentRoot = /var/www/public（Laravelの公開ディレクトリ）
//   - file-not-found は public/index.php に内部リダイレクト（= Laravel のフロントコントローラ）
import { loadNodeRuntime, createNodeFsMountHandler } from '@php-wasm/node';
import { PHP, PHPRequestHandler } from '@php-wasm/universal';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LARAVEL_DIR = resolve(__dirname, '..', 'laravel-app');
const PHP_VERSION = process.env.PHP_VERSION || '8.4';

console.log('[verify-laravel] booting php-wasm + mounting Laravel app ...');
console.log('[verify-laravel] host dir =', LARAVEL_DIR);

const t0 = performance.now();
const php = new PHP(
  await loadNodeRuntime(PHP_VERSION, { emscriptenOptions: { processId: 1 } }),
);

// ホストの実Laravelディレクトリを WASM 内 /var/www にマウント（コピーではなくマウント）
php.mkdir('/var/www');
await php.mount('/var/www', createNodeFsMountHandler(LARAVEL_DIR));
console.log('[verify-laravel] mounted in', Math.round(performance.now() - t0), 'ms');

const handler = new PHPRequestHandler({
  php,
  documentRoot: '/var/www/public',
  absoluteUrl: 'http://localhost',
  // 実ファイルが無いURLは Laravel のフロントコントローラへ（nginx の try_files 相当）
  getFileNotFoundAction: () => ({
    type: 'internal-redirect',
    uri: '/index.php',
  }),
});

async function hit(method, path, label) {
  const t = performance.now();
  const res = await handler.request({ method, url: path });
  const ms = Math.round(performance.now() - t);
  const body = res.text;
  console.log(`\n=== ${label} (${method} ${path}) → HTTP ${res.httpStatusCode} / ${ms}ms ===`);
  console.log('content-type:', (res.headers['content-type'] || []).join(','));
  console.log('body[0..240]:', body.slice(0, 240).replace(/\s+/g, ' ').trim());
  return { status: res.httpStatusCode, body };
}

// 1) トップページ（Laravelのウェルカム画面 = ルーティング+Blade描画が通る証拠）
const top = await hit('GET', '/', 'Laravel welcome page');

// 2) 動的に追加したAPIルート（routes/web.php に後で足す /demo を叩く）
const demo = await hit('GET', '/demo', 'Custom route /demo');

// 3) artisan をWASM内で実行（CLIモードも動くか）
console.log('\n=== artisan --version (CLI in WASM) ===');
const cli = await php.run({
  scriptPath: '/var/www/artisan',
  argv: ['artisan', '--version'],
});
console.log('exit:', cli.exitCode, '| out:', cli.text.trim());

// 判定
const ok =
  top.status === 200 &&
  /Laravel/i.test(top.body) &&
  demo.status === 200;
console.log(`\n[verify-laravel] ${ok ? 'DONE ✅  Laravel is serving from WASM.' : 'FAILED ❌ (see output above)'}`);
process.exit(ok ? 0 : 1);
