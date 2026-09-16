<script setup>
import { CAMPAIGN_END, CAMPAIGN_START, CONTACT } from '../config.js'
</script>

<template>
  <footer>
    <div class="checker" aria-hidden="true"></div>
    <div class="wrap footer-inner">
      <!-- No end date set yet — say when it started rather than print a blank
           or a placeholder where the range should be. -->
      <p v-if="CAMPAIGN_END">Referral campaign runs {{ CAMPAIGN_START }} – {{ CAMPAIGN_END }}.</p>
      <p v-else>Referral campaign started {{ CAMPAIGN_START }}.</p>
      <p>Questions → {{ CONTACT }}</p>
    </div>
  </footer>
</template>

<style scoped>
.footer-inner {
  padding: 30px var(--gutter) 50px;
  color: var(--text-muted);
  font-size: 13px;
}
</style>
