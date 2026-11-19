import { readFileSync, existsSync } from 'node:fs';
import { resolveClient } from '../config/resolve';
import { productsSchema } from '../config/schema';

const load = (p: string) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

let failed = 0;
const ok = (name: string, cond: boolean, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`);
  if (!cond) failed++;
};
const errText = (fn: () => unknown) => {
  try { fn(); return ''; } catch (e: any) { return e.issues ? e.issues.map((i: any) => `${i.path.join('.')}: ${i.message}`).join(' | ') : String(e.message); }
};

const food = load('worlds/food/world.json');
// the school world and the academy client are optional (they are not shipped with the Bukky Bakes repo)
const hasSchool = existsSync(new URL('../worlds/school/world.json', import.meta.url)) && existsSync(new URL('../clients/bright-stars-academy/client.json', import.meta.url));
const school = hasSchool ? load('worlds/school/world.json') : null;
const bakes = load('clients/bukky-bakes/client.json');
const academy = hasSchool ? load('clients/bright-stars-academy/client.json') : null;
const bakeProducts = load('clients/bukky-bakes/products.json');

/* ---- positives ---- */
const b = resolveClient(food, bakes);
ok('bakery resolves', b.slug === 'bukky-bakes');
ok('world defaults flow in (motion.hero=pop)', b.motion.hero === 'pop' && b.motion.intensity === 'loud');
ok('client override wins (checkout stays whatsapp, template default added)', b.checkout.mode === 'whatsapp' && (b.checkout as any).messageTemplate.includes('{items}'));
ok('sectionDefaults applied (products.layout=menu)', (b.sections.find((s) => s.type === 'products') as any).layout === 'menu');
ok('schema defaults fill gaps (motion.respectSaveData=true)', b.motion.respectSaveData === true);
ok('bakery products valid', productsSchema.safeParse(bakeProducts).success, errText(() => productsSchema.parse(bakeProducts)));

if (hasSchool) {
  const s = resolveClient(school, academy);
  ok('school resolves', s.slug === 'bright-stars-academy');
  ok('school world gives form checkout', s.checkout.mode === 'form');
  ok('school booking default kind', (s.sections.find((x) => x.type === 'booking') as any).kind === 'consultation');
} else console.log('SKIP  school checks (school world not present)');

/* ---- negatives: each must be rejected, with a useful message ---- */
const neg = (name: string, mutate: (c: any) => void, expect: RegExp, world = food, base = bakes) => {
  const c = clone(base); mutate(c);
  const msg = errText(() => resolveClient(world, c));
  ok(`rejects: ${name}`, expect.test(msg), msg.slice(0, 140));
};
neg('low-contrast ink', (c) => { c.brand.palette.ink = '#cccccc'; }, /ink on bg contrast/);
neg('primary too faint for buttons', (c) => { c.brand.palette.primary = '#fff0d0'; }, /primary on bg contrast/);
const story = (c: any) => c.sections.find((x: any) => x.type === 'story');
neg('image without alt text', (c) => { story(c).media.alt = ''; }, /alt text/);
neg('jpg asset path', (c) => { story(c).media.src = '/images/story.jpg'; }, /\.webp, \.avif or \.svg/);
neg('whatsapp checkout without a number', (c) => { delete c.contact.whatsapp; }, /contact\.whatsapp|whatsapp/);
neg('booking CTA without booking section', (c) => { c.sections[0].cta.action = 'booking'; }, /no booking section/);
neg('hero not first', (c) => { c.sections.reverse(); }, /hero must be the first/);
neg('invented motion preset', (c) => { c.motion = { hero: 'matrix-rain' }; }, /motion\.hero/);
neg('missing required section', (c) => { c.sections = c.sections.filter((x: any) => x.type !== 'contact'); }, /requires sections: contact/);
if (hasSchool) neg('wrong world file', () => {}, /does not match world file/, school, bakes);
neg('bad whatsapp format', (c) => { c.contact.whatsapp = '+234 800 000 0000'; }, /digits only/);
neg('bank account wrong length', (c) => { c.checkout = { mode: 'transfer', bankName: 'GTBank', accountName: 'Bukky Bakes', accountNumber: '12345' }; }, /10 digits/);
neg('unknown top-level section type', (c) => { c.sections.push({ type: 'three-js-scene' }); }, /sections/);

const negP = (name: string, mutate: (p: any[]) => void, expect: RegExp) => {
  const p = clone(bakeProducts); mutate(p);
  const msg = errText(() => productsSchema.parse(p));
  ok(`rejects product: ${name}`, expect.test(msg), msg.slice(0, 140));
};
negP('no price and not on request', (p) => { delete p[0].price; }, /set a price/);
negP('rxOnly with a price', (p) => { p[0].rxOnly = true; }, /rxOnly products must not have a price/);
negP('duplicate id', (p) => { p[1].id = p[0].id; }, /duplicate product id/);
negP('more than 60 products', (p) => { for (let i = 0; i < 60; i++) p.push({ ...p[0], id: `x-${i}` }); }, /60|too_big|Too big/i);

negP('invented tint colour', (p) => { p[0].tint = 'hotpink'; }, /tint/);
neg('sticker as jpg', (c) => { c.brand.stickers = ['/images/s-cherry.jpg']; }, /asset must start with/);
neg('more than 6 stickers', (c) => { c.brand.stickers = Array.from({ length: 7 }, (_, i) => `/images/s-${i}.webp`); }, /brand\.stickers|Too big/);
neg('invented section tone', (c) => { c.sections[1].tone = 'rainbow'; }, /tone/);
ok('secondary tone and stickers resolve', b.sections.some((x) => x.tone === 'secondary') && b.brand.stickers.length === 5);

/* ---- hero pieces, spin, scheduler ---- */
const hero = (c: any) => c.sections.find((x: any) => x.type === 'hero');
ok('hero pieces resolve (5, listed bottom to top)', (hero(b) as any).pieces.length === 5 && (hero(b) as any).pieces[0].name === 'stand');
ok('scheduler defaults + client values', b.scheduler.leadDays === 3 && b.scheduler.fulfilment.length === 2 && b.scheduler.occasions.includes('Birthday'));
neg('piece wider than 120%', (c) => { hero(c).pieces[1].w = 150; }, /pieces\.1\.w/);
neg('piece as jpg', (c) => { hero(c).pieces[0].src = '/images/stand.jpg'; }, /asset must start with/);
neg('more than 8 pieces', (c) => { hero(c).pieces = Array.from({ length: 9 }, (_, i) => ({ src: `/images/p${i}.webp`, name: `p${i}`, w: 50 })); }, /pieces|Too big/);
neg('schedule CTA without whatsapp', (c) => { delete c.contact.whatsapp; c.checkout = { mode: 'contact-only' }; }, /schedule but contact\.whatsapp/);
neg('scheduler lead time absurd', (c) => { c.scheduler.leadDays = 90; }, /scheduler\.leadDays/);
neg('scheduler blocked date not ISO', (c) => { c.scheduler.blockedDates = ['25/12/2026']; }, /YYYY-MM-DD/);
neg('scheduler with one occasion', (c) => { c.scheduler.occasions = ['Birthday']; }, /scheduler\.occasions/);
negP('spin pattern without {nn}', (p) => { p[0].spin = { src: '/images/spin/vanilla.webp', frames: 16 }; }, /contain \{nn\}/);
negP('spin with 4 frames', (p) => { p[0].spin = { src: '/images/spin/v-{nn}.webp', frames: 4 }; }, /spin\.frames|too_small|>=8/i);
negP('details too short', (p) => { p[0].details = { description: 'Nice.' }; }, /details\.description/);

// rxOnly valid case for pharmacy
const rx = clone(bakeProducts); rx[0].rxOnly = true; delete rx[0].price; delete rx[0].priceNote;
ok('rxOnly without price is accepted', productsSchema.safeParse(rx).success);

console.log(failed ? `\n${failed} FAILED` : '\nall checks passed');
process.exit(failed ? 1 : 0);