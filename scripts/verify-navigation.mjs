// 検証④: 実ブラウザで起動後、iframe 内のリンクをクリックして
// 「ページ遷移」が Service Worker 経由で WASM の Laravel に中継され動くことを確かめる。
import puppeteer from 'puppeteer-core';

const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.env.URL || 'http://localhost:5173/';

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox'],
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('  [pageerror]', e.message));

console.log('[nav] opening', URL);
await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 });

console.log('[nav] booting ...');
await page.click('#boot');
await page.waitForFunction(
  () => /起動完了/.test(document.querySelector('#status')?.textContent || ''),
  { timeout: 120000 },
);

// iframe(プレビュー)のフレームを取得し、初期ページ(/laravel/app)を待つ
async function getFrame() {
  const handle = await page.$('#preview');
  return await handle.contentFrame();
}
await page.waitForFunction(
  () => {
    const f = document.querySelector('#preview');
    const d = f?.contentDocument;
    return !!d && /php-wasm で動く Laravel/.test(d.body?.innerText || '');
  },
  { timeout: 60000 },
);
let frame = await getFrame();
console.log('[nav] iframe initial url =', frame.url());
console.log('[nav] iframe h2 =', await frame.$eval('h2', (e) => e.textContent));

// 1) ナビの「ユーザー一覧(DB)」へ遷移
console.log('[nav] click → ユーザー一覧(DB)');
await Promise.all([
  page.waitForFunction(
    () => {
      const d = document.querySelector('#preview')?.contentDocument;
      return d && /ユーザー一覧（SQLite）/.test(d.body?.innerText || '');
    },
    { timeout: 30000 },
  ),
  frame.evaluate(() => {
    const a = [...document.querySelectorAll('nav a')].find((x) => /ユーザー一覧/.test(x.textContent));
    a.click();
  }),
]);
frame = await getFrame();
console.log('[nav] after click url =', frame.url());

// 2) 「テストユーザーを1人追加」→ redirect 後に行が増える
console.log('[nav] click → ＋ テストユーザーを1人追加（INSERT→redirect）');
await Promise.all([
  page.waitForFunction(
    () => {
      const d = document.querySelector('#preview')?.contentDocument;
      return d && /テスト太郎1/.test(d.body?.innerText || '');
    },
    { timeout: 30000 },
  ),
  frame.evaluate(() => {
    const a = [...document.querySelectorAll('a')].find((x) => /テストユーザーを1人追加/.test(x.textContent));
    a.click();
  }),
]);
frame = await getFrame();
const usersText = await frame.$eval('table', (t) => t.innerText.replace(/\s+/g, ' '));
console.log('[nav] users table =', usersText);

// 3) カウンタ(セッション)で +1 が効くか
console.log('[nav] click → カウンタ(セッション)');
await Promise.all([
  page.waitForFunction(
    () => {
      const d = document.querySelector('#preview')?.contentDocument;
      return d && /このページを開いた回数/.test(d.body?.innerText || '');
    },
    { timeout: 30000 },
  ),
  frame.evaluate(() => {
    const a = [...document.querySelectorAll('nav a')].find((x) => /カウンタ/.test(x.textContent));
    a.click();
  }),
]);
frame = await getFrame();
const c1 = await frame.$eval('b', (e) => e.textContent);
await Promise.all([
  page.waitForFunction(() => true, { timeout: 5000 }).catch(() => {}),
  frame.evaluate(() => document.querySelector('.btn').click()),
]);
await new Promise((r) => setTimeout(r, 1500));
frame = await getFrame();
const c2 = await frame.$eval('b', (e) => e.textContent);
console.log(`[nav] counter: ${c1} → ${c2}`);

const finalUrl = frame.url();
const ok =
  finalUrl.includes('/laravel/app/counter') &&
  /テスト太郎1/.test(usersText) &&
  Number(c2) === Number(c1) + 1;

await browser.close();
console.log(`\n[nav] ${ok ? 'DONE ✅  iframe 内のページ遷移・DB更新・セッションが WASM 経由で動作。' : 'FAILED ❌'}`);
process.exit(ok ? 0 : 1);
