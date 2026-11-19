#!/usr/bin/env node
/*
  Turn raw generated images into budget-sized web assets.

  usage:  node scripts/process-assets.mjs <client-slug> [--raw intake/<slug>/raw] [--strict]

  reads   clients/<slug>/assets.json     (manifest: name, kind, size, KB budget)
          intake/<slug>/raw/<in>.(png|jpg|jpeg|webp)
  writes  clients/<slug>/public/<out>    (.webp)

  kinds:
    cutout   object on a flat GREEN screen (or a real transparent PNG) -> keyed, trimmed, centred, resized to a square
    sticker  same as cutout, tiny
    piece    like cutout, but trimmed tight and NOT squared: width is set, height follows the object.
             Used for the hero cake's falling parts (stand, tiers, cherry)
    spin     a turntable: one full 360 turn as a video (mp4/mov/webm) OR a folder of frames, in raw/<in>[.mp4|/].
             N frames are picked evenly, keyed, cropped with ONE shared box (so the object does not jitter),
             and written as out pattern with {nn} = 01..N, all at one webp quality.
             Optional manifest fields: frames (default 16), start / end (seconds, to trim the video to one turn).
             Needs ffmpeg on the PATH for videos (Windows: winget install Gyan.FFmpeg, then reopen the terminal).
    logo     a logo on a plain WHITE background -> white becomes transparent, trimmed, width set (height follows)
    photo    plain resize/crop, no keying

  The green key is a colour-difference key calibrated from the image corners, with edge unmixing and
  despill. Limits: objects must not contain green. If a generator ignores "flat green", regenerate or
  supply a real transparent PNG (the key is skipped automatically when alpha already exists).
*/
import sharp from 'sharp';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readdirSync, statSync, mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const slug = args.find((a) => !a.startsWith('--'));
const flag = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const strict = args.includes('--strict');
if (!slug) { console.error('usage: process-assets.mjs <client-slug> [--raw dir] [--strict]'); process.exit(2); }

const rawDir = flag('raw', `intake/${slug}/raw`);
const manifest = JSON.parse(await readFile(`clients/${slug}/assets.json`, 'utf8'));
const outRoot = `clients/${slug}/public`;
const EXT = ['png', 'jpg', 'jpeg', 'webp'];
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));

function cornerColour(data, w, h) {
  const n = Math.min(8, w >> 2, h >> 2); let r = 0, g = 0, b = 0, c = 0;
  for (const [x0, y0] of [[0, 0], [w - n, 0], [0, h - n], [w - n, h - n]])
    for (let y = y0; y < y0 + n; y++) for (let x = x0; x < x0 + n; x++) { const i = (y * w + x) * 4; r += data[i]; g += data[i + 1]; b += data[i + 2]; c++; }
  return [r / c, g / c, b / c];
}

function hasRealAlpha(data) {
  for (let i = 3; i < data.length; i += 4) if (data[i] < 250) return true;
  return false;
}

function greenKey(data, w, h) {
  const [kr, kg, kb] = cornerColour(data, w, h);
  const dK = kg - Math.max(kr, kb);
  if (dK < 80) throw new Error(`corners are rgb(${kr | 0},${kg | 0},${kb | 0}), not a green screen. Regenerate on flat green or supply a transparent PNG.`);
  const t0 = dK * 0.12, t1 = dK * 0.75;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const d = g - Math.max(r, b);
    const a = clamp(1 - (d - t0) / (t1 - t0));
    // below ~8% opacity the unmixing divides by a tiny number and amplifies JPEG noise into wild colours, so drop it
    if (a < 0.08) { data[i] = data[i + 1] = data[i + 2] = 0; data[i + 3] = 0; continue; }
    let rr = r, gg = g, bb = b;
    if (a < 1) { rr = (r - (1 - a) * kr) / a; gg = (g - (1 - a) * kg) / a; bb = (b - (1 - a) * kb) / a; } // unmix the green
    if (gg > Math.max(rr, bb)) gg = Math.max(rr, bb);                                                   // despill
    data[i] = clamp(rr, 0, 255); data[i + 1] = clamp(gg, 0, 255); data[i + 2] = clamp(bb, 0, 255);
    data[i + 3] = Math.round(a * 255);
  }
}

function bbox(data, w, h, thresh = 8) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3] > thresh) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) throw new Error('image is fully transparent after keying');
  return { left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}

async function encode(pngBuf, maxKB) {
  for (let q = 84; q >= 34; q -= 6) {
    const buf = await sharp(pngBuf).webp({ quality: q, alphaQuality: Math.min(100, q + 8), effort: 6 }).toBuffer(); // smartSubsample off: it bled chroma into edge pixels
    if (buf.length <= maxKB * 1024) return { buf, q };
  }
  return { buf: null, q: null };
}

const transparent = { r: 0, g: 0, b: 0, alpha: 0 };
const rows = []; let bad = 0;

/* logo on white: distance from white becomes opacity (anything clearly coloured is fully opaque) */
function whiteToAlpha(data) {
  const T = 110;
  for (let i = 0; i < data.length; i += 4) {
    const d = 255 - Math.min(data[i], data[i + 1], data[i + 2]);
    const a = clamp(d / T);
    if (a < 0.04) { data[i] = data[i + 1] = data[i + 2] = 0; data[i + 3] = 0; continue; }
    if (a < 1) for (let c = 0; c < 3; c++) data[i + c] = clamp(255 - (255 - data[i + c]) / a, 0, 255); // unmix the white
    data[i + 3] = Math.round(a * 255);
  }
}

/* ---------- shared: load an image, key it, return raw RGBA ---------- */
async function loadKeyed(file) {
  const { data, info } = await sharp(file).rotate().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (!hasRealAlpha(data)) greenKey(data, info.width, info.height);
  return { data, w: info.width, h: info.height };
}
const rawPng = (k, box) => sharp(k.data, { raw: { width: k.w, height: k.h, channels: 4 } }).extract(box).png().toBuffer();

/* ---------- spin helpers ---------- */
const VIDEO = ['mp4', 'mov', 'webm', 'mkv', 'm4v'];
function findFfmpeg() {
  const tries = [process.env.FFMPEG, 'ffmpeg'].filter(Boolean);
  for (const t of tries) if (spawnSync(t, ['-version']).status === 0) return t;
  throw new Error('ffmpeg not found. Windows: run "winget install Gyan.FFmpeg", close and reopen the terminal, then retry. Or export the frames yourself into a folder named like the video and rerun.');
}
function videoDuration(ff, file) {
  const r = spawnSync(ff, ['-i', file], { encoding: 'utf8' }); // prints the duration on stderr and exits 1, that is normal
  const m = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(r.stderr || '');
  if (!m) throw new Error(`could not read the length of ${file}`);
  return +m[1] * 3600 + +m[2] * 60 + +m[3];
}
/** returns { files: [N image paths], tmp } for a video or a folder of frames */
function spinFrames(a, n) {
  const asVideo = VIDEO.map((e) => path.join(rawDir, `${a.in}.${e}`)).find(existsSync);
  const asDir = path.join(rawDir, a.in);
  if (asVideo) {
    const ff = findFfmpeg();
    const dur = videoDuration(ff, asVideo);
    const t0 = a.start ?? 0, t1 = a.end ?? dur;
    if (!(t1 > t0)) throw new Error(`bad start/end for ${a.in} (video is ${dur.toFixed(1)}s long)`);
    const tmp = mkdtempSync(path.join(tmpdir(), 'spin-'));
    const files = [];
    for (let i = 0; i < n; i++) { // N evenly spaced stills across ONE turn; the end frame is skipped because it equals the start
      const t = t0 + ((t1 - t0) * i) / n, out = path.join(tmp, `f${String(i).padStart(3, '0')}.png`);
      const r = spawnSync(ff, ['-v', 'error', '-ss', t.toFixed(3), '-i', asVideo, '-frames:v', '1', '-y', out], { encoding: 'utf8' });
      if (r.status !== 0 || !existsSync(out)) throw new Error(`ffmpeg could not read a frame at ${t.toFixed(2)}s: ${r.stderr || ''}`);
      files.push(out);
    }
    return { files, tmp };
  }
  if (existsSync(asDir) && statSync(asDir).isDirectory()) {
    const all = readdirSync(asDir).filter((f) => EXT.includes(f.split('.').pop().toLowerCase())).sort().map((f) => path.join(asDir, f));
    if (all.length < n) throw new Error(`${a.in}/ has ${all.length} images, needs at least ${n}`);
    return { files: Array.from({ length: n }, (_, i) => all[Math.floor((i * all.length) / n)]), tmp: null };
  }
  return null;
}

async function processSpin(a, row) {
  const n = a.frames ?? 16;
  if (!a.out.includes('{nn}')) throw new Error('spin "out" must contain {nn}, e.g. images/spin/vanilla-{nn}.webp');
  if (n < 8 || n > 36) throw new Error('frames must be between 8 and 36');
  const found = spinFrames(a, n);
  if (!found) return false;
  try {
    const keyed = [];
    for (const f of found.files) keyed.push(await loadKeyed(f));
    const dims = new Set(keyed.map((k) => `${k.w}x${k.h}`));
    if (dims.size > 1) throw new Error('frames have different sizes');
    // one shared crop box = union of every frame's box, so the object never jumps between frames
    let u = null;
    for (const k of keyed) { const b = bbox(k.data, k.w, k.h); u = u ? { l: Math.min(u.l, b.left), t: Math.min(u.t, b.top), r: Math.max(u.r, b.left + b.width), b: Math.max(u.b, b.top + b.height) } : { l: b.left, t: b.top, r: b.left + b.width, b: b.top + b.height }; }
    const box = { left: u.l, top: u.t, width: u.r - u.l, height: u.b - u.t };
    const side = Math.round(Math.max(box.width, box.height) * 1.08);
    const pngs = [];
    for (const k of keyed) {
      const cropped = await rawPng(k, box);
      const padded = await sharp({ create: { width: side, height: side, channels: 4, background: transparent } }).composite([{ input: cropped, gravity: 'centre' }]).png().toBuffer();
      pngs.push(await sharp(padded).resize(a.width, a.height, { fit: 'contain', background: transparent }).png().toBuffer());
    }
    // lowest quality step at which EVERY frame fits the budget, so quality does not flicker between frames
    let bufs = null, qUsed = null;
    for (let q = 84; q >= 34 && !bufs; q -= 6) {
      const tryBufs = [];
      for (const p of pngs) tryBufs.push(await sharp(p).webp({ quality: q, alphaQuality: Math.min(100, q + 8), effort: 4 }).toBuffer());
      if (Math.max(...tryBufs.map((b) => b.length)) <= a.maxKB * 1024) { bufs = tryBufs; qUsed = q; }
    }
    if (!bufs) { row.status = 'OVER BUDGET'; bad++; return true; }
    for (let i = 0; i < n; i++) {
      const out = path.join(outRoot, a.out.replace('{nn}', String(i + 1).padStart(2, '0')));
      await mkdir(path.dirname(out), { recursive: true });
      await writeFile(out, bufs[i]);
    }
    const sizes = bufs.map((b) => b.length / 1024);
    Object.assign(row, { status: 'ok', size: `${n} frames, ${sizes.reduce((x, y) => x + y, 0).toFixed(0)} KB total (max ${Math.max(...sizes).toFixed(1)})`, quality: qUsed });
    return true;
  } finally {
    if (found.tmp) rmSync(found.tmp, { recursive: true, force: true });
  }
}

for (const a of manifest.assets) {
  const row = { asset: a.out, status: '', size: '', quality: '', budget: `${a.maxKB} KB${a.kind === 'spin' ? ' per frame' : ''}` };
  rows.push(row);
  if (a.kind === 'spin') {
    try { if (!(await processSpin(a, row))) { row.status = 'MISSING'; if (strict) bad++; } }
    catch (e) { row.status = `ERROR: ${e.message}`; bad++; }
    continue;
  }
  const src = EXT.map((e) => path.join(rawDir, `${a.in}.${e}`)).find(existsSync);
  if (!src) { row.status = 'MISSING'; if (strict) bad++; continue; }
  try {
    let png;
    if (a.kind === 'photo') {
      png = await sharp(src).rotate().resize(a.width, a.height, { fit: 'cover', position: 'attention' }).png().toBuffer();
    } else if (a.kind === 'logo') {
      const { data, info } = await sharp(src).rotate().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      if (!hasRealAlpha(data)) whiteToAlpha(data);
      const k = { data, w: info.width, h: info.height };
      png = await sharp(await rawPng(k, bbox(data, info.width, info.height))).resize({ width: a.width }).png().toBuffer();
    } else if (a.kind === 'piece') {
      const k = await loadKeyed(src);
      png = await sharp(await rawPng(k, bbox(k.data, k.w, k.h))).resize({ width: a.width }).png().toBuffer();
    } else {
      const k = await loadKeyed(src);
      const box = bbox(k.data, k.w, k.h);
      const cropped = await rawPng(k, box);
      const pad = a.kind === 'sticker' ? 0.06 : 0.04;
      const side = Math.round(Math.max(box.width, box.height) * (1 + 2 * pad));
      // sharp runs resize BEFORE composite, so build the padded square first, then resize it in a second pass
      const padded = await sharp({ create: { width: side, height: side, channels: 4, background: transparent } })
        .composite([{ input: cropped, gravity: 'centre' }]).png().toBuffer();
      png = await sharp(padded).resize(a.width, a.height, { fit: 'contain', background: transparent }).png().toBuffer();
    }
    const { buf, q } = await encode(png, a.maxKB);
    if (!buf) { row.status = 'OVER BUDGET'; bad++; continue; }
    const out = path.join(outRoot, a.out);
    await mkdir(path.dirname(out), { recursive: true });
    await writeFile(out, buf);
    Object.assign(row, { status: 'ok', size: `${(buf.length / 1024).toFixed(1)} KB`, quality: q });
  } catch (e) {
    row.status = `ERROR: ${e.message}`; bad++;
  }
}

console.table(rows);
const missing = rows.filter((r) => r.status === 'MISSING').length;
if (missing) console.log(`${missing} asset(s) not supplied yet${strict ? ' (strict mode: counted as failures)' : ''}.`);
process.exit(bad ? 1 : 0);
