// Builds synthetic "AI renders" from the real manifest (green screen + JPEG artefacts, one real-alpha PNG, one photo,
// a folder of turntable frames, and a turntable VIDEO when ffmpeg exists), runs the pipeline and checks the outputs.
// Run from the repo root.
import sharp from 'sharp';
import { mkdir, rm, copyFile, readFile, stat, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { createHash } from 'node:crypto';

// Uses a throwaway client so it can NEVER touch a real client's raw renders or processed images.
const slug = '_fixture';
const raw = `intake/${slug}/raw`;
const cleanup = async () => { await rm(`intake/${slug}`, { recursive: true, force: true }); await rm(`clients/${slug}`, { recursive: true, force: true }); };
await cleanup();
await mkdir(raw, { recursive: true });
await mkdir(`clients/${slug}`, { recursive: true });
await copyFile('clients/bukky-bakes/assets.json', `clients/${slug}/assets.json`); // same budgets as the real manifest
const manifest = JSON.parse(await readFile(`clients/${slug}/assets.json`, 'utf8'));

const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;

const cake = (bg, shift = 0) => `<svg xmlns="http://www.w3.org/2000/svg" width="1536" height="1536">
  ${bg ? `<rect width="100%" height="100%" fill="${bg}"/>` : ''}
  <defs><radialGradient id="g" cx="35%" cy="30%"><stop offset="0" stop-color="#ff8fb3"/><stop offset="1" stop-color="#e8336d"/></radialGradient></defs>
  <rect x="330" y="760" width="880" height="420" rx="40" fill="url(#g)"/>
  <ellipse cx="770" cy="760" rx="440" ry="120" fill="#ffc93c"/>
  <circle cx="770" cy="620" r="70" fill="#c1121f"/>
  <ellipse cx="740" cy="595" rx="22" ry="12" fill="#ffffff" opacity="0.7"/>
  <ellipse cx="${520 + shift}" cy="900" rx="90" ry="30" fill="#ffffff" opacity="0.35"/>
</svg>`;

const make = async (file, svg, size, ext) => {
  let img = sharp(Buffer.from(svg)).resize(size, size).blur(0.7);
  img = ext === 'jpg' ? img.jpeg({ quality: 80 }) : img.png();
  await img.toFile(path.join(raw, `${file}.${ext}`));
};
// a "turntable": the highlight slides across the cake and the cake swings a little, so frames really differ
const spinFrame = (i, n) => cake('#22dd33', Math.round(300 * Math.sin((i / n) * Math.PI * 2)));

const spins = manifest.assets.filter((a) => a.kind === 'spin');
let videoSpin = null;
for (const a of manifest.assets) {
  if (a.kind === 'photo') {
    await sharp({ create: { width: 2000, height: 1500, channels: 3, background: '#d98a3d' } })
      .composite([{ input: Buffer.from('<svg width="2000" height="1500"><circle cx="1000" cy="700" r="500" fill="#f2c36b"/></svg>') }])
      .jpeg().toFile(path.join(raw, `${a.in}.jpg`));
  } else if (a.kind === 'spin') {
    if (a === spins[0]) { // first spin: a folder of 24 frames (more than needed, the script must pick 16 evenly)
      await mkdir(path.join(raw, a.in), { recursive: true });
      for (let i = 0; i < 24; i++) await make(`${a.in}/f${String(i).padStart(3, '0')}`, spinFrame(i, 24), 720, 'jpg');
    } else if (hasFfmpeg) { // other spins: a real mp4 (3 s, 12 fps) so the ffmpeg path is exercised too
      videoSpin = a;
      const tmp = path.join(raw, '_v'); await mkdir(tmp, { recursive: true });
      for (let i = 0; i < 36; i++) await make(`_v/f${String(i).padStart(3, '0')}`, spinFrame(i, 36), 720, 'png');
      const r = spawnSync('ffmpeg', ['-v', 'error', '-framerate', '12', '-i', path.join(tmp, 'f%03d.png'), '-pix_fmt', 'yuv420p', '-y', path.join(raw, `${a.in}.mp4`)]);
      if (r.status !== 0) throw new Error('could not build the test video');
      await rm(tmp, { recursive: true, force: true });
    } else { // no ffmpeg on this machine: fall back to a folder so the run is still complete
      await mkdir(path.join(raw, a.in), { recursive: true });
      for (let i = 0; i < 16; i++) await make(`${a.in}/f${String(i).padStart(3, '0')}`, spinFrame(i, 16), 720, 'jpg');
    }
  } else if (a.in === 'hero-stand') await make(a.in, cake(null), 1536, 'png');          // real transparency: the key must be skipped
  else if (a.kind === 'sticker') await make(a.in, cake('#1fd035'), 512, 'png');
  else if (a.kind === 'logo') await make(a.in, cake('#ffffff'), 1024, 'png');                // logos come on plain white
  else await make(a.in, cake('#22dd33'), 1536, 'jpg');
}

const run = spawnSync('node', ['scripts/process-assets.mjs', slug, '--strict'], { encoding: 'utf8' });
console.log(run.stdout); if (run.stderr) console.error(run.stderr);

let failed = run.status === 0 ? 0 : 1;
if (failed) console.log('FAIL  pipeline exited non-zero');
const ok = (n, c, d = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${d ? '  -> ' + d : ''}`); if (!c) failed++; };

async function alphaChecks(f, label, centreY = 0.62) {
  const { data, info } = await sharp(f).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const at = (x, y) => data[(y * info.width + x) * 4 + 3];
  ok(`${label}: corners transparent, centre opaque`, at(1, 1) === 0 && at(info.width - 2, info.height - 2) === 0 && at(info.width >> 1, Math.round(info.height * centreY)) > 240);
  // visible fringe = edge pixels that are at least 25% opaque and clearly green-tinted
  let edge = 0, green = 0;
  for (let i = 0; i < data.length; i += 4) { const al = data[i + 3]; if (al >= 64 && al < 255) { edge++; if (data[i + 1] > Math.max(data[i], data[i + 2]) + 12) green++; } }
  ok(`${label}: no visible green fringe`, edge === 0 || green / edge < 0.005, `${green}/${edge}`);
}

for (const a of manifest.assets) {
  if (a.kind === 'spin') {
    const dir = path.dirname(`clients/${slug}/public/${a.out}`);
    const base = path.basename(a.out).replace('{nn}.webp', '');
    const files = (await readdir(dir)).filter((f) => f.startsWith(base) && f.endsWith('.webp')).sort();
    ok(`${a.in}: ${a.frames} frames written, numbered 01..${a.frames}`, files.length === a.frames && files[0] === `${base}01.webp` && files.at(-1) === `${base}${String(a.frames).padStart(2, '0')}.webp`, `${files.length} files${a.in === videoSpin?.in ? ' (from mp4)' : ' (from folder)'}`);
    const metas = [], sizes = [], bufs = [];
    for (const f of files) { const p = path.join(dir, f); metas.push(await sharp(p).metadata()); sizes.push((await stat(p)).size); bufs.push(createHash('md5').update(await sharp(p).raw().toBuffer()).digest('hex')); }
    ok(`${a.in}: every frame ${a.width}x${a.height} webp ≤ ${a.maxKB} KB`, metas.every((m) => m.format === 'webp' && m.width === a.width && m.height === a.height) && sizes.every((s) => s <= a.maxKB * 1024), `max ${(Math.max(...sizes) / 1024).toFixed(1)} KB`);
    ok(`${a.in}: frames actually differ (it turns)`, new Set(bufs).size > a.frames / 2);
    await alphaChecks(path.join(dir, files[0]), `${a.in} frame 1`);
    await alphaChecks(path.join(dir, files[Math.floor(files.length / 2)]), `${a.in} middle frame`);
    continue;
  }
  const f = `clients/${slug}/public/${a.out}`;
  const meta = await sharp(f).metadata();
  const { size } = await stat(f);
  const fixedW = a.kind === 'piece' || a.kind === 'logo';
  const dimsOk = fixedW ? meta.width === a.width && meta.height > 0 : meta.width === a.width && meta.height === a.height;
  ok(`${a.in}: ${meta.width}x${meta.height} webp ≤ ${a.maxKB} KB${fixedW ? ' (width fixed, height follows)' : ''}`, meta.format === 'webp' && dimsOk && size <= a.maxKB * 1024, `${(size / 1024).toFixed(1)} KB`);
  if (a.kind === 'photo') { ok(`${a.in}: no alpha needed`, true); continue; }
  await alphaChecks(f, a.in, fixedW ? 0.5 : 0.62);
}

// negative: an image that is NOT on green must be rejected with a clear message
await sharp({ create: { width: 800, height: 800, channels: 3, background: '#ffffff' } }).png().toFile(path.join(raw, 'p-pie.png'));
await rm(path.join(raw, 'p-pie.jpg'));
const bad = spawnSync('node', ['scripts/process-assets.mjs', slug], { encoding: 'utf8' });
ok('rejects a white-background render with a helpful message', bad.status === 1 && /not a green screen/.test(bad.stdout + bad.stderr));

// negative: a spin whose out pattern lacks {nn} must be rejected clearly
const broken = { assets: [{ in: spins[0].in, out: 'images/spin/x.webp', kind: 'spin', frames: 16, width: 480, height: 480, maxKB: 16 }] };
await (await import('node:fs/promises')).writeFile(`clients/${slug}/assets.json`, JSON.stringify(broken));
const bad2 = spawnSync('node', ['scripts/process-assets.mjs', slug], { encoding: 'utf8' });
ok('rejects a spin out pattern without {nn}', bad2.status === 1 && /\{nn\}/.test(bad2.stdout + bad2.stderr));

await cleanup();
console.log(failed ? `\n${failed} FAILED` : '\nall asset checks passed');
process.exit(failed ? 1 : 0);
