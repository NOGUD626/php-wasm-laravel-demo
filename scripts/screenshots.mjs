// README/docs 用のスクリーンショットを自動生成する。
// 起動 → 各ページへ遷移しながら docs/ に PNG を保存する。
import puppeteer from 'puppeteer-core';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.env.URL || 'http://localhost:5173/';
const __dirname = dirname(fileURLToPath(import.meta.url));
const DOCS = resolve(__dirname, '..', 'docs');

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  defaultViewport: { width: 1280, height: 900, deviceScaleFactor: 2 },
  args: ['--no-sandbox'],
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('  [pageerror]', e.message));

console.log('[shot] opening', URL);
await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 });

// 起動
console.log('[shot] booting ...');
await page.click('#boot');
await page.waitForFunction(
  () => /起動完了/.test(document.querySelector('#status')?.textContent || ''),
  { timeout: 120000 },
);
// iframe の初期ページ描画を待つ
await page.waitForFunction(
  () => {
    const d = document.querySelector('#preview')?.contentDocument;
    return d && /php-wasm で動く Laravel/.test(d.body?.innerText || '');
  },
  { timeout: 60000 },
);

async function shot(name) {
  const path = resolve(DOCS, name);
  await page.screenshot({ path });
  console.log('[shot] saved', name);
}

async function getFrame() {
  return await (await page.$('#preview')).contentFrame();
}

async function navInIframe(matcher, waitText) {
  const frame = await getFrame();
  await Promise.all([
    page.waitForFunction(
      (t) => {
        const d = document.querySelector('#preview')?.contentDocument;
        return d && new RegExp(t).test(d.body?.innerText || '');
      },
      { timeout: 30000 },
      waitText,
    ),
    frame.evaluate((m) => {
      const a = [...document.querySelectorAll('a')].find((x) => new RegExp(m).test(x.textContent));
      a.click();
    }, matcher),
  ]);
  await new Promise((r) => setTimeout(r, 600));
}

// 1) 起動完了（ホスト全体）
await shot('screenshot-ready.png');

// 2) /demo を叩いて result に JSON を出した状態
await page.click('button.api[data-path="/demo"]');
await page.waitForFunction(
  () => /HTTP 200/.test(document.querySelector('#result')?.textContent || ''),
  { timeout: 30000 },
);
await new Promise((r) => setTimeout(r, 400));
await shot('screenshot-demo.png');

// 3) ユーザー一覧へ遷移 → 1人追加 → 一覧
await navInIframe('ユーザー一覧', 'ユーザー一覧（SQLite）');
await navInIframe('テストユーザーを1人追加', 'テスト太郎1');
await shot('screenshot-users.png');

// 4) カウンタ
await navInIframe('カウンタ', 'このページを開いた回数');
await shot('screenshot-counter.png');

await browser.close();
console.log('\n[shot] DONE ✅  docs/ に4枚保存しました。');
