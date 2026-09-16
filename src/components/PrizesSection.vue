<script setup>
/*
 * Layout follows the reference: one feature card taking half the width, and the
 * remaining four sharing the other half in a 2×2 grid.
 *
 * Prize images are picked up from src/assets/prizes/ by filename: p1.*, p2.*
 * and so on. Drop a file in, rebuild, done — no import to edit. A prize with no
 * matching file simply renders without an image, so a missing file never breaks
 * the build. Vite inlines them as data URIs (see assetsInlineLimit in
 * vite.config.js) because Apps Script serves exactly one file.
 */
const images = import.meta.glob('../assets/prizes/*.{png,jpg,jpeg,webp,avif}', {
  eager: true,
  query: '?url',
  import: 'default',
})

const imageFor = (pos) => {
  const key = Object.keys(images).find((path) =>
    path.toLowerCase().includes(`/${pos.toLowerCase()}.`),
  )
  return key ? images[key] : null
}

/*
 * Every prize item carries its own shop link. Where a prize is a single item the
 * whole card is clickable (see .stretch below); where it is two items each one
 * links separately, because a card cannot point at two places at once.
 */
const prizes = [
  {
    pos: 'P1',
    items: [
      {
        label: '2 Formula 1 tickets, 3-day pass',
        url: 'https://ticketing.formula1.com/tickets/en/austria/general-admission-f1-red-bull-ring?cp_landing_source=ticketing.formula1&utm_source=direct&session_ids=507017801',
      },
    ],
  },
  {
    pos: 'P2',
    items: [
      { label: 'Whoop Peak', url: 'https://join.whoop.com/pl/en/' },
      {
        label: 'Polo shirt (official F1 merch store)',
        url: 'https://www.fuelforfans.com/global/en/scuderia-ferrari-f1-puma-baseball-jersey/701238456-PumaBlack.html',
      },
    ],
  },
  {
    pos: 'P3',
    items: [
      {
        label: 'F1 Lego Technic set',
        url: 'https://www.fuelforfans.com/global/en/aston-martin-f1-team-lego-technic-aston-martin-aramco-amr25-f1-car/701247205-Green.html',
      },
    ],
  },
  {
    pos: 'P4',
    items: [
      {
        label: 'Sweater (official F1 merch store)',
        url: 'https://www.fuelforfans.com/global/en/scuderia-ferrari-f1-puma-1%2F4-zip-sweater/701238375-PumaBlack.html',
      },
      {
        label: 'T-shirt (official F1 merch store)',
        url: 'https://www.fuelforfans.com/global/en/mercedes-amg-f1-adidas-car-graphic-t-shirt/701242596-LightGreyHeather.html',
      },
    ],
  },
  {
    pos: 'P5',
    items: [
      {
        label: 'Backpack (official F1 merch store)',
        url: 'https://www.fuelforfans.com/global/en/bmw-lifestyle-backpack/701239607-Navy.html',
      },
    ],
  },
]

const feature = prizes[0]
const rest = prizes.slice(1)
</script>

<template>
  <section id="prizes" class="section">
    <div class="wrap">
      <div class="section-head">
        <h2>This is what you’re racing for</h2>
        <p>The higher you finish, the bigger the prize — simple as that.</p>
      </div>

      <div class="podium">
        <!-- P1: half the width, on its own. -->
        <article class="prize feature p1">
          <div class="shot">
            <img v-if="imageFor(feature.pos)" :src="imageFor(feature.pos)" alt="" />
          </div>
          <div class="detail">
            <span class="pos-tag num">{{ feature.pos }}</span>
            <p class="items">
              <a
                class="stretch"
                :href="feature.items[0].url"
                target="_blank"
                rel="noopener noreferrer"
              >
                {{ feature.items[0].label }}
              </a>
            </p>
          </div>
        </article>

        <!-- P2–P5 share the other half, two across. -->
        <div class="rest">
          <article
            v-for="prize in rest"
            :key="prize.pos"
            class="prize"
            :class="prize.pos.toLowerCase()"
          >
            <div class="shot">
              <img v-if="imageFor(prize.pos)" :src="imageFor(prize.pos)" alt="" loading="lazy" />
            </div>
            <div class="detail">
              <span class="pos-tag num">{{ prize.pos }}</span>
              <p v-if="prize.items.length === 1" class="items">
                <a
                  class="stretch"
                  :href="prize.items[0].url"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {{ prize.items[0].label }}
                </a>
              </p>
              <ul v-else class="items list">
                <li v-for="item in prize.items" :key="item.url">
                  <a :href="item.url" target="_blank" rel="noopener noreferrer">{{ item.label }}</a>
                </li>
              </ul>
            </div>
          </article>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.podium {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  align-items: stretch;
}

.rest {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.prize {
  position: relative;
  background: var(--surface-raised);
  border: 1px solid var(--line);
  border-radius: var(--radius-card);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.prize:hover {
  border-color: var(--line-strong);
}

/* Product shots are shop photos on white, so the image panel is white and the
   card's dark body sits under it — the same split as the reference, where the
   photo owns the top of the card and the caption the bottom. */
.shot {
  background: var(--paper);
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 0;
}

.shot img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}

/* The feature panel fills the column so P1 stands exactly as tall as the 2×2
   grid beside it, as in the reference.
   min-height:0 is what makes that "fills" rather than "dictates": a flex item's
   default `min-height: auto` was flooring this panel at the image's intrinsic
   height (602px for a square shot in a 602px column), so P1 set the height of
   the whole section and left the four small cards padded out with dead space.
   With the floor removed the 2×2 grid decides the height and P1 stretches to
   match it. */
.feature .shot {
  flex: 1;
  min-height: 0;
  position: relative;
}

/* Taking the image out of flow is the other half of it: while it was in flow,
   its intrinsic height (602px for a square shot in a 602px column) still counted
   towards the card's max-content height, which is what .podium measures to size
   the row — so min-height:0 alone changed nothing. */
.feature .shot img {
  position: absolute;
  inset: 0;
}

/* The small cards keep a fixed panel instead — letting them stretch made
   neighbouring shots different heights depending on how long their caption was.
   The caption block absorbs the slack instead.
   Landscape rather than square: these four set the height of the whole section,
   since P1 stretches to match them, and square panels made the block far taller
   than it needed to be. */
.rest .shot {
  flex: none;
  aspect-ratio: 16 / 9;
}

.detail {
  flex: none;
  padding: 12px 16px 14px;
}

.rest .detail {
  flex: 1;
}

.feature .detail {
  padding: 18px 22px 20px;
}

.pos-tag {
  display: block;
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 16px;
  line-height: 1;
  color: var(--text-muted);
  margin-bottom: 5px;
}

.feature .pos-tag {
  font-size: 26px;
  margin-bottom: 8px;
}

.prize.p1 .pos-tag {
  color: var(--podium-gold);
}

.prize.p2 .pos-tag {
  color: var(--podium-silver);
}

.prize.p3 .pos-tag {
  color: var(--podium-bronze);
}

/* The contents ARE the headline of the card, so they carry full-strength text
   rather than the muted secondary grey. */
.items {
  color: var(--text-primary);
  font-size: 13.5px;
  line-height: 1.4;
  margin: 0;
}

.feature .items {
  font-size: 18px;
}

.items.list {
  padding-left: 16px;
}

.items.list li + li {
  margin-top: 4px;
}

.items a {
  color: inherit;
  text-decoration: none;
  border-bottom: 1px solid var(--line-strong);
}

.items a:hover {
  border-bottom-color: var(--accent);
}

/* Single-item prizes: one link, so the whole card is the click target. The
   overlay sits above the card but below nothing else, and the anchor keeps its
   own focus ring for keyboard users. */
.stretch::after {
  content: '';
  position: absolute;
  inset: 0;
}

@media (max-width: 900px) {
  .podium {
    grid-template-columns: 1fr;
  }
  .feature .shot {
    flex: none;
    aspect-ratio: 16 / 9;
  }
  .feature .items {
    font-size: 17px;
  }
}

@media (max-width: 520px) {
  .rest {
    grid-template-columns: 1fr;
  }
  .rest .shot {
    aspect-ratio: 4 / 3;
  }
  /* Everything is one column wide here, so P1 has to out-size the rest on
     height alone — a 16/9 panel would make the top prize the smallest card. */
  .feature .shot {
    aspect-ratio: 1 / 1;
  }
}
</style>
