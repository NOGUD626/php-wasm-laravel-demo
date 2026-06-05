import { defineConfig } from 'vite';

// php-wasm はマルチスレッド機能のために SharedArrayBuffer を使う場面がある。
// COOP/COEP を付けて Cross-Origin Isolation を有効化しておく（Laravel では推奨）。
export default defineConfig({
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
  // .wasm を確実にアセットとして扱う
  assetsInclude: ['**/*.wasm'],
  optimizeDeps: {
    // php-wasm 本体は wasm の URL 解決があるため事前バンドルから除外しつつ、
    // その CJS 依存(ini 等)は名前付き export を解決させるため事前バンドルに含める。
    exclude: ['@php-wasm/web', '@php-wasm/universal'],
    include: ['ini', 'fflate'],
  },
});
