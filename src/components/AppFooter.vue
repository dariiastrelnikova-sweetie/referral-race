<script setup>
import { CAMPAIGN_END, CAMPAIGN_START, CONTACT } from '../config.js'
</script>

<template>
  <footer>
    <div class="checker" aria-hidden="true"></div>
    <div class="wrap footer-inner">
      <p>Referral campaign runs {{ CAMPAIGN_START }} – {{ CAMPAIGN_END }}.</p>
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
