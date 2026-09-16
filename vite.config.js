import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  // Relative base so the build works at a domain root, on a subpath, or inlined
  // into a single file.
  base: './',
  plugins: [vue()],
  /*
   * Wrap long output lines.
   *
   * Apps Script's HtmlService does not serve the page as-is: it serialises it
   * into document.write() calls inside its sandbox iframe. A single very long
   * line (minified Vue is one 150,000-character line) gets cut partway through,
   * leaving an unterminated string literal, and the page dies with
   * "Failed to execute 'write' on 'Document': Unexpected end of input".
   *
   * Wrapping at 500 characters keeps every line well inside whatever that limit
   * is. Costs a fraction of a percent in size; the bundle still minifies.
   */
  esbuild: { lineLimit: 500 },
  build: {
    // Everything must end up in ONE html file for Apps Script's HtmlService, so:
    // no code splitting, no separate CSS file, assets inlined as data URIs, and
    // a classic IIFE rather than an ES module — module semantics are the kind of
    // thing that quietly misbehaves inside the HtmlService sandbox iframe.
    target: 'es2019',
    // Same document.write() reason as esbuild.lineLimit above: minified CSS is
    // also a single long line. Unminified CSS is a few kB larger and wraps
    // naturally, which is the safer trade here.
    cssMinify: false,
    cssCodeSplit: false,
    assetsInlineLimit: 100 * 1024 * 1024,
    rollupOptions: {
      output: {
        format: 'iife',
        inlineDynamicImports: true,
        entryFileNames: 'app.js',
        assetFileNames: 'app.[ext]',
      },
    },
  },
})
