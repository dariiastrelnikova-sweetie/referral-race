<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import carUrl from '../assets/car.png'

const LIGHT_COUNT = 5
const lit = ref(0)
const lightsOut = ref(false)
// The car only laps the hero once the lights go green — and never under reduced
// motion, where an endlessly moving object is exactly what the setting is for.
const driving = ref(false)
const timeouts = []

function after(ms, fn) {
  timeouts.push(setTimeout(fn, ms))
}

function runSequence() {
  lit.value = 0
  lightsOut.value = false
  for (let i = 1; i <= LIGHT_COUNT; i += 1) {
    after(300 + i * 300, () => {
      lit.value = i
    })
  }
  after(300 + LIGHT_COUNT * 300 + 700, () => {
    lightsOut.value = true
    driving.value = true
  })
}

onMounted(() => {
  // With reduced motion the rig renders in its resting "lights out" state
  // instead of playing the countdown.
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    lit.value = LIGHT_COUNT
    lightsOut.value = true
    return
  }
  runSequence()
})

onBeforeUnmount(() => timeouts.forEach(clearTimeout))
</script>

<template>
  <div class="rig" aria-hidden="true">
    <!-- Spans the viewport rather than the 1280px content column, so the car
         really does enter and leave at the edges of the screen. The hero clips
         it (overflow: hidden), which is also what keeps 100vw from adding a
         horizontal scrollbar. -->
    <div class="lane">
      <img
        v-if="lightsOut"
        class="car"
        :class="{ 'is-driving': driving }"
        :src="carUrl"
        alt=""
      />
    </div>

    <span
      v-for="i in LIGHT_COUNT"
      :key="i"
      class="light"
      :class="{ on: !lightsOut && i <= lit, out: lightsOut }"
    ></span>
  </div>
</template>

<style scoped>
.rig {
  position: relative;
  display: flex;
  gap: 14px;
  margin-bottom: 28px;
}

.lane {
  position: absolute;
  /* Sits directly above the lights, measured off the rig's own top edge. */
  bottom: calc(100% + 14px);
  left: 50%;
  width: 100vw;
  margin-left: -50vw;
  height: 56px;
  pointer-events: none;
}

.car {
  position: absolute;
  left: 0;
  bottom: 0;
  height: 100%;
  width: auto;
}

/* Starts fully off the left edge (-100% of its own width) and finishes fully
   off the right (left edge parked at the far side of the viewport). Under
   reduced motion the car still renders — it just sits on the grid instead. */
.car.is-driving {
  animation: drive 2.4s linear infinite;
}

@keyframes drive {
  from {
    transform: translateX(-100%);
  }
  to {
    transform: translateX(100vw);
  }
}

.light {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--surface-sunken);
  border: 2px solid var(--line);
  box-shadow: inset 0 0 6px rgba(0, 0, 0, 0.6);
  transition: background 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
}

/*
 * A real starting rig counts down in red and goes dark. With red out of the
 * palette the countdown runs neutral grey and only "lights out" carries the
 * accent — so the green still means go, and nothing else on the page competes
 * with it.
 */
.light.on {
  background: var(--grey-400);
  border-color: var(--grey-500);
  box-shadow: inset 0 0 6px rgba(0, 0, 0, 0.3);
}

.light.out {
  background: var(--accent);
  border-color: var(--accent);
  box-shadow: 0 0 20px 5px var(--accent-glow), inset 0 0 6px rgba(0, 0, 0, 0.2);
}

@media (max-width: 760px) {
  .rig {
    gap: 10px;
  }
  .light {
    width: 16px;
    height: 16px;
  }
  .lane {
    height: 34px;
    bottom: calc(100% + 10px);
  }
}
</style>
