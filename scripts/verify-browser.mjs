// 検証③: 実ブラウザ(Chrome)で localhost:5173 を開き、起動ボタンを押して
// Laravel がブラウザ内WASMで応答するまでを自動で確かめる。
import puppeteer from 'puppeteer-core';

const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.env.URL || 'http://localhost:5173/';

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox'],
});
const page = await browser.newPage();
page.on('console', (m) => console.log('  [browser]', m.text()));
page.on('pageerror', (e) => console.log('  [pageerror]', e.message));

console.log('[verify-browser] opening', URL);
await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 });

// crossOriginIsolated が true なら COOP/COEP が効いている
const isolated = await page.evaluate(() => self.crossOriginIsolated);
console.log('[verify-browser] crossOriginIsolated =', isolated);

console.log('[verify-browser] clicking boot button ...');
await page.click('#boot');

// 起動完了（status に「起動完了」）を待つ
await page.waitForFunction(
  () => /起動完了/.test(document.querySelector('#status')?.textContent || ''),
  { timeout: 120000 },
);
const status = await page.$eval('#status', (el) => el.textContent);
console.log('[verify-browser] status =', status?.trim());

// /demo を叩いて JSON を取得
await page.click('button.api[data-path="/demo"]');
await page.waitForFunction(
  () => /HTTP 200/.test(document.querySelector('#result')?.textContent || ''),
  { timeout: 60000 },
);
const result = await page.$eval('#result', (el) => el.textContent);
console.log('[verify-browser] /demo result:\n' + result);

// iframe に Laravel welcome が描画されたか
const iframeHasLaravel = await page.evaluate(() => {
  const f = document.querySelector('#preview');
  const doc = f?.contentDocument;
  return !!doc && /Laravel/i.test(doc.documentElement.innerHTML);
});
console.log('[verify-browser] iframe shows Laravel welcome =', iframeHasLaravel);

const ok = /起動完了/.test(status || '') && /Laravel 13/.test(result || '');
await browser.close();
console.log(`\n[verify-browser] ${ok ? 'DONE ✅  Laravel runs in a real browser via WASM.' : 'FAILED ❌'}`);
process.exit(ok ? 0 : 1);
