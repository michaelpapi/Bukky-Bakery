# Bukky Bakes: asset prompt pack (v2)

What changed from v1:
- The hero cake is no longer one picture. It is **5 separate pieces** (stand, 3 tiers, cherry) so they can fall and stack during the 3-second intro.
- **2 products get a turntable** (16 frames of the product turning) so customers can spin them in the product popup.
- Everything else (6 product images, 5 stickers, story photo) is the same as before.

Style: glossy "candy clay" 3D renders on a flat green background, so the script can cut them out. CSS supplies the colour tiles, shapes, motion and ground shadows.

Palette the objects should live in: strawberry pink `#DB2763`, lemon `#FFC93C`, violet `#6C3CE0`, chocolate brown, cream. **No green anywhere on an object** (green is keyed out and would turn transparent).

## What loads when (the budget)

| Group | Files | When it downloads | Worst case |
|---|---|---|---|
| Hero pieces | 5 | with the page | 104 KB |
| Stickers | 5 | with the page | 40 KB |
| Menu images | 6 | as the customer scrolls to the menu | 270 KB |
| Story photo | 1 | as the customer scrolls to it | 60 KB |
| Spin frames | 16 per product | only when a customer opens that product and starts spinning | 256 KB per product |

The page itself (HTML, CSS, one font, one small script) is about 30 to 40 KB. So a customer who only opens the page downloads roughly 180 KB. Real files usually come in well under these limits. Spin frames are skipped completely on Data Saver or a slow connection; those customers see the still picture.

## Workflow

1. Generate each image in ONE chat/session so lighting and style stay consistent. Ask for 2 to 3 variants, keep the one with the cleanest silhouette fully inside the frame.
2. Save as `intake/bukky-bakes/raw/<name>.png` (or .jpg), using the exact names in the tables.
3. Run `npm run assets -- bukky-bakes`. It cuts out the green, trims, resizes, writes `.webp` under the KB budget and prints a report. Add `--strict` to fail on missing files.
4. If your tool can output a true transparent PNG, use that and drop the green-screen sentence from the style block. The script detects real transparency and skips keying.
5. If a render is rejected ("not a green screen"), regenerate, or run it through a background remover (Photoroom, remove.bg, Canva) and save the transparent PNG.

## STYLE block (paste this first, every time)

```
Stylised 3D render in a soft glossy clay and sugar-candy look. Chunky, rounded, toy-like shapes with smooth shiny materials, saturated candy colours (strawberry pink, lemon yellow, lilac violet, chocolate brown, cream), soft studio lighting from the upper left with a gentle rim light, subtle ambient occlusion. One single object, centred, slightly raised three-quarter view, with generous empty margin on all sides. Background: a perfectly flat, uniform pure green (#00FF00) with no gradient, no floor, no horizon, no cast shadow and no vignette. The object itself contains no green. No text, no letters or numbers, no logos, no hands, no people, no plates or tables unless stated. Square 1:1, high resolution.
```

## A. The hero cake (6 images, 5 ship)

The trick: generate ONE whole reference cake first, then ask the tool to give you each part separately from that same picture. That keeps colours, lighting and style identical, which is what makes the pieces look like one cake once they land.

### A1. The reference (not shipped, just the source)

Save it as `ref-hero-cake.png` in the raw folder. The script ignores it. Paste the STYLE block, then:

```
A tall three-tier birthday cake on a footed cake stand. Each tier is a plain cylinder with a flat, smooth top. Tier widths: the bottom tier is widest, the middle tier is about three quarters of its width, the top tier about half of its width. Strawberry-pink buttercream, lemon-yellow drips running down the SIDES of the tiers, lilac-violet piped rosettes around the bottom edge of each tier. Decorations go on the sides only: the top surface of every tier stays plain and smooth so the next tier can sit on it. No sprinkles. One glossy red cherry with a short brown stem on top of the highest tier. The stand is a pale lilac footed cake stand with a thin gold rim, wider than the bottom tier. Camera: straight-on, slightly above (about 15 degrees looking down), the same for the whole picture.
```

If the whole cake looks great, move on. If not, regenerate until it does. Every piece below comes from this picture.

### A2. The pieces

In the same chat, attach the reference picture and paste ONE of these at a time. Each one must keep the same camera angle, lighting and colours. The size does not need to match, the script resizes each piece.

| File | Budget | Prompt (attach the reference first) |
|---|---|---|
| `hero-stand` | 660 px wide, 26 KB | `Using this exact cake as reference, show ONLY the empty pink-lilac footed cake stand. Remove the cake, the tiers and the cherry. Same style, same camera angle, same lighting, same colours. Flat pure green background (#00FF00), no shadow. Nothing on the stand.` |
| `hero-tier-1` | 560 px wide, 30 KB | `Using this exact cake as reference, show ONLY the bottom (widest) tier on its own, with its side drips and rosettes and its plain flat top. Remove the stand, the other tiers and the cherry. Same style, camera angle, lighting and colours. Flat pure green background (#00FF00), no shadow.` |
| `hero-tier-2` | 420 px wide, 24 KB | `Using this exact cake as reference, show ONLY the middle tier on its own, with its side drips and rosettes and its plain flat top. Remove everything else. Same style, camera angle, lighting and colours. Flat pure green background (#00FF00), no shadow.` |
| `hero-tier-3` | 300 px wide, 18 KB | `Using this exact cake as reference, show ONLY the top (smallest) tier on its own, with its side drips and rosettes and its plain flat top. No cherry. Remove everything else. Same style, camera angle, lighting and colours. Flat pure green background (#00FF00), no shadow.` |
| `hero-cherry` | 150 px wide, 6 KB | `Using this exact cake as reference, show ONLY the single glossy red cherry with its short brown stem, nothing else. Same style, lighting and colours. Flat pure green background (#00FF00), no shadow.` |

Each piece should be one clean object, fully inside the frame, with nothing touching the edge.

Notes:
- Sprinkles are drawn by the page, so do not generate them.
- You do not need the pieces to line up perfectly. I place each one with numbers in `client.json`, so if the cake looks a few pixels off after you add them, tell me and I will nudge it. Do not regenerate for that.
- The one thing that does matter: **same camera angle for every piece**. A tier seen from higher up than the one below it will look wrong whatever I do.

## B. Product images (same as v1)

Paste the STYLE block, then the subject line.

| File | Budget | Subject line |
|---|---|---|
| `p-vanilla` | 600×600, 45 KB | A round two-layer vanilla celebration cake with cream-white frosting, soft pink and lemon rosettes around the top edge and one gold star-shaped candle. No writing. |
| `p-choco` | 600×600, 45 KB | A round chocolate fudge cake with glossy dark chocolate ganache dripping over the sides, chocolate curls on top and a single red raspberry. |
| `p-chops` | 600×600, 45 KB | A shallow plain kraft-paper tray packed with Nigerian small chops: golden puff-puff balls, triangular samosas, crisp spring rolls and glazed chicken wings, a few small skewers. The tray has no branding. Camera slightly higher so the food is visible. |
| `p-bread` | 600×600, 45 KB | A long soft loaf of Agege bread with a golden-brown crust, one thick slice cut and leaning against the loaf to show the soft white crumb. |
| `p-pie` | 600×600, 45 KB | A golden flaky Nigerian meat pie, rectangular with crimped edges and a glossy egg-wash top, one bite taken out to show the minced-beef filling. |
| `p-wedding` | 600×600, 45 KB | An elegant four-tier white wedding cake with cascading pastel pink and lilac sugar flowers, thin gold trim and slim pillars between the tiers. |

These are also what customers see in the cart (as small thumbnails) and at the top of the product popup, so they need to read clearly when tiny.

## C. Turntables: the spin in the product popup (2 products)

For this test build only **`p-vanilla`** and **`p-chops`** get a spin. The other four open the popup with the still picture. A turntable is the same product turning once, captured as 16 pictures. The page shows them one after another as the customer drags, so it feels like a 3D object but costs a fraction of a 3D model.

### C1. Make the video

Use any image-to-video tool you have (Kling, Runway, Veo, Hailuo, Luma, Pika). Upload the **raw green-screen render** of the product (the same image you used for `p-vanilla` or `p-chops`) as the first frame, then use this prompt:

```
Locked-off static camera. The object turns smoothly on the spot around its vertical axis, exactly one full 360 degree turn at constant speed over the whole clip, ending exactly where it began so the clip loops. The object keeps its exact shape, size, colours and finish the whole time: no morphing, no zoom, no camera movement, no new objects, no change in lighting. The background stays a flat, uniform pure green (#00FF00) with no floor, no shadow and no vignette. No text.
```

Settings: 5 seconds, no audio, the highest resolution available (720p is enough), square or 16:9, object centred with space around it.

### C2. Check the video before you use it

Scrub through it slowly and check:
- It turns **once** and ends where it started. If it turns a bit more or less, note the seconds where one full turn starts and ends (for example 0.3 and 4.7); I will show you where to put them.
- The shape and colours do not change as it turns. A cake that grows an extra tier at the halfway point is a failed take. Regenerate.
- The green stays flat. If it flickers or drifts to teal, regenerate.
- The object never touches the frame edge.

Expect to try 2 to 4 times. Video tools often wobble on food.

### C3. Process it

1. One-time: install ffmpeg. In PowerShell: `winget install Gyan.FFmpeg`, then close and reopen the terminal.
2. Save the video as `intake/bukky-bakes/raw/spin-vanilla.mp4` and `spin-chops.mp4` (.mov and .webm work too).
3. Run `npm run assets -- bukky-bakes`.

It picks 16 evenly spaced frames, cuts out the green with one shared crop so the object does not jitter, and writes `public/images/spin/vanilla-01.webp` to `vanilla-16.webp`. Each frame is 480×480 and at most 16 KB.

If a turn does not start at 0 and end at the clip's last second, open `clients/bukky-bakes/assets.json` and add `"start"` and `"end"` (in seconds) to that spin entry, for example:
`{ "in": "spin-vanilla", "out": "images/spin/vanilla-{nn}.webp", "kind": "spin", "frames": 16, "start": 0.3, "end": 4.7, "width": 480, "height": 480, "maxKB": 16 }`

### C4. Other ways to get the frames

- **Frames you export yourself.** Put the images in a folder `intake/bukky-bakes/raw/spin-vanilla/` (any names, they are used in alphabetical order, at least 16) and run the same command. No ffmpeg needed.
- **A real 3D model.** Image-to-3D tools (Meshy, Tripo, Hunyuan3D, Rodin) can turn the product picture into a `.glb`. Send me the file and I can add a small script that renders the 16 frames from it. We would still ship the light frames, not the model: your earlier `.glb` files were 2.4 to 4.1 MB each, and a 3D viewer library on top, which is exactly the weight this project is trying to avoid on low-data phones.

### What to expect from spin frames
- 16 frames means a step of about 22 degrees. With easing it feels smooth on a phone, but it is a turn left and right only: no tilting up and down.
- Glossy surfaces can pick up a green tint from the background. The script removes most of it, not all. If the edge of a cake looks green-ish in the result, ask the video tool for "satin finish" and regenerate.

## D. Stickers (small floating sprites, readable at about 80 px)

These now **drop in** during the intro and then float. Use the same style block, then add: "Simple, bold shapes that stay readable when tiny." Budget 160×160, 8 KB each.

| File | Subject line |
|---|---|
| `s-cherry` | A pair of glossy red cherries joined by a stem. (The stem must be brown, not green.) |
| `s-sprinkles` | A small pile of rainbow sprinkles in pink, yellow, violet, white and orange only. |
| `s-cupcake` | A frosted cupcake with a pink swirl, a cherry on top and a violet paper case. |
| `s-donut` | A pink-glazed donut with sprinkles. |
| `s-whisk` | A silver balloon whisk with a violet handle. |

## E. Story photo (not green-screen)

`story-oven`, 800×600, 60 KB. Paste this one alone, without the style block:

```
Warm, cosy bakery kitchen. Close-up of two hands in quilted oven mitts pulling a metal tray of golden-brown pastries out of an oven, a little steam rising, warm orange light, shallow depth of field. Photographic, landscape 4:3. No faces, no text.
```

For a real client, use their own photo here. It is the most believable image on the page.

## F. Optional: logo

For the test only. Paste: "Flat vector wordmark, chunky rounded lowercase letters reading 'bukky bakes' in strawberry pink, a small red cherry sitting on top of the final letter, plain white background, no gradients, no shadows." Then trace to SVG (aim for under 4 KB) and save as `clients/bukky-bakes/public/images/logo.svg`. A plain text wordmark is fine until then.

## Checks before processing

- One object per image, fully inside the frame, clean outline
- No green on the object, no text or letters, no hands
- Same lighting direction across the set
- Hero pieces: same camera angle on all five, no sprinkles, no shadows
- Hero and the six products are all clearly cake, chops, bread or pie at thumbnail size (shrink the image to 100 px and look)
- Spin videos: one full turn, shape and colours never change

## If you would rather download than generate

Look for downloadable 3D models with a CC0 or CC BY licence (Sketchfab has a licence filter), render each to a transparent PNG (in Blender: Render Properties, Film, Transparent; or use a model-viewer screenshot), save into the raw folder with the same names and run the same script. Check the licence per model and keep the credit if it is CC BY.
