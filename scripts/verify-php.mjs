// 検証①: php-wasm が「ブラウザなし(Node内のWASM)」で本物のPHPを実行できるか。
// ブラウザ検証は手間がかかるので、まず同じWASMバイナリをNodeで叩いて土台を確かめる。
import { loadNodeRuntime } from '@php-wasm/node';
import { PHP } from '@php-wasm/universal';

const PHP_VERSION = process.env.PHP_VERSION || '8.4';

console.log(`[verify-php] loading php-wasm runtime (PHP ${PHP_VERSION}) ...`);
const t0 = performance.now();
const php = new PHP(
  await loadNodeRuntime(PHP_VERSION, { emscriptenOptions: { processId: 1 } }),
);
const bootMs = Math.round(performance.now() - t0);
console.log(`[verify-php] runtime booted in ${bootMs}ms`);

// 1) バージョン確認: 本当にWASM版PHPが動いているか
const ver = await php.run({
  code: `<?php echo PHP_VERSION . "|" . PHP_OS . "|" . php_sapi_name();`,
});
console.log('[verify-php] PHP_VERSION|PHP_OS|SAPI =', ver.text.trim());

// 2) 拡張モジュールの一覧（SQLite / mbstring / openssl 等が要点）
const ext = await php.run({
  code: `<?php $e = get_loaded_extensions(); sort($e); echo implode(",", $e);`,
});
const exts = ext.text.trim().split(',');
const want = ['pdo_sqlite', 'sqlite3', 'mbstring', 'openssl', 'tokenizer', 'json', 'libxml'];
console.log('[verify-php] loaded extensions count =', exts.length);
for (const w of want) {
  console.log(`  - ${w.padEnd(12)} : ${exts.includes(w) ? 'YES' : 'no'}`);
}

// 3) 簡易HTTPハンドリング（Laravelの前段になる動作確認）
const resp = await php.run({
  code: `<?php
    header('Content-Type: application/json');
    echo json_encode([
      'ok' => true,
      'msg' => 'PHP runs inside WebAssembly',
      'sqlite' => extension_loaded('pdo_sqlite'),
      'time' => date('c'),
    ]);`,
});
console.log('[verify-php] HTTP status =', resp.httpStatusCode);
console.log('[verify-php] headers     =', JSON.stringify(resp.headers));
console.log('[verify-php] body        =', resp.text.trim());

console.log('\n[verify-php] DONE ✅  PHP is executing inside WASM.');
