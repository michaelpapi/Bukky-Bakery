// Loads the active client (CLIENT env var), merges it with its world defaults, validates it,
// and exposes the helpers every component uses. A bad config fails the build here, with the field path.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { resolveClient, type WorldFile } from '../../config/resolve';
import { productsSchema, type ClientConfig } from '../../config/schema';
import { CLIENT } from '../../config/active-client.mjs';
import { onColour } from './colour';

const clientFiles = import.meta.glob('../../clients/*/client.json', { eager: true, import: 'default' }) as Record<string, any>;
const productFiles = import.meta.glob('../../clients/*/products.json', { eager: true, import: 'default' }) as Record<string, any>;
const worldFiles = import.meta.glob('../../worlds/*/world.json', { eager: true, import: 'default' }) as Record<string, WorldFile>;

const rawClient = clientFiles[`../../clients/${CLIENT}/client.json`];
if (!rawClient) {
  const have = Object.keys(clientFiles).map((k) => k.split('/')[3]).join(', ');
  throw new Error(`clients/${CLIENT}/client.json not found. Clients present: ${have}. Set CLIENT=<slug>.`);
}
const world = worldFiles[`../../worlds/${rawClient.world}/world.json`];
if (!world) throw new Error(`worlds/${rawClient.world}/world.json not found`);

export const slug = CLIENT;
export const config: ClientConfig = resolveClient(world, rawClient);
const rawProducts = productFiles[`../../clients/${CLIENT}/products.json`];
export const products = rawProducts ? productsSchema.parse(rawProducts) : [];
export type Product = (typeof products)[number];

/* ---------- assets ---------- */
/** true when the processed image exists in clients/<slug>/public; otherwise components draw a placeholder */
export const assetExists = (src: string) => existsSync(join(process.cwd(), 'clients', CLIENT, 'public', src));

/* ---------- formatting & links ---------- */
const nf = new Intl.NumberFormat(config.locale, { style: 'currency', currency: config.currency, maximumFractionDigits: 0 });
export const money = (n: number) => nf.format(n);

export const waLink = (text?: string) =>
  config.contact.whatsapp ? `https://wa.me/${config.contact.whatsapp}${text ? `?text=${encodeURIComponent(text)}` : ''}` : undefined;
export const telLink = () => (config.contact.phone ? `tel:${config.contact.phone.replace(/[^\d+]/g, '')}` : undefined);

export const orderTemplate = () =>
  config.checkout.mode === 'whatsapp' ? config.checkout.messageTemplate : 'Hello {business}, I would like to order: {items}';
export const orderMessage = (items: string) => orderTemplate().replace('{business}', config.business.name).replace('{items}', items);

export function ctaHref(cta: { action: string; href?: string }) {
  switch (cta.action) {
    case 'whatsapp': return waLink(`Hello ${config.business.name}!`);
    case 'call': return telLink();
    case 'schedule': return waLink(`Hello ${config.business.name}, I would like to book a date.`); // no-JS fallback; the calendar popup takes over with JS
    case 'booking': return '#booking';
    case 'order': return `#${config.sections.find((s) => s.type === 'products')?.id ?? 'products'}`;
    case 'link': return cta.href;
  }
}

/* ---------- colour ---------- */
const p = config.brand.palette;
export const on = { primary: onColour(p.primary, p.ink), secondary: onColour(p.secondary, p.ink), accent: onColour(p.accent, p.ink) };
export const typographyIsPlayful = config.brand.typography === 'playful';
export const cssVars =
  `--bg:${p.bg};--surface:${p.surface};--ink:${p.ink};--primary:${p.primary};--secondary:${p.secondary};--accent:${p.accent};` +
  `--on-primary:${on.primary};--on-secondary:${on.secondary};--on-accent:${on.accent};` +
  (typographyIsPlayful ? `--font-display:'Fredoka',ui-rounded,'Arial Rounded MT Bold',system-ui,sans-serif;` : '');

/* ---------- placeholders (used until real renders exist) ---------- */
export function placeholderKind(prod: Pick<Product, 'name' | 'category'>) {
  const s = `${prod.category ?? ''} ${prod.name}`.toLowerCase();
  if (/chop|puff|samosa/.test(s)) return 'chops';
  if (/bread|loaf/.test(s)) return 'bread';
  if (/pie|pastr/.test(s)) return 'pie';
  return 'cake';
}

const warned = new Set<string>();
export function warnOnce(msg: string) {
  if (!warned.has(msg)) { warned.add(msg); console.warn(`[page] ${msg}`); }
}
if (!['system', 'playful'].includes(config.brand.typography)) warnOnce(`typography "${config.brand.typography}" is not built yet, using the system font`);
if (config.brand.shapes !== 'blobs' && config.brand.shapes !== 'none') warnOnce(`shapes "${config.brand.shapes}" is not built yet, drawing nothing`);

/* ---------- features that depend on what the client has configured ---------- */
const allCtas = config.sections.flatMap((s) => (s.type === 'hero' ? [s.cta, s.secondaryCta] : s.type === 'cta-band' ? [s.button] : [])).filter(Boolean) as { action: string }[];
export const hasSchedule = allCtas.some((c) => c.action === 'schedule');
export const hasProducts = products.length > 0 && config.sections.some((s) => s.type === 'products' && s.enabled !== false);
export const cartEnabled = hasProducts && config.checkout.mode === 'whatsapp' && !!config.contact.whatsapp;
export const spinOf = (p: Product) => (p.spin && assetExists(p.spin.src.replace('{nn}', '01')) ? p.spin : undefined);

/** Everything the browser scripts need, as one small JSON block in the page. */
export const siteData = {
  slug,
  business: config.business.name,
  wa: config.contact.whatsapp ?? null,
  template: orderTemplate(),
  locale: config.locale,
  currency: config.currency,
  respectSaveData: config.motion.respectSaveData,
  labels: config.labels,
  scheduler: config.scheduler,
  leads: config.leads ? { url: config.leads.url, token: config.leads.token, logOrders: config.leads.logOrders } : null,
  products: products.map((p) => ({
    id: p.id, name: p.name, category: p.category ?? null, blurb: p.blurb,
    price: p.rxOnly ? null : p.price ?? null, note: p.priceNote ?? null, badge: p.badge ?? null,
    tint: p.tint ?? null, available: p.available && p.badge !== 'sold-out', rx: p.rxOnly,
    img: assetExists(p.image.src) ? p.image.src : null, alt: p.image.alt,
    desc: p.details?.description ?? null, includes: p.details?.includes ?? [], lead: p.details?.leadTime ?? null,
    options: p.options, spin: spinOf(p) ?? null,
  })),
};
export const siteDataJson = JSON.stringify(siteData).replace(/</g, '\\u003c');