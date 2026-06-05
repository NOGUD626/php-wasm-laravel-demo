import { bootLaravel, URL_SCOPE, type LaravelHost } from './php-host';
import { registerServiceWorker, startPhpBridge } from './sw-bridge';

const $ = (sel: string) => document.querySelector(sel) as HTMLElement;
const statusEl = $('#status');
const logEl = $('#log') as HTMLPreElement;
const resultEl = $('#result') as HTMLPreElement;
const previewEl = $('#preview') as HTMLIFrameElement;
const bootBtn = $('#boot') as HTMLButtonElement;
const apiButtons = Array.from(
  document.querySelectorAll('button.api'),
) as HTMLButtonElement[];

let host: LaravelHost | null = null;

function setStatus(text: string) {
  statusEl.innerHTML = '状態: <b>' + text + '</b>';
}
function log(line: string) {
  logEl.textContent += '\n' + line;
  logEl.scrollTop = logEl.scrollHeight;
}

async function boot() {
  bootBtn.disabled = true;
  logEl.textContent = '';
  const t0 = performance.now();
  setStatus('php-wasm を起動し Laravel を展開中…');

  try {
    // ① Service Worker を先に登録（iframe のリクエストを横取りするため）
    setStatus('Service Worker を登録中…');
    await registerServiceWorker(log);

    // ② php-wasm を起動し Laravel を展開
    host = await bootLaravel({ onLog: log });

    // ③ SW ↔ PHPRequestHandler のブリッジを開始
    startPhpBridge(host.handler, log);

    // ④ iframe をスコープURLに向ける → 以降はリンク遷移も SW 経由で WASM が応答
    setStatus('iframe を Laravel に接続中…');
    previewEl.src = `${URL_SCOPE}/app`;
    previewEl.classList.remove('hidden');
    const ph = document.getElementById('preview-placeholder');
    if (ph) ph.style.display = 'none';

    apiButtons.forEach((b) => (b.disabled = false));
    const ms = Math.round(performance.now() - t0);
    setStatus('起動完了 ✅（' + ms + 'ms / Laravel 稼働中・iframe 内でページ遷移できます）');
    log(`\n[host] iframe.src = ${URL_SCOPE}/app（リンククリックで遷移可能）`);
  } catch (e: any) {
    log('\n[host] ERROR: ' + (e?.message || String(e)));
    setStatus('エラー ❌（ログ参照）');
    bootBtn.disabled = false;
  }
}

async function callRoute(path: string) {
  if (!host) return;
  resultEl.textContent = 'GET ' + path + ' …';
  try {
    const r = await host.request('GET', path);
    let body = r.text;
    try {
      body = JSON.stringify(JSON.parse(r.text), null, 2);
    } catch {
      /* HTML等はそのまま */
    }
    resultEl.textContent =
      'GET ' + path + '  →  HTTP ' + r.status + '\n\n' + body.slice(0, 4000);
  } catch (e: any) {
    resultEl.textContent =
      'GET ' + path + '  →  失敗: ' + (e?.message || String(e));
  }
}

bootBtn.addEventListener('click', () => void boot());
apiButtons.forEach((b) =>
  b.addEventListener('click', () => callRoute(b.dataset.path!)),
);
