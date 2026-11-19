# client-starter

Lightweight, colourful single-page sites for Nigerian SMEs and schools. One Astro core, per-client config.

## Run it
```
npm install
npm run dev
```
Open the address it prints (usually http://localhost:4321). First site: Bukky Bakes (`clients/bukky-bakes`).
With no images yet, the page draws flat placeholders.

## Add the real images
1. Generate the images from `clients/bukky-bakes/ASSET-PROMPTS.md`.
2. Put the raw files in `intake/bukky-bakes/raw/` (names listed in `clients/bukky-bakes/assets.json`).
3. `npm run assets -- bukky-bakes`
4. Reload the page. Placeholders are replaced automatically.

## Other commands
- `CLIENT=bright-stars-academy npm run dev` (PowerShell: `$env:CLIENT="bright-stars-academy"; npm run dev`)
- `npm run test:config`, `npm run test:assets`, `npm run build`

## Deploy (Netlify)
One site per client. Set environment variable `CLIENT=bukky-bakes`. Build settings come from `netlify.toml`.

## Before showing a client
Replace the placeholder WhatsApp number (2348000000000), phone and address in `clients/<slug>/client.json`, then test on a real phone.

`_archive/oro-vesper/` holds the old candle/jewellery skeleton. It is not used by the build.

## Interactive features (v3)
- **Hero intro (~3 s):** stand, tiers and cherry fall and stack, sprinkles rain, stickers drop in. Skipped for reduced-motion and Data Saver. Pieces come from `hero.pieces` in client.json (bottom first).
- **Cake tilt:** the hero cake leans toward the finger/mouse (`src/scripts/hero.ts`). It tilts, it does not fully rotate.
- **Product popup:** tap any card. If the product has `spin` frames (`images/spin/<name>-{nn}.webp`) the popup shows a drag-to-spin turntable; otherwise the still picture. Frames load only when the popup opens. Add `"reverse": true` to the spin block if dragging feels backwards.
- **Cart:** Add / +/- / Remove with thumbnails, saved on the phone, ends in one WhatsApp message listing every item and the total.
- **Date picker:** the "Pick a date" button opens a calendar (rules in `scheduler` in client.json: leadDays, maxDays, closedWeekdays, blockedDates, occasions) then a short form, then WhatsApp.
- Check everything with: `npx tsx test/run.ts`, `node test/assets.test.mjs`, `npx astro build`.
