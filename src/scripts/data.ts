// Shared helpers. The page ships one JSON block (#site-data) with everything the scripts need.
export type Spin = { src: string; frames: number; reverse?: boolean };
export type Product = {
  id: string; name: string; category: string | null; blurb: string; price: number | null; note: string | null; badge: string | null;
  tint: string | null; available: boolean; rx: boolean; img: string | null; alt: string;
  desc: string | null; includes: string[]; lead: string | null; options: { label: string; values: string[] }[]; spin: Spin | null;
};
export type Site = {
  slug: string; business: string; wa: string | null; template: string; locale: string; currency: string; respectSaveData: boolean;
  labels: Record<string, string>;
  scheduler: { title: string; note?: string; leadDays: number; maxDays: number; closedWeekdays: number[]; blockedDates: string[]; occasions: string[]; fulfilment: ('pickup' | 'delivery')[] };
  leads: { url: string; token?: string; logOrders: boolean } | null;
  products: Product[];
};

const node = document.getElementById('site-data');
export const site: Site = node ? JSON.parse(node.textContent || '{}') : ({ products: [], labels: {}, slug: 'site', locale: 'en-NG', currency: 'NGN', leads: null } as unknown as Site);
export const byId = new Map(site.products.map((p) => [p.id, p]));

const nf = new Intl.NumberFormat(site.locale, { style: 'currency', currency: site.currency, maximumFractionDigits: 0 });
export const money = (n: number) => nf.format(n);
export const wa = (text: string) => `https://wa.me/${site.wa}?text=${encodeURIComponent(text)}`;

/** short reference the customer and the owner can both quote, e.g. BB-7K2Q (no look-alike characters) */
export function makeRef() {
  const letters = site.business.split(/\s+/).map((w) => w[0] || '').join('').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3) || 'ORD';
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const rnd = crypto.getRandomValues(new Uint8Array(4));
  return `${letters}-${[...rnd].map((n) => chars[n % chars.length]).join('')}`;
}

/** Sends a record to the client's Google Sheet (Apps Script web app). Resolves false when offline or when there is no endpoint. */
export async function postLead(type: 'subscribe' | 'order' | 'booking' | 'issue', data: Record<string, unknown>) {
  const l = site.leads;
  if (!l?.url) return false;
  const body = JSON.stringify({ type, slug: site.slug, business: site.business, token: l.token, ...data });
  try {
    // text/plain keeps this a "simple" request, so the browser does not need a CORS preflight (Apps Script cannot answer one)
    await fetch(l.url, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body, keepalive: true });
    return true;
  } catch { return false; }
}

export const lite = () => document.documentElement.classList.contains('lite');
export const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** tiny DOM builder: h('div', { class: 'x' }, 'text', childNode) */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string | boolean | number | undefined> = {}, ...kids: (Node | string | null | false)[]) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k === 'class') el.className = String(v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const kid of kids) if (kid) el.append(kid);
  return el;
}

/* ---------- bottom sheets (native <dialog>: focus trap, Esc and focus return come for free) ---------- */
export function wireSheet(d: HTMLDialogElement) {
  d.addEventListener('click', (e) => { if (e.target === d) d.close(); });               // a tap on the dark backdrop closes it
  d.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => d.close()));
  d.addEventListener('close', () => document.documentElement.classList.remove('dlg'));
}
export function openSheet(d: HTMLDialogElement) {
  if (!d.open) d.showModal();
  document.documentElement.classList.add('dlg'); // stops the page behind from scrolling
}