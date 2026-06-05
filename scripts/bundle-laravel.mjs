// ブラウザ用ホストが読み込む laravel-app.zip を生成する。
// ブラウザ内 VFS に展開する前提なので、実行に不要なもの(tests/docs/.git等)は削って軽くする。
import { zipSync } from 'fflate';
import { readFileSync, writeFileSync, statSync, readdirSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join, relative, sep } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SRC = join(ROOT, 'laravel-app');
const OUT_DIR = join(ROOT, 'public');
const OUT = join(OUT_DIR, 'laravel-app.zip');

// 除外パターン（実行に不要 or 再生成される）
const EXCLUDE_DIRS = new Set(['.git', 'node_modules', 'tests', 'test', 'Tests', 'docs', 'doc', '.github']);
const EXCLUDE_REL_PREFIX = ['storage/logs', 'storage/framework/cache', 'bootstrap/cache'];
const EXCLUDE_EXT = ['.md', '.dist', '.lock'];

const files = {};
let count = 0;
let bytes = 0;

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    const rel = relative(SRC, abs).split(sep).join('/');
    const st = statSync(abs);
    if (st.isDirectory()) {
      if (EXCLUDE_DIRS.has(name)) continue;
      walk(abs);
    } else {
      if (EXCLUDE_REL_PREFIX.some((p) => rel.startsWith(p))) continue;
      if (EXCLUDE_EXT.some((e) => rel.endsWith(e))) continue;
      files[rel] = readFileSync(abs);
      count++;
      bytes += st.size;
    }
  }
}

console.log('[bundle] zipping', SRC);
walk(SRC);
// SQLite DB は空でも必要。空ログ置き場も Laravel が要求するので最小限プレースホルダを入れる。
files['storage/logs/.gitkeep'] = new Uint8Array();
files['bootstrap/cache/.gitkeep'] = new Uint8Array();

const zipped = zipSync(files, { level: 6 });
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT, zipped);

const mb = (n) => (n / 1024 / 1024).toFixed(1) + 'MB';
console.log(`[bundle] files=${count}  raw=${mb(bytes)}  zip=${mb(zipped.length)}`);
console.log('[bundle] wrote', relative(ROOT, OUT));
