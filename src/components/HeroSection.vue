<script setup>
import StartingLights from './StartingLights.vue'
import { ASHBY_REFERRAL_URL } from '../config.js'
import { scrollToId } from '../scroll.js'
</script>

<template>
  <section id="top" class="hero">
    <div class="wrap hero-inner">
      <StartingLights />
      <h1>
        Your Network Is Your Fastest Car.<br />Refer Like You’re Racing for the
        <span class="accent">Podium</span>.
      </h1>
      <p class="sub">
        Every candidate you refer earns points as they race through the hiring process — phone
        screen, interview, offer. Cross the finish line at the top of the leaderboard, and you’re
        headed to see a Formula 1 Grand Prix.
      </p>
      <div class="ctas">
        <a class="btn btn-primary" :href="ASHBY_REFERRAL_URL" target="_blank" rel="noopener">
          Submit a referral →
        </a>
        <a class="btn btn-ghost" href="#leaderboard" @click.prevent="scrollToId('leaderboard')">
          View leaderboard
        </a>
      </div>
    </div>
  </section>
</template>

<style scoped>
.hero {
  position: relative;
  padding: 96px 0 84px;
  overflow: hidden;
}

/* Matches the full-screen rhythm the other sections use on desktop. */
@media (min-width: 900px) {
  .hero {
    min-height: calc(100dvh - var(--header-h));
    display: flex;
    flex-direction: column;
    justify-content: center;
  }
}

.hero-inner {
  position: relative;
}

h1 {
  font-size: clamp(32px, 4.1vw, 54px);
  /* No eyebrow above it any more, so the heading owns the gap under the lights. */
  margin: 24px 0 20px;
  /* The <br> sets the break; this only stops the line running edge to edge on
     very wide screens. Wide enough for the longer second line so the cap never
     forces a third line with "Podium." orphaned on it. */
  max-width: 42ch;
}

.accent {
  color: var(--accent);
}

.sub {
  max-width: 58ch;
  color: var(--text-secondary);
  font-size: 17px;
  margin-bottom: 34px;
}

.ctas {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

@media (max-width: 760px) {
  .hero {
    padding: 56px 0 52px;
  }
  h1 {
    max-width: none;
  }
  .sub {
    font-size: 16px;
  }
}
</style>
