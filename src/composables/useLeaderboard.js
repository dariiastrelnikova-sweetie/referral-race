import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  LEADERBOARD_URL,
  PUBLIC_SHEET_ID,
  PUBLIC_SHEET_TAB,
  REFRESH_INTERVAL_MS,
} from '../config.js'
import mockData from '../mock/leaderboard.json'

/**
 * Four transports, picked automatically in this order:
 *
 *  1. `google.script.run` — when Apps Script is serving the page itself, so the
 *     call is same-origin and already authenticated as the signed-in Solidgate
 *     account. No CORS, no endpoint URL, no secret.
 *  2. the public spreadsheet — for a static build on our own domain, where
 *     there is no google.script.run and the Apps Script endpoint is behind SSO.
 *  3. `fetch(LEADERBOARD_URL)` — a web app deployed with "Anyone" access, if
 *     the Workspace policy ever allows one.
 *  4. the bundled mock — local development with nothing configured.
 */
function hasAppsScript() {
  return typeof google !== 'undefined' && google?.script?.run
}

function viaAppsScript() {
  return new Promise((resolve, reject) => {
    google.script.run
      .withSuccessHandler(resolve)
      // The failure handler receives an Error-ish object, not an Error.
      .withFailureHandler((err) => reject(new Error(err?.message || String(err))))
      .LB_getLeaderboard()
  })
}

/**
 * Reads the published spreadsheet through Google's gviz endpoint, which answers
 * cross-origin (verified: it reflects the request Origin and allows it), so this
 * works from any domain with a plain GET and no key.
 *
 * The response is not JSON: gviz wraps the object in JSONP-style padding — a
 * comment, then `google.visualization.Query.setResponse( … );` — so it has to be
 * unwrapped by hand rather than handed to response.json().
 */
async function viaPublicSheet(id, tab) {
  const url =
    `https://docs.google.com/spreadsheets/d/${encodeURIComponent(id)}/gviz/tq` +
    `?tqx=out:json&headers=1&sheet=${encodeURIComponent(tab)}`

  const response = await fetch(url)
  if (!response.ok) {
    // 404 here almost always means "not shared publicly" rather than "missing".
    throw new Error(`Sheet returned ${response.status} — is it shared with "anyone with the link"?`)
  }

  const text = await response.text()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('Unrecognised response from the sheet')
  const payload = JSON.parse(text.slice(start, end + 1))

  if (payload?.status === 'error') {
    const detail = payload?.errors?.map((e) => e.detailed_message || e.message).join('; ')
    throw new Error(detail || 'The sheet rejected the query')
  }

  // gviz does NOT 404 on an unknown tab name — it quietly answers with the
  // FIRST sheet in the document instead. Without this check a typo in the tab
  // name would render whatever that sheet happens to hold as if it were the
  // standings. Column B being numeric is the cheap, specific signal.
  const cols = payload?.table?.cols ?? []
  if (cols.length < 2 || cols[1]?.type !== 'number') {
    throw new Error(
      `Sheet tab "${tab}" doesn't look like the leaderboard ` +
        `(expected a numeric second column, got "${cols[1]?.type ?? 'nothing'}"). ` +
        'Check the tab name — an unknown one silently returns the first sheet.',
    )
  }

  const rows = payload?.table?.rows ?? []
  const entries = rows.map((row) => ({
    name: row?.c?.[0]?.v ?? '',
    points: row?.c?.[1]?.v,
  }))

  // publish_public.gs stamps the publish time in column C of the first data
  // row, so the page can say when the data was built rather than when this
  // browser happened to ask for it.
  const stamped = rows[0]?.c?.[2]?.v

  return { updatedAt: stamped || undefined, count: entries.length, entries }
}

async function viaFetch(url) {
  // A bare GET on purpose: no custom headers and no credentials, because
  // anything that triggers a CORS preflight fails — Apps Script does not
  // answer OPTIONS requests.
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Endpoint returned ${response.status}`)
  const payload = await response.json()
  if (payload?.error) throw new Error(payload.error)
  return payload
}

/**
 * Assigns standard competition ranking: equal point totals share a position and
 * the next position skips (1, 2, 2, 4). The sheet has a lot of tied totals, so
 * ranking by array index would quietly invent an order that isn't there.
 */
function rank(entries) {
  let lastPoints = null
  let lastPos = 0
  return entries.map((entry, index) => {
    const pos = entry.points === lastPoints ? lastPos : index + 1
    lastPoints = entry.points
    lastPos = pos
    return { ...entry, pos }
  })
}

function markTies(ranked) {
  const counts = new Map()
  ranked.forEach((row) => counts.set(row.pos, (counts.get(row.pos) || 0) + 1))
  return ranked.map((row) => ({ ...row, tied: counts.get(row.pos) > 1 }))
}

function normalise(payload) {
  const raw = Array.isArray(payload?.entries) ? payload.entries : []
  const cleaned = raw
    .map((entry) => ({
      name: String(entry.name ?? '').trim(),
      points: Number(entry.points),
    }))
    .filter((entry) => entry.name !== '' && Number.isFinite(entry.points))
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name))

  return {
    entries: markTies(rank(cleaned)),
    updatedAt: payload?.updatedAt ? new Date(payload.updatedAt) : new Date(),
  }
}

export function useLeaderboard() {
  const entries = ref([])
  const updatedAt = ref(null)
  const error = ref(false)
  // `loading` is only true for the very first load, so a background refresh
  // never blanks the table out from under someone reading it.
  const loading = ref(true)

  let timer = null

  async function load() {
    error.value = false
    try {
      let payload
      if (hasAppsScript()) payload = await viaAppsScript()
      else if (PUBLIC_SHEET_ID) payload = await viaPublicSheet(PUBLIC_SHEET_ID, PUBLIC_SHEET_TAB)
      else if (LEADERBOARD_URL) payload = await viaFetch(LEADERBOARD_URL)
      else payload = mockData

      const parsed = normalise(payload)
      entries.value = parsed.entries
      updatedAt.value = parsed.updatedAt
    } catch (err) {
      // Keep whatever is already on screen; just surface that it may be stale.
      // The technical detail goes to the console — the page shows one plain
      // sentence, because "Unexpected token '<'" helps nobody reading a
      // leaderboard.
      console.error('[leaderboard] load failed', err)
      error.value = true
    } finally {
      loading.value = false
    }
  }

  function refreshIfVisible() {
    if (document.visibilityState === 'visible') load()
  }

  function onVisibilityChange() {
    if (document.visibilityState === 'visible') load()
  }

  onMounted(() => {
    load()
    timer = setInterval(refreshIfVisible, REFRESH_INTERVAL_MS)
    document.addEventListener('visibilitychange', onVisibilityChange)
  })

  onBeforeUnmount(() => {
    if (timer) clearInterval(timer)
    document.removeEventListener('visibilitychange', onVisibilityChange)
  })

  const isEmpty = computed(() => !loading.value && entries.value.length === 0)

  return { entries, updatedAt, loading, error, isEmpty, reload: load }
}
