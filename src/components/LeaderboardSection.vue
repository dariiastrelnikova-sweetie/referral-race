<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { TOP_N } from '../config.js'
import { useLeaderboard } from '../composables/useLeaderboard.js'

const { entries, updatedAt, loading, error, isEmpty, reload } = useLeaderboard()

const expanded = ref(false)

// The sticky "collapse" bar only earns its place once the long list has pushed
// the real toggle off screen — otherwise it just covers content.
const boardEl = ref(null)
const showStickyCollapse = ref(false)

function updateSticky() {
  if (!expanded.value || !boardEl.value) {
    showStickyCollapse.value = false
    return
  }
  const rect = boardEl.value.getBoundingClientRect()
  const vh = window.innerHeight
  // Visible while the table still occupies the screen and its end is below the
  // fold. 0.7 rather than 0.5 so it appears as soon as the list dominates the
  // view, not only once you are deep into it.
  showStickyCollapse.value = rect.top < vh * 0.7 && rect.bottom > vh
}

async function collapse() {
  expanded.value = false
  showStickyCollapse.value = false

  // Wait for the rows to actually go before measuring — otherwise we scroll
  // against the old, much taller table and the browser clamps us somewhere else.
  await nextTick()
  const el = boardEl.value
  if (!el) return

  // Jump back to the top of the table, otherwise collapsing hundreds of rows
  // leaves you stranded in the prizes section with no idea what happened.
  // 'instant' because the page sets scroll-behavior: smooth, and animating a
  // long jump here is slow and disorienting.
  const top = el.getBoundingClientRect().top + window.scrollY - 96
  window.scrollTo({ top: Math.max(0, top), behavior: 'instant' })
}

onMounted(() => {
  window.addEventListener('scroll', updateSticky, { passive: true })
  window.addEventListener('resize', updateSticky)
})
onBeforeUnmount(() => {
  window.removeEventListener('scroll', updateSticky)
  window.removeEventListener('resize', updateSticky)
})

const visibleEntries = computed(() => {
  const list = entries.value
  if (expanded.value || list.length <= TOP_N) return list

  // Never cut a tie group in half. Real standings are full of equal totals, and
  // showing one person on 300 points while hiding two others on 300 points reads
  // as favouritism. Extend past the cutoff until the tied block is complete.
  const cutoffPos = list[TOP_N - 1].pos
  let end = TOP_N
  while (end < list.length && list[end].pos === cutoffPos) end += 1
  return list.slice(0, end)
})

const canExpand = computed(() => entries.value.length > visibleEntries.value.length)

const updatedLabel = computed(() => {
  if (!updatedAt.value) return ''
  // en-GB pins this to 24-hour time regardless of the visitor's locale.
  return updatedAt.value.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
})

function toggleExpanded() {
  expanded.value = !expanded.value
  // The rows render synchronously; measure on the next frame.
  requestAnimationFrame(updateSticky)
}

function podiumClass(pos) {
  if (pos === 1) return 'p1'
  if (pos === 2) return 'p2'
  if (pos === 3) return 'p3'
  return ''
}
</script>

<template>
  <section id="leaderboard" class="section">
    <div class="wrap">
      <div class="section-head">
        <h2>Who’s in the Lead</h2>
        <p>Updates automatically 4 times a day</p>
      </div>

      <!-- Error only replaces the table when we have nothing to show; otherwise
           the last good standings stay up with a warning above them. -->
      <div v-if="error" class="notice" role="alert">
        <p>Couldn’t load the standings just now.</p>
        <button class="btn btn-ghost notice-btn" type="button" @click="reload">Try again</button>
      </div>

      <div v-if="loading" class="board" aria-busy="true">
        <div v-for="i in 6" :key="i" class="skeleton-row">
          <span class="skeleton" style="width: 28px"></span>
          <span class="skeleton" style="width: 40%"></span>
          <span class="skeleton skeleton-right" style="width: 48px"></span>
        </div>
        <p class="visually-hidden">Loading standings…</p>
      </div>

      <!-- When the fetch failed and we have nothing cached, the alert above is
           the whole message — don't also claim the board is empty. -->
      <p v-else-if="isEmpty && !error" class="board empty">No points on the board yet.</p>

      <table v-else-if="!isEmpty" ref="boardEl" class="board">
        <caption class="visually-hidden">
          Referral campaign standings, highest points first.
        </caption>
        <thead>
          <tr>
            <th scope="col" class="col-pos">Pos</th>
            <th scope="col">Racer</th>
            <th scope="col" class="col-pts">Points</th>
          </tr>
        </thead>
        <tbody aria-live="polite">
          <tr v-for="row in visibleEntries" :key="row.name" :class="podiumClass(row.pos)">
            <td class="pos num">
              {{ String(row.pos).padStart(2, '0') }}
              <span v-if="row.tied" class="visually-hidden">tied</span>
            </td>
            <td class="name">{{ row.name }}</td>
            <td class="pts num">{{ row.points }}</td>
          </tr>
        </tbody>
      </table>

      <!-- Always rendered, shown by class. A <Transition> here could be caught
           mid-leave and leave an invisible but still clickable button over the
           table; visibility:hidden rules that out. It used to be hidden from
           assistive tech (aria-hidden + tabindex="-1") to avoid duplicating the
           toggle below — but a control you can see and click has to be reachable
           by keyboard too, so it is a real button and `inert` keeps it out of the
           tree only while it is invisible. -->
      <div class="sticky-collapse" :class="{ 'is-visible': showStickyCollapse }">
        <button
          class="btn btn-ghost sticky-btn"
          type="button"
          :inert="!showStickyCollapse"
          @click="collapse"
        >
          ↑ Show top 10 only
        </button>
      </div>

      <div class="board-foot">
        <button
          v-if="canExpand && !loading && !isEmpty"
          class="btn btn-ghost"
          type="button"
          @click="toggleExpanded"
        >
          {{ expanded ? 'Show top 10 only' : 'Show full leaderboard' }}
        </button>
        <p v-if="updatedLabel && !loading" class="updated num">Updated {{ updatedLabel }}</p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.board {
  width: 100%;
  border-collapse: collapse;
  border: 1px solid var(--line);
  background: var(--surface-raised);
  font-size: 15px;
}

thead th {
  font-weight: 600;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--text-muted);
  text-align: left;
  padding: 12px 20px;
  border-bottom: 1px solid var(--line);
}

tbody td {
  padding: 14px 20px;
  border-bottom: 1px solid var(--line);
}

tbody tr:last-child td {
  border-bottom: none;
}

tbody tr:hover td {
  background: rgba(255, 255, 255, 0.03);
}

.col-pos,
.pos {
  width: 72px;
  color: var(--text-muted);
  font-weight: 700;
}

.col-pts,
.pts {
  width: 120px;
  text-align: right;
  font-weight: 700;
}

.name {
  font-weight: 600;
}

tr.p1 .pos {
  color: var(--podium-gold);
}

tr.p2 .pos {
  color: var(--podium-silver);
}

tr.p3 .pos {
  color: var(--podium-bronze);
}

/* Floats above the long list so you can collapse without scrolling to the end.
   Sits well clear of the viewport edge — at 20px it read as browser chrome and
   was easy to miss. */
.sticky-collapse {
  position: sticky;
  bottom: 48px;
  display: flex;
  justify-content: center;
  /* Not the default `stretch`: the container is height:0, which would squash the
     button's content box to nothing and leave it 28px tall instead of 45px. */
  align-items: center;
  pointer-events: none;
  z-index: 20;
  /* Occupies no layout space — it hovers over the rows above it.
     No negative margin here: height:0 already means it adds nothing to the
     flow, and pulling the next block up by the `bottom` offset dragged
     .board-foot (the "Show full leaderboard" button) on top of the table. */
  height: 0;
}

.sticky-collapse {
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.18s ease, visibility 0.18s;
}

.sticky-collapse.is-visible {
  opacity: 1;
  visibility: visible;
}

/* Opaque and a size up on the inline toggle: it is read against moving table
   rows, so it cannot rely on the page background for contrast. */
.sticky-btn {
  pointer-events: auto;
  background: var(--paper);
  color: var(--ink);
  border-color: var(--paper);
  font-size: 14px;
  padding: 13px 24px;
  border-radius: 999px;
  box-shadow: 0 10px 34px -8px rgba(0, 0, 0, 0.95);
}

.sticky-btn:hover {
  background: var(--grey-100);
  border-color: var(--grey-100);
}

/* first place also gets a thin red edge, the only outline on the board */
tr.p1 td:first-child {
  box-shadow: inset 2px 0 0 var(--accent);
}

.empty {
  padding: 40px 20px;
  color: var(--text-secondary);
}

.board-foot {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-top: 18px;
  flex-wrap: wrap;
}

.updated {
  font-size: 12px;
  color: var(--text-muted);
  margin-left: auto;
}

.notice {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  /* Neutral, not accent-coloured: the house green now means "go", and a green
     failure card reads as success at a glance. */
  border: 1px solid var(--line-strong);
  background: var(--surface-raised);
  padding: 14px 20px;
  margin-bottom: 16px;
  font-size: 14px;
}

.notice-btn {
  padding: 8px 16px;
  font-size: 13px;
}

.skeleton-row {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 16px 20px;
  border-bottom: 1px solid var(--line);
}

.skeleton-row:last-child {
  border-bottom: none;
}

.skeleton {
  display: block;
  height: 12px;
  border-radius: var(--radius);
  background: linear-gradient(
    90deg,
    rgba(255, 255, 255, 0.05),
    rgba(255, 255, 255, 0.12),
    rgba(255, 255, 255, 0.05)
  );
  background-size: 200% 100%;
  animation: shimmer 1.4s linear infinite;
}

.skeleton-right {
  margin-left: auto;
}

@keyframes shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}


@media (max-width: 760px) {
  thead th,
  tbody td {
    padding: 12px 14px;
  }
  .col-pos,
  .pos {
    width: 52px;
  }
  .col-pts,
  .pts {
    width: 80px;
  }
}
</style>
