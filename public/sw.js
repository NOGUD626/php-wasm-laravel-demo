// php-wasm Laravel demo の Service Worker。
// 役割: iframe が /laravel/* を要求したら横取りし、メインページで動いている
//       PHPRequestHandler(WASM の Laravel) に BroadcastChannel 経由で処理を依頼する。
//       これにより iframe 内でリンク遷移・CSS/JS・画像読み込みが普通のサイトのように動く。
const SCOPE_PREFIX = '/laravel';
const channel = new BroadcastChannel('php-wasm-bridge');
const pending = new Map(); // id -> resolve

// メインページからの応答を受け取る
channel.onmessage = (e) => {
  const { id, response } = e.data || {};
  if (id && pending.has(id)) {
    pending.get(id)(response);
    pending.delete(id);
  }
};

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return; // 外部はそのまま
  if (url.pathname !== SCOPE_PREFIX && !url.pathname.startsWith(SCOPE_PREFIX + '/')) return;
  event.respondWith(forwardToPhp(event.request, url));
});

let seq = 0;
async function forwardToPhp(request, url) {
  const id = `${Date.now()}-${seq++}`;
  const method = request.method;
  const headers = {};
  for (const [k, v] of request.headers) headers[k] = v;

  let body;
  if (method !== 'GET' && method !== 'HEAD') {
    body = new Uint8Array(await request.arrayBuffer());
  }

  // /laravel 接頭辞を含めた相対URLをそのまま渡す（handler 側がスコープを剥がす）
  const internalUrl = url.pathname + url.search;

  const responsePromise = new Promise((resolve) => pending.set(id, resolve));
  channel.postMessage({ id, request: { method, url: internalUrl, headers, body } });

  const timeout = new Promise((resolve) => setTimeout(() => resolve(null), 30000));
  const res = await Promise.race([responsePromise, timeout]);

  if (!res) {
    return new Response('php-wasm bridge timeout', { status: 504 });
  }

  // COEP(require-corp)下でも iframe に読み込めるよう CORP/COEP を付与する
  const respHeaders = new Headers(res.headers || {});
  respHeaders.set('Cross-Origin-Resource-Policy', 'same-origin');
  respHeaders.set('Cross-Origin-Embedder-Policy', 'require-corp');

  return new Response(res.body, {
    status: res.status || 200,
    headers: respHeaders,
  });
}
