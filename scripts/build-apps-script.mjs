/*
 * Folds the Vite build into a single self-contained HTML file that can be pasted
 * straight into the Apps Script project as `index.html`.
 *
 * Apps Script serves one file — it has no place to put /assets/app.js — so the
 * script and stylesheet have to be inlined. The script tag also loses
 * type="module"/crossorigin: the bundle is an IIFE, and module scripts inside
 * the HtmlService sandbox iframe are a needless risk.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')
const outDir = join(dist, 'apps-script')
const outFile = join(outDir, 'index.html')

if (!existsSync(join(dist, 'index.html'))) {
  console.error('No dist/index.html — run `vite build` first.')
  process.exit(1)
}

let html = readFileSync(join(dist, 'index.html'), 'utf8')

// Always a function replacer, never a string — see the note near </body>.
const inlineOne = (tagPattern, resolve) => {
  html = html.replace(tagPattern, (match, href) => {
    const file = join(dist, href.replace(/^\.?\//, ''))
    if (!existsSync(file)) {
      console.warn(`  ! referenced asset not found, left as-is: ${href}`)
      return match
    }
    return resolve(readFileSync(file, 'utf8'))
  })
}

inlineOne(
  /<link[^>]+rel="stylesheet"[^>]+href="([^"]+\.css)"[^>]*>/g,
  (css) => `<style>\n${css}\n</style>`,
)
/*
 * The bundle is base64'd, not inlined as source, and the script tag moves to the
 * end of <body>. Two separate Apps Script hazards force this:
 *
 * 1. HtmlService does not serve the page as-is — it serialises it into
 *    document.write() calls, and it builds that payload with a JavaScript string
 *    replace. So `$&`, `$1`, `$\'` and friends in our code are treated as
 *    REPLACEMENT PATTERNS and substituted away. Minified Vue contains `$&&` and
 *    `"-$1"`; the first is a syntax error, the second would silently break prop
 *    hyphenation. base64 output is [A-Za-z0-9+/=] only, so no `$` survives to be
 *    misread — and no `<`, quotes or backslashes either.
 *
 * 2. An inline classic script runs the moment it is parsed. In <head>, where
 *    Vite puts it, that is before <div id="app"> exists and the app never mounts.
 *
 * The loader appends a real <script> element rather than calling eval, so it
 * works even where eval is refused.
 */
let bundleTag = ''
html = html.replace(/<script[^>]*\ssrc="([^"]+\.js)"[^>]*><\/script>\s*/g, (match, src) => {
  const file = join(dist, src.replace(/^\.?\//, ''))
  if (!existsSync(file)) {
    console.warn(`  ! referenced script not found, left as-is: ${src}`)
    return match
  }
  const b64 = readFileSync(file).toString('base64')
  // Wrapped so no single line is long enough to trip the document.write limit.
  const wrapped = b64.replace(/(.{500})/g, '$1\n')
  bundleTag =
    `<script type="text/plain" id="lb-bundle">\n${wrapped}\n</script>\n` +
    '<script>\n' +
    '(function () {\n' +
    "  var raw = document.getElementById('lb-bundle').textContent.replace(/\\s+/g, '');\n" +
    '  var bin = atob(raw);\n' +
    '  var bytes = new Uint8Array(bin.length);\n' +
    '  for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);\n' +
    "  var code = new TextDecoder('utf-8').decode(bytes);\n" +
    "  var el = document.createElement('script');\n" +
    '  el.textContent = code;\n' +
    '  document.body.appendChild(el);\n' +
    '})();\n' +
    '</script>\n'
  return ''
})

if (!bundleTag) {
  console.error('No bundle script found in dist/index.html — nothing to inline.')
  process.exit(1)
}
if (!html.includes('</body>')) {
  console.error('dist/index.html has no </body> to place the bundle before.')
  process.exit(1)
}
// The replacement MUST be a function — the same `$&` hazard, one level up.
html = html.replace('</body>', () => `${bundleTag}</body>`)

const leftovers = html.match(/(?:src|href)="[^"]*\/?assets\/[^"]+"/g)
if (leftovers) {
  console.error('Some assets were not inlined:', leftovers)
  process.exit(1)
}

mkdirSync(outDir, { recursive: true })
writeFileSync(outFile, html)

const kb = (Buffer.byteLength(html) / 1024).toFixed(1)
console.log(`\n  Apps Script bundle → dist/apps-script/index.html  (${kb} kB)`)
console.log(`  ${html.length} characters — lbCheckIndex() should report exactly this`)
console.log('  Ship it with: npm run deploy\n')
