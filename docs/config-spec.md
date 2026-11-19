# Client config spec v1 (light, story-led, Nigeria-first)

Status: draft for review. Verified by `test/run.ts` (32 config checks: 2 example clients resolve, 21 bad inputs are rejected with exact paths) and `test/assets.test.mjs` (39 asset-pipeline checks on synthetic renders). An earlier version of this line said 31 checks and 22 rejections; that count was wrong.
This supersedes the blueprint's 3D parts (model-viewer, GLB budgets, `viewer`, `finishes`). The folder idea (core + worlds + clients) still stands.

## 1. The product

The tier between a plain template and a heavy Three.js showcase: pages that tell a brand's story with colour, shape and motion, at near-zero runtime cost. "3D look" comes from pre-rendered cutouts with CSS-drawn ground shadows, layered depth, and CSS motion. No 3D runtime. Static Astro, almost no JavaScript, hosted on Netlify.

## 2. How a client site is assembled

```
worlds/<world>/world.json        defaults: motion, typography, shapes, checkout, labels,
                                 sectionDefaults (style per section type), requiredSections
clients/<slug>/client.json       identity, brand palette, contact, checkout, ordered sections with content
clients/<slug>/products.json     shops, menus, pharmacies, wholesalers only (max 60 items)
clients/<slug>/public/           logo.svg, hero + product images (.webp/.avif/.svg only)
config/schema.ts                 the contract (zod, from astro/zod)
config/resolve.ts                world defaults + client overrides -> validated config
```

Merge rules: objects merge deeply, arrays and plain values from the client replace the world's. `sectionDefaults[type]` is merged into every section of that type. Schema defaults fill whatever is still missing. A client file stays small because the world carries the style decisions.

## 3. Field reference

| Block | Notes |
|---|---|
| `schemaVersion`, `slug`, `world` | world is one of: pharmacy, jewellery, fashion, food, wholesale, school |
| `business` | name, tagline (≤100), description (40–160, used for SEO/share), city, state, country (default NG), foundedYear |
| `brand.palette` | bg, surface, ink, primary, secondary, accent (6-digit hex). Contrast is enforced: ink on bg and surface ≥ 4.5, primary on bg ≥ 3 |
| `brand.typography` | system, friendly, playful, editorial, bold, classic. Core maps each to at most 2 subsetted font files, `system` costs 0 bytes |
| `brand.shapes` | none, blobs, waves, dots, stripes, sunburst (inline SVG decor) |
| `brand.stickers` | up to 6 tiny cut-out sprites (≤ 8 KB each) that the `floaters` ambient motion drifts around the page |
| `locale`, `currency` | en-NG, NGN. Prices are whole naira, formatted with Intl, no hard-coded symbol |
| `contact` | whatsapp (digits with country code, no +), phone, email, address, mapUrl (a link, never an iframe), hours, social |
| `checkout` | whatsapp, form (Netlify Forms), transfer (10-digit NUBAN shown on page), payment-link (Paystack/Flutterwave hosted link, no server code), contact-only |
| `motion` | see section 4 |
| `labels` | order / enquire / call / book button text, so components never hard-code copy |
| `sections` | ordered, typed: hero, marquee, story, products, features, journey, programs, gallery, testimonials, faq, booking, cta-band, contact. Each has a `tone` (default, surface, primary, secondary, accent) that sets its background colour, so a colourful page is a rhythm of tones |
| `seo` | ogImage, siteUrl |

Cross-checks that fail the build: exactly one hero and it comes first; a whatsapp CTA or whatsapp checkout needs `contact.whatsapp`; a `call` CTA needs `contact.phone`; a `booking` CTA needs a booking section; every image needs alt text unless marked decorative; image paths must be webp/avif/svg; the world's `requiredSections` must be present.

Products: `tint` (primary, secondary, accent, surface) sets the colour of the tile behind the cut-out; price in naira or `priceOnRequest`; `rxOnly` items must have no price and no pay link (pharmacy); wholesale uses `unit`, `moq`, `priceNote`; unique ids; max 60.

## 4. Motion presets (all CSS, all enhancement-only)

| Setting | Values | Technique |
|---|---|---|
| `intensity` | calm, lively, loud | scales durations, distances and overshoot of every preset |
| `pageTransition` | none, fade, slide, wipe, iris | cross-document `@view-transition` with CSS keyframes (iris = circle clip-path) |
| `hero` | rise, mask-reveal, pop, split-words, parallax-layers | CSS keyframes on load; parallax-layers uses scroll-driven animation |
| `reveal` | none, fade-up, pop, wipe, stagger | scroll-driven `animation-timeline: view()` |
| `ambient` | none, marquee-drift, floaters, gradient-shift | transform/opacity-only loops on a few SVG shapes |
| `hover` | none, lift, wiggle, tilt | transform only |
| `respectSaveData` | true | turns motion off when the phone's data saver is on |

Rules for every preset: animate only `transform`, `opacity`, `clip-path`; wrap in `@supports` and `prefers-reduced-motion`; the page must read perfectly with all motion removed.

Support, checked October 2026: scroll-driven animations ship in Chrome/Edge 115, Safari 26 and Firefox 159. Cross-document view transitions ship in Chrome/Edge 126 and Safari 18.2, while Firefox support is still partial. So page transitions are a bonus on supporting browsers and a normal navigation elsewhere. Not verified: what share of your audience is on old Chrome, Opera Mini or UC Browser. Test on one real low-end Android before locking the presets.

## 5. Weight budget (starting targets, enforced by the validator, not by client config)

These are my proposed starting numbers; calibrate them with throttled Lighthouse runs and a real phone.

- First page load, everything included: ≤ 250 KB transferred
- Hero image ≤ 80 KB; other images ≤ 50 KB at display size, lazy-loaded below the fold
- JavaScript ≤ 10 KB total (order list, form handling only)
- Fonts: system, or at most 2 latin-subset woff2 files
- No iframes, embedded maps, video backgrounds, or third-party scripts
- Whole page with all lazy images ≤ 1 MB

## 6. "3D look" assets (next step)

Transparent-background cutout renders (webp/avif), one hero object per page plus product cutouts. The ground shadow is drawn in CSS (a blurred ellipse under the object), which costs zero image bytes and can scale as the object bobs. `mask` presets (arch, blob, circle, pill, tilt-frame) give shaped images cheaply and suit photos rather than cutouts. Depth comes from layering shapes behind and in front of the cutout and moving them at different speeds on scroll.

## 6b. Asset pipeline

`clients/<slug>/assets.json` lists every image: source name, kind (cutout, sticker, photo), size, KB budget. `scripts/process-assets.mjs <slug>` reads raw renders from `intake/<slug>/raw/`, removes a flat green screen (or uses real transparency if present), trims, centres, resizes, and writes `.webp` under budget. Prompts for the bakery are in `clients/bukky-bakes/ASSET-PROMPTS.md`. Known limit: objects must not contain green.

## 7. Where the skills apply now

- Impeccable: `init` once per world to write PRODUCT.md and DESIGN.md; `audit` per client.
- Emil's skills: `animation-performance`, `remove-animations`, `choreograph`, `mobile-native`, `break-ui`.
- Taste Skill: not for per-client work, and not needed while we are low-weight.
- Skills load in Claude Code in your repo. They matter when we build the core components and motion CSS, not for the config.

## 8. Open decisions

Decided: the bakery is the first test site, and sites stay single-page for now.

Still open: keep jewellery and fashion as separate worlds, or merge them (thrift fabric can sit in either).
