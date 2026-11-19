// The order cart. State lives in a plain object, saved to localStorage so a reload does not lose it.
import { site, byId, money, wa, h, wireSheet, openSheet, makeRef, postLead } from './data';

const KEY = `cart:${site.slug}`;
const MAX = 20;
const cart: Record<string, number> = {};
const subs = new Set<() => void>();
let ref = '';                         // order reference, new for each order


try {
  const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
  for (const [id, q] of Object.entries(saved)) {
    const p = byId.get(id);
    if (p && p.price != null && p.available && Number.isInteger(q) && (q as number) > 0) cart[id] = Math.min(q as number, MAX);
  }
} catch { /* private mode or blocked storage: the cart still works, it just is not remembered */ }

const save = () => { try { localStorage.setItem(KEY, JSON.stringify(cart)); } catch { /* ignore */ } };
export const qty = (id: string) => cart[id] || 0;
export const count = () => Object.values(cart).reduce((a, b) => a + b, 0);
export const total = () => Object.entries(cart).reduce((a, [id, q]) => a + (byId.get(id)!.price as number) * q, 0);
export function set(id: string, q: number) {
  q = Math.max(0, Math.min(MAX, q));
  if (q === 0) delete cart[id]; else cart[id] = q;
  save(); subs.forEach((f) => f());
}
export const add = (id: string) => set(id, qty(id) + 1);
export const clear = () => { for (const id of Object.keys(cart)) delete cart[id]; ref = ''; save(); subs.forEach((f) => f()); };
export const onChange = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };

// who is ordering: remembered on this phone so repeat customers do not retype it
const CKEY = `cust:${site.slug}`;
const cust = { name: '', fulfil: 'pickup', address: '' };
try { Object.assign(cust, JSON.parse(localStorage.getItem(CKEY) || '{}')); } catch { /* ignore */ }
const saveCust = () => { try { localStorage.setItem(CKEY, JSON.stringify(cust)); } catch { /* ignore */ } };
const isDelivery = () => cust.fulfil === 'delivery';
const dateText = () => new Intl.DateTimeFormat(site.locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date());

/** the WhatsApp message, laid out like an invoice (WhatsApp shows *text* as bold) */
export function orderMessage(note: string) {
  if (!ref) ref = makeRef();
  const lines = Object.entries(cart).map(([id, q], i) => {
    const p = byId.get(id)!;
    const each = p.price as number;
    return `*${i + 1}.* ${p.name}${p.note ? ` (${p.note})` : ''}\n      ${q} × ${money(each)} = ${money(each * q)}`;
  });
  const head = [
    `*ORDER INVOICE*`,
    `*Ref:* ${ref}  ·  ${dateText()}`,
    `*Customer:* ${cust.name.trim() || '-'}`,
    `*${isDelivery() ? 'Delivery' : 'Pickup'}*${isDelivery() && cust.address.trim() ? `: ${cust.address.trim()}` : ''}`,
  ].join('\n');
  const items = `\n\n${head}\n\n*ITEMS*\n${lines.join('\n')}\n\n━━━━━━━━━━━━\n*TOTAL: ${money(total())}*`;
  let msg = site.template.replace('{business}', site.business).replace('{items}', items);
  if (note.trim()) msg += `\n\n*Note:* ${note.trim()}`;
  return `${msg}\n\nPlease confirm availability and how to pay. Thank you!`;
}

/** what the Google Sheet gets (only when the client has connected one) */
function orderRecord(note: string) {
  return {
    ref,
    customer: cust.name.trim(), fulfilment: cust.fulfil, address: isDelivery() ? cust.address.trim() : '',
    items: Object.entries(cart).map(([id, q]) => { const p = byId.get(id)!; return { name: p.name, option: p.note || '', qty: q, price: p.price, line: (p.price as number) * q }; }),
    total: total(), note: note.trim(), at: new Date().toISOString(),
  };
}

export function initCart() {
  const barEl = document.getElementById('cart-bar');
  const dlgEl = document.getElementById('cart-dialog') as HTMLDialogElement | null;
  if (!barEl || !dlgEl) return;
  const bar: HTMLElement = barEl;
  const dlg: HTMLDialogElement = dlgEl;
  wireSheet(dlg);

  const badge = bar.querySelector<HTMLElement>('[data-count]')!;
  const totalEl = bar.querySelector<HTMLElement>('[data-total]')!;
  const list = dlg.querySelector<HTMLElement>('[data-list]')!;
  const empty = dlg.querySelector<HTMLElement>('[data-empty]')!;
  const sum = dlg.querySelector<HTMLElement>('[data-sum]')!;
  const send = dlg.querySelector<HTMLAnchorElement>('[data-send]')!;
  const note = dlg.querySelector<HTMLTextAreaElement>('[data-note]')!;
  const noteWrap = dlg.querySelector<HTMLElement>('[data-notewrap]')!;
  const foot = dlg.querySelector<HTMLElement>('[data-foot]')!;
  const nameIn = dlg.querySelector<HTMLInputElement>('[data-name]')!;
  const addrIn = dlg.querySelector<HTMLInputElement>('[data-address]')!;
  const addrWrap = dlg.querySelector<HTMLElement>('[data-addrwrap]')!;
  const hint = dlg.querySelector<HTMLElement>('[data-hint]')!;
  const fulfilIn = [...dlg.querySelectorAll<HTMLInputElement>('[data-fulfil]')];
  const L = site.labels;
  let lastCount = count();

  nameIn.value = cust.name; addrIn.value = cust.address;
  fulfilIn.forEach((r) => { r.checked = r.value === cust.fulfil; });
  const syncFulfil = () => { addrWrap.hidden = !isDelivery(); };
  syncFulfil();

  const thumb = (id: string) => {
    const p = byId.get(id)!;
    return p.img ? h('img', { class: 'thumb', src: p.img, alt: '', width: 56, height: 56, decoding: 'async' }) : h('span', { class: 'thumb fallback', 'aria-hidden': 'true' }, p.name[0]);
  };
  const stepBtn = (label: string, text: string, onClick: () => void) => {
    const b = h('button', { type: 'button', class: 'step', 'aria-label': label }, text);
    b.addEventListener('click', onClick);
    return b;
  };

  function renderList() {
    list.replaceChildren();
    for (const [id, q] of Object.entries(cart)) {
      const p = byId.get(id)!;
      const qtyEl = h('output', { class: 'qty', 'aria-live': 'polite' }, String(q));
      const remove = h('button', { type: 'button', class: 'linkbtn rm', 'aria-label': `Remove ${p.name}` }, 'Remove');
      remove.addEventListener('click', () => set(id, 0));
      list.append(h('li', { class: 'cart-row' },
        thumb(id),
        h('div', { class: 'ci' },
          h('strong', {}, p.name),
          p.note ? h('span', { class: 'cn' }, p.note) : null,
          h('span', { class: 'cp' }, `${money(p.price as number)} each`),
          remove),
        h('div', { class: 'stepper', role: 'group', 'aria-label': `Quantity of ${p.name}` },
          stepBtn(`One less ${p.name}`, '−', () => set(id, q - 1)),
          qtyEl,
          stepBtn(`One more ${p.name}`, '+', () => set(id, q + 1))),
        h('span', { class: 'line' }, money((p.price as number) * q))));
    }
  }

  function render() {
    const n = count();
    badge.textContent = String(n);
    totalEl.textContent = n ? `${n === 1 ? '1 item' : `${n} items`} · ${money(total())}` : '';
    bar.dataset.open = n > 0 ? 'true' : 'false';
    document.documentElement.toggleAttribute('data-cart-open', n > 0);
    if (n > lastCount) { bar.classList.remove('bump'); void bar.offsetWidth; bar.classList.add('bump'); } // small pop when something is added
    lastCount = n;

    // product cards: "Add" turns into "Added (2)"
    document.querySelectorAll<HTMLButtonElement>('[data-add]').forEach((b) => {
      const q = qty(b.dataset.id!);
      b.textContent = q ? `${L.added} (${q})` : L.add;
      b.dataset.done = q ? 'true' : 'false';
    });

    renderList();
    empty.hidden = n > 0;
    noteWrap.hidden = n === 0;
    foot.hidden = n === 0;
    sum.textContent = money(total());
    updateLink();
    if (n === 0 && dlg.open) { /* leave it open: the empty message tells people what to do */ }
  }
  const updateLink = () => { send.href = site.wa ? wa(orderMessage(note.value)) : '#'; };
  note.addEventListener('input', updateLink);
  nameIn.addEventListener('input', () => { cust.name = nameIn.value; saveCust(); hint.textContent = ''; updateLink(); });
  addrIn.addEventListener('input', () => { cust.address = addrIn.value; saveCust(); hint.textContent = ''; updateLink(); });
  fulfilIn.forEach((r) => r.addEventListener('change', () => { if (r.checked) { cust.fulfil = r.value; saveCust(); syncFulfil(); updateLink(); } }));
  send.addEventListener('click', (e) => {
    if (count() === 0) { e.preventDefault(); return; }
    if (cust.name.trim().length < 2) { e.preventDefault(); hint.textContent = 'Please add your name for the invoice.'; hint.classList.add('err'); nameIn.focus(); return; }
    if (isDelivery() && cust.address.trim().length < 3) { e.preventDefault(); hint.textContent = 'Please add your delivery address or area.'; hint.classList.add('err'); addrIn.focus(); return; }
    hint.classList.remove('err'); hint.textContent = 'WhatsApp is opening. Send the message there to place your order.';
    if (site.leads?.logOrders) postLead('order', orderRecord(note.value)); // same ref twice = same order; the Sheet script skips repeats
  });

  document.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLElement>('[data-add]');
    if (b) add(b.dataset.id!);
  });
  bar.querySelector('[data-cart-open]')!.addEventListener('click', () => openSheet(dlg));
  document.addEventListener('open-cart', () => openSheet(dlg));
  dlg.querySelector('[data-clear]')!.addEventListener('click', clear);

  onChange(render);
  render();
}

