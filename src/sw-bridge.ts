// メインページ側のブリッジ。
//   - Service Worker を登録する
//   - SW から BroadcastChannel で届いたリクエストを PHPRequestHandler に渡し、応答を返す
//   - PHP は単一インスタンス(シングルスレッド)なのでリクエストを直列化する
import type { PHPRequestHandler, HTTPMethod } from '@php-wasm/universal';
import { URL_SCOPE } from './php-host';

// '/laravel/app?x=1' → '/app?x=1'（ルーティングを通すためスコープ接頭辞を剥がす）
function stripScope(url: string): string {
  if (url === URL_SCOPE) return '/';
  if (url.startsWith(URL_SCOPE + '/')) return url.slice(URL_SCOPE.length);
  if (url.startsWith(URL_SCOPE + '?')) return '/' + url.slice(URL_SCOPE.length);
  return url;
}

type BridgeRequest = {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: Uint8Array;
};

export async function registerServiceWorker(
  onLog: (s: string) => void,
): Promise<void> {
  if (!('serviceWorker' in navigator)) {
    throw new Error('この環境では Service Worker が使えません');
  }
  // サブパス配信 (例 GitHub Pages '/php-wasm-laravel-demo/') にも対応するため、
  // Vite の BASE_URL を sw.js のパスとスコープに用いる。
  const base = import.meta.env.BASE_URL; // 末尾 '/' 付きの規約
  const swPath = `${base}sw.js`.replace(/\/{2,}/g, '/');
  const reg = await navigator.serviceWorker.register(swPath, { scope: base });
  await navigator.serviceWorker.ready;
  // 既にアクティブな SW がページを制御していない場合に備えて少し待つ
  if (!navigator.serviceWorker.controller) {
    await new Promise<void>((resolve) => {
      navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), {
        once: true,
      });
      // 既に制御済みならすぐ解決
      if (navigator.serviceWorker.controller) resolve();
      setTimeout(resolve, 1000);
    });
  }
  onLog(`[bridge] Service Worker registered (scope=${base}), state=` + (reg.active?.state ?? '?'));
}

export function startPhpBridge(
  handler: PHPRequestHandler,
  onLog: (s: string) => void,
): void {
  const channel = new BroadcastChannel('php-wasm-bridge');

  // 直列化用のキュー（前のリクエスト完了後に次を処理）
  let queue: Promise<unknown> = Promise.resolve();

  channel.onmessage = (e: MessageEvent) => {
    const data = e.data as { id?: string; request?: BridgeRequest };
    if (!data?.id || !data.request) return;
    const { id, request } = data;

    queue = queue.then(async () => {
      try {
        const res = await handler.request({
          method: request.method as HTTPMethod,
          url: stripScope(request.url),
          headers: request.headers,
          ...(request.body ? { body: request.body } : {}),
        });

        // Record<string,string[]> → [name, value][] に展開（Headers が解釈できる形）
        const headerPairs: [string, string][] = [];
        for (const [k, vals] of Object.entries(res.headers)) {
          for (const v of vals) headerPairs.push([k, v]);
        }

        channel.postMessage({
          id,
          response: {
            status: res.httpStatusCode,
            headers: headerPairs,
            body: res.bytes,
          },
        });
        onLog(`[bridge] ${request.method} ${request.url} → ${res.httpStatusCode}`);
      } catch (err: any) {
        channel.postMessage({
          id,
          response: {
            status: 500,
            headers: [['content-type', 'text/plain; charset=utf-8']],
            body: new TextEncoder().encode(
              'bridge error: ' + (err?.message || String(err)),
            ),
          },
        });
        onLog(`[bridge] ERROR ${request.url}: ${err?.message || err}`);
      }
    });
  };

  onLog('[bridge] PHP bridge listening on BroadcastChannel');
}
