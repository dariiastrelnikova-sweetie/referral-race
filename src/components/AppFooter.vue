<script setup>
import { CAMPAIGN_END, CAMPAIGN_START, CONTACT } from '../config.js'
</script>

<template>
  <footer>
    <div class="checker" aria-hidden="true"></div>
    <div class="wrap footer-inner">
      <!-- No end date set yet — give the start rather than print a blank or a
           placeholder. "runs from" rather than "started" because the date can
           be in the future: this line has to read correctly on both sides of
           it. -->
      <p v-if="CAMPAIGN_END">Referral campaign runs {{ CAMPAIGN_START }} – {{ CAMPAIGN_END }}.</p>
      <p v-else>Referral campaign runs from {{ CAMPAIGN_START }}.</p>
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
