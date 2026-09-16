<script setup>
import { ASHBY_REFERRAL_URL } from '../config.js'
import { scrollToId } from '../scroll.js'
</script>

<template>
  <header class="site-header">
    <div class="wrap header-inner">
      <a class="logo" href="#top" @click.prevent="scrollToId('top')">
        <span class="dot" aria-hidden="true"></span>
        Referral Race
      </a>

      <nav class="links" aria-label="Sections">
        <a href="#how-it-works" @click.prevent="scrollToId('how-it-works')">How it works</a>
        <a href="#leaderboard" @click.prevent="scrollToId('leaderboard')">Leaderboard</a>
        <a href="#prizes" @click.prevent="scrollToId('prizes')">Prizes</a>
      </nav>

      <a class="btn btn-primary header-cta" :href="ASHBY_REFERRAL_URL" target="_blank" rel="noopener">
        Submit a referral
      </a>
    </div>

    <!--
      Formula 1's "racing line" rule, built from their own path data.

      Their shape is one bar 25344 units long that simply runs off whatever
      edge it meets — fine on their site, but here it has to end. So it is
      split in two: the cap (their detached parallelogram plus the sheared
      start of both bars, cut out of the original paths at x=344) and a
      stretching middle that ends on a straight vertical edge.

      It carries .wrap, so it sits in the same column as the header's own
      content — the inset before the cap and after the bars is the page gutter
      on both sides.
    -->
    <div class="wrap racing-line" aria-hidden="true">
      <svg class="rl-cap" viewBox="0 0 344 200" fill="currentColor">
        <path d="M200 0h128l-200 200h-128Z" />
        <path d="M344 0v91h-91Z" />
        <path d="M144 200h200v-97h-103Z" />
      </svg>
      <span class="rl-bar"></span>
    </div>
  </header>
</template>

<style scoped>
.site-header {
  position: sticky;
  top: 0;
  z-index: 100;
  background: rgba(9, 10, 17, 0.85);
  backdrop-filter: blur(8px);
}

/*
 * The page's only rule — sections no longer carry one. It rides with the
 * sticky header, so it is on screen the whole way down.
 *
 * The cap holds its aspect ratio (height set, width derived from the viewBox)
 * and the middle takes the slack, so the bars are the only part that stretches
 * and the shear never distorts.
 */
.racing-line {
  display: flex;
  align-items: stretch;
  height: 18px;
  color: var(--accent);
  /* .wrap supplies max-width, centring and the gutter. */
  margin-bottom: 0;
}

.rl-cap {
  flex: none;
  height: 100%;
  width: auto;
  display: block;
}

/* The two bars after the cap: 0–91 and 103–200 of the source's 200 units. */
.rl-bar {
  flex: 1;
  min-width: 0;
  background: linear-gradient(
    currentColor 0 45.5%,
    transparent 45.5% 51.5%,
    currentColor 51.5% 100%
  );
}

.header-inner {
  display: flex;
  align-items: center;
  gap: 24px;
  padding-top: 14px;
  padding-bottom: 14px;
}

.logo {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 18px;
  letter-spacing: -0.01em;
  text-decoration: none;
  white-space: nowrap;
}

.dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--accent);
}

.links {
  display: flex;
  gap: 24px;
  margin-left: auto;
  font-size: 14px;
}

.links a {
  color: var(--text-secondary);
  text-decoration: none;
}

.links a:hover {
  color: var(--text-primary);
}

.header-cta {
  padding: 10px 18px;
  font-size: 13px;
}

@media (max-width: 860px) {
  .links {
    display: none;
  }
  .header-cta {
    margin-left: auto;
  }
}

@media (max-width: 460px) {
  .header-cta {
    display: none;
  }
}
</style>
