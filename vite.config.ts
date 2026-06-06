import { defineConfig } from 'vite';

// php-wasm はマルチスレッド機能のために SharedArrayBuffer を使う場面がある。
// COOP/COEP を付けて Cross-Origin Isolation を有効化しておく（Laravel では推奨）。
//
// base は環境変数 VITE_BASE で切り替える。
//   - ローカル dev / preview:   未設定 → '/' （これまで通り）
//   - GitHub Pages デプロイ:    '/php-wasm-laravel-demo/' を CI から渡す
// 末尾スラッシュ必須（Vite の仕様）。
export default defineConfig({
  base: process.env.VITE_BASE || '/',
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  preview: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  // .wasm と .dat (php-wasm の icu.dat) を確実にアセットとして扱う。
  // 含めないと Rollup が .dat を JS としてパースして "Unexpected character" で落ちる。
  assetsInclude: ['**/*.wasm', '**/*.dat'],
  optimizeDeps: {
    // php-wasm 本体は wasm の URL 解決があるため事前バンドルから除外しつつ、
    // その CJS 依存(ini 等)は名前付き export を解決させるため事前バンドルに含める。
    exclude: ['@php-wasm/web', '@php-wasm/universal'],
    include: ['ini', 'fflate'],
  },
});
