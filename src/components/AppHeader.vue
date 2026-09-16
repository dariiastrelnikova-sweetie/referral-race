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
  </header>
</template>

<style scoped>
.site-header {
  position: sticky;
  top: 0;
  z-index: 100;
  background: rgba(0, 0, 0, 0.85);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid var(--line);
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
  background: var(--paint-red);
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
