<script setup>
/*
 * Layout follows the reference: centred section head, then evenly gapped
 * rounded cards, each led by a line icon. The reference is a pale yellow
 * scheme; here the same structure runs on the campaign's black with green as
 * the accent, so it stays inside the brand palette.
 *
 * Icons are inline SVG (stroke: currentColor) rather than an icon font — the
 * whole site ships as one Apps Script HTML file, so a webfont would be another
 * payload to inline for three glyphs.
 */
const checkpoints = [
  {
    num: '01',
    title: 'Phone screen',
    body: 'Your referral clears the first conversation with the team.',
    points: 20,
    icon: 'phone',
  },
  {
    num: '02',
    title: 'HM interview',
    body: 'They move into the hiring manager round.',
    points: 30,
    icon: 'people',
  },
  {
    num: '03',
    title: 'Offer accepted',
    body: 'They join the team. Chequered flag.',
    points: 50,
    icon: 'flag',
  },
]
</script>

<template>
  <section id="how-it-works" class="section">
    <div class="wrap">
      <div class="section-head centred">
        <span class="eyebrow">How scoring works</span>
        <h2>Three checkpoints. Three payouts.</h2>
        <p>
          Points are added automatically each time your referral moves to the next hiring stage —
          the board updates 4 times a day.
        </p>
      </div>

      <ol class="track">
        <li v-for="cp in checkpoints" :key="cp.num" class="checkpoint">
          <span class="icon" aria-hidden="true">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <template v-if="cp.icon === 'phone'">
                <rect x="6" y="2" width="12" height="20" rx="2.5" />
                <path d="M10.5 18.5h3" />
              </template>
              <template v-else-if="cp.icon === 'people'">
                <circle cx="9" cy="8" r="3.2" />
                <path d="M3.5 19.5a5.5 5.5 0 0 1 11 0" />
                <path d="M16 5.6a3.2 3.2 0 0 1 0 6.3" />
                <path d="M17.5 14.6a5.5 5.5 0 0 1 3 4.9" />
              </template>
              <template v-else>
                <path d="M5 21V3.8" />
                <path d="M5 4.2h13l-2.6 4 2.6 4H5z" />
              </template>
            </svg>
          </span>

          <span class="num-label num">Checkpoint {{ cp.num }}</span>
          <h3>{{ cp.title }}</h3>
          <p>{{ cp.body }}</p>
          <p class="points num">+{{ cp.points }} <small>points</small></p>
        </li>
      </ol>
    </div>
  </section>
</template>

<style scoped>
/* The shared .section-head is left-aligned and capped at 640px; this section
   centres it instead, matching the reference layout. */
.centred {
  /* Wider than the shared 640px so "Three checkpoints. Three payouts." holds a
     single line on desktop, as in the reference. */
  max-width: 760px;
  margin-left: auto;
  margin-right: auto;
  margin-bottom: 56px;
  text-align: center;
}

/* This section inverts the usual head hierarchy: the label leads and the
   headline sits under it at a quieter size. */
.centred .eyebrow {
  font-size: 15px;
  letter-spacing: 0.14em;
  color: var(--text-secondary);
}

.centred h2 {
  font-size: clamp(22px, 2.4vw, 30px);
  margin: 14px 0 12px;
}

.centred p {
  font-size: 16px;
}

.track {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  /* Gapped cards, not the 1px seam grid the section used before. */
  gap: 24px;
}

.checkpoint {
  background: var(--surface-raised);
  border: 1px solid var(--line);
  border-radius: var(--radius-card);
  padding: 38px 34px 34px;
  display: flex;
  flex-direction: column;
}

.icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  border-radius: 12px;
  background: var(--green-dim);
  color: var(--green-bright);
  margin-bottom: 28px;
}

.icon svg {
  width: 27px;
  height: 27px;
}

.num-label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--green-bright);
  margin-bottom: 10px;
}

h3 {
  font-size: 27px;
  margin-bottom: 12px;
}

.checkpoint p:not(.points) {
  color: var(--text-secondary);
  font-size: 16px;
  flex: 1;
}

.points {
  flex: none;
  margin-top: 28px;
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 38px;
  line-height: 1;
  color: var(--green-bright);
}

.points small {
  font-family: var(--font-body);
  font-weight: 400;
  font-size: 14px;
  color: var(--text-secondary);
  margin-left: 7px;
}

@media (max-width: 860px) {
  .track {
    grid-template-columns: 1fr;
    gap: 14px;
  }
  /* The desktop padding is a third of a phone's width — pull it back in. */
  .checkpoint {
    padding: 28px 22px 24px;
  }
  .centred {
    margin-bottom: 36px;
  }
  h3 {
    font-size: 23px;
  }
  .points {
    font-size: 32px;
  }
}
</style>
