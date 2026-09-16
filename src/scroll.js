/**
 * Scrolls to a section by id.
 *
 * Plain `href="#id"` mostly works, but the page is served inside the Apps Script
 * HtmlService sandbox iframe, where fragment navigation resolves against the
 * iframe's own googleusercontent URL and can bail out. Doing it in JS keeps the
 * behaviour identical in both places. The href stays on the element for
 * keyboard, middle-click and screen-reader semantics.
 */
export function scrollToId(id) {
  const target = document.getElementById(id)
  if (!target) return
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' })
}
