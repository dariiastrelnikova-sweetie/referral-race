<script setup>
import AppHeader from './components/AppHeader.vue'
import HeroSection from './components/HeroSection.vue'
import HowItWorks from './components/HowItWorks.vue'
import LeaderboardSection from './components/LeaderboardSection.vue'
import PrizesSection from './components/PrizesSection.vue'
import ClosingCta from './components/ClosingCta.vue'
import AppFooter from './components/AppFooter.vue'
</script>

<template>
  <div class="checker" aria-hidden="true"></div>
  <AppHeader />
  <main>
    <HeroSection />
    <HowItWorks />
    <LeaderboardSection />
    <PrizesSection />
    <ClosingCta />
  </main>
  <AppFooter />
</template>
