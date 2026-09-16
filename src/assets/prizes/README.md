# Prize images

Files here are picked up automatically by `PrizesSection.vue` through
`import.meta.glob` — **the filename is the wiring**. A file named `p1.*` becomes
the image for position P1, `p2.*` for P2, and so on. Drop a file in, rebuild,
done; there is no import to edit.

Accepted extensions: `.png`, `.jpg`, `.jpeg`, `.webp`, `.avif`.

A position with no matching file simply renders without an image, so a missing
file never breaks the build.

## Keep them small

Vite inlines these as data URIs (`assetsInlineLimit` in `vite.config.js`),
because Apps Script serves the whole site as a single HTML file — there is no
second request for an asset. Base64 adds about 33% on top of the file size, so
every kilobyte here costs ~1.33 kB in the deployed page.

Current recipe (source images were 1800×1800 white-background product shots):

```bash
# P1 is the large feature card
sips -s format jpeg -s formatOptions 60 -Z 680 tickets.png --out p1.jpg
# P2–P5 sit in the 2×2 grid
sips -s format jpeg -s formatOptions 60 -Z 420 lego.png --out p3.jpg
```

That lands the whole set around 150 kB.
