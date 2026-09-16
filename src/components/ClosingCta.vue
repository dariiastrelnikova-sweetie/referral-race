<script setup>
import { ASHBY_REFERRAL_URL } from '../config.js'
</script>

<template>
  <section class="section closing">
    <div class="wrap">
      <h2>Know someone who belongs on this team?</h2>
      <a class="btn btn-primary cta" :href="ASHBY_REFERRAL_URL" target="_blank" rel="noopener">
        Submit a referral →
      </a>
    </div>
  </section>
</template>

<style scoped>
.closing {
  border-bottom: none;
  padding: 96px 0 80px;
}

h2 {
  font-size: clamp(30px, 5vw, 52px);
  /* No eyebrow and no subhead any more — the heading owns all the spacing
     between the section edge and the button. */
  margin: 0 0 32px;
  max-width: 18ch;
}

/* ~12% up on the shared .btn size — this is the page's closing action, so it
   sits a step above the buttons in the hero. */
.cta {
  font-size: 16px;
  padding: 16px 28px;
}
</style>
