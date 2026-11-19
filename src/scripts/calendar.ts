// "Pick a date" popup: a month calendar, then a short form, then one WhatsApp message.
// Loaded on demand. All dates use the visitor's local calendar (no UTC maths, so no off-by-one days).
import { site, wa, h, wireSheet, openSheet, reduced, makeRef, postLead } from './data';

const S = site.scheduler;
const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const day0 = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const plus = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const blocked = new Set(S.blockedDates);

const monthFmt = new Intl.DateTimeFormat(site.locale, { month: 'long', year: 'numeric' });
const longFmt = new Intl.DateTimeFormat(site.locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const dowFmt = new Intl.DateTimeFormat(site.locale, { weekday: 'short' });

let dlg: HTMLDialogElement, body: HTMLElement, foot: HTMLElement;
let built = false;
let view: Date;                 // first day of the month on show
let selected: Date | null = null;
let occasion = S.occasions[0];
let fulfil: 'pickup' | 'delivery' = S.fulfilment[0];

const earliest = () => plus(day0(), S.leadDays);
const latest = () => plus(day0(), S.maxDays);
const bookable = (d: Date) => d >= earliest() && d <= latest() && !S.closedWeekdays.includes(d.getDay()) && !blocked.has(iso(d));
const monthStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);

let grid: HTMLElement, label: HTMLElement, prev: HTMLButtonElement, next: HTMLButtonElement;
let form: HTMLElement, picked: HTMLElement, nameIn: HTMLInputElement, detailsIn: HTMLTextAreaElement;
let send: HTMLAnchorElement, hint: HTMLElement;

function renderMonth(dirClass = '') {
  label.textContent = monthFmt.format(view);
  prev.disabled = view <= monthStart(earliest());
  next.disabled = view >= monthStart(latest());
  grid.replaceChildren();
  const lead = (view.getDay() + 6) % 7;                          // weeks start on Monday
  const t = day0();
  let tabStop: HTMLButtonElement | null = null;
  for (let i = 0; i < 42; i++) {
    const d = new Date(view.getFullYear(), view.getMonth(), 1 - lead + i);
    if (d.getMonth() !== view.getMonth()) { grid.append(h('span', { class: 'blank' })); continue; }
    const ok = bookable(d);
    const on = !!selected && iso(d) === iso(selected);
    const b = h('button', {
      type: 'button', class: `day${on ? ' on' : ''}${iso(d) === iso(t) ? ' today' : ''}`, 'data-iso': iso(d),
      'aria-label': longFmt.format(d) + (ok ? '' : ', not available'), 'aria-pressed': String(on), disabled: !ok, tabindex: -1,
    }, String(d.getDate()));
    if (ok && (on || (!tabStop && !selected))) tabStop = b;
    if (on && ok) tabStop = b;
    grid.append(b);
  }
  if (tabStop) tabStop.tabIndex = 0;
  if (dirClass) { grid.className = `cal-grid ${dirClass}`; void grid.offsetWidth; } else grid.className = 'cal-grid';
}

function go(delta: number) {
  view = new Date(view.getFullYear(), view.getMonth() + delta, 1);
  renderMonth(reduced() ? '' : delta > 0 ? 'to-next' : 'to-prev');
}

function pick(d: Date) {
  selected = d;
  renderMonth();
  grid.querySelector<HTMLButtonElement>(`[data-iso="${iso(d)}"]`)?.focus();
  const first = form.hidden;
  form.hidden = false;
  picked.textContent = longFmt.format(d);
  update();
  if (first) setTimeout(() => form.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'nearest' }), 60);
}

/** keyboard: arrows move by day / week through bookable dates, PageUp/PageDown change month */
function onKey(e: KeyboardEvent) {
  const el = (e.target as Element).closest<HTMLButtonElement>('.day');
  if (!el) return;
  const cur = new Date(el.dataset.iso + 'T00:00:00');
  const step = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' ? -7 : e.key === 'ArrowDown' ? 7 : 0;
  if (e.key === 'PageDown' || e.key === 'PageUp') { e.preventDefault(); if (e.key === 'PageDown' ? !next.disabled : !prev.disabled) go(e.key === 'PageDown' ? 1 : -1); return; }
  if (!step) return;
  e.preventDefault();
  let d = plus(cur, step);
  for (let k = 0; k < 400 && !bookable(d); k++) { d = plus(d, step > 0 ? 1 : -1); if (d < earliest() || d > latest()) return; }
  if (!bookable(d)) return;
  if (d.getMonth() !== view.getMonth() || d.getFullYear() !== view.getFullYear()) { view = monthStart(d); renderMonth(); }
  const b = grid.querySelector<HTMLButtonElement>(`[data-iso="${iso(d)}"]`);
  grid.querySelectorAll<HTMLButtonElement>('.day[tabindex="0"]').forEach((x) => (x.tabIndex = -1));
  if (b) { b.tabIndex = 0; b.focus(); }
}

let ref = '';
/** WhatsApp message: bold labels, one fact per line */
function message() {
  if (!ref) ref = makeRef();
  const lines = [
    `Hello ${site.business}, I would like to book a date.`,
    '',
    '*BOOKING REQUEST*',
    `*Ref:* ${ref}  ·  sent ${new Intl.DateTimeFormat(site.locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date())}`,
    '',
    `*Date:* ${selected ? longFmt.format(selected) : ''}`,
    `*For:* ${occasion}`,
    `*Pickup or delivery:* ${fulfil === 'pickup' ? 'Pickup' : 'Delivery'}`,
    `*Name:* ${nameIn.value.trim()}`,
  ];
  if (detailsIn.value.trim()) lines.push(`*Details:* ${detailsIn.value.trim()}`);
  lines.push('', 'Please confirm if this date is available. Thank you!');
  return lines.join('\n');
}
const valid = () => !!selected && nameIn.value.trim().length >= 2;
function update() {
  const ok = valid();
  send.setAttribute('aria-disabled', String(!ok));
  send.href = ok ? wa(message()) : '#';
  hint.textContent = !selected ? 'Pick a date to continue.' : !ok ? 'Add your name to continue.' : '';
  hint.classList.remove('err');
}

function chips(legend: string, name: string, values: { v: string; text: string }[], current: string, onPick: (v: string) => void) {
  const set = h('fieldset', { class: 'chips-group' }, h('legend', {}, legend));
  for (const { v, text } of values) {
    const input = h('input', { type: 'radio', name, value: v, class: 'sr', ...(v === current ? { checked: true } : {}) });
    input.addEventListener('change', () => { onPick(v); update(); });
    set.append(h('label', { class: 'chip-radio' }, input, h('span', {}, text)));
  }
  return set;
}

function build() {
  view = monthStart(earliest());
  prev = h('button', { type: 'button', class: 'nav', 'aria-label': 'Previous month' }, '‹');
  next = h('button', { type: 'button', class: 'nav', 'aria-label': 'Next month' }, '›');
  label = h('strong', { class: 'cal-month', 'aria-live': 'polite' });
  grid = h('div', { class: 'cal-grid', role: 'group', 'aria-label': 'Choose a day' });
  const monday = new Date(2024, 0, 1); // a Monday
  const dow = h('div', { class: 'cal-dow', 'aria-hidden': 'true' }, ...Array.from({ length: 7 }, (_, i) => h('span', {}, dowFmt.format(plus(monday, i)))));
  prev.addEventListener('click', () => go(-1));
  next.addEventListener('click', () => go(1));
  grid.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLButtonElement>('.day');
    if (b && !b.disabled) pick(new Date(b.dataset.iso + 'T00:00:00'));
  });
  grid.addEventListener('keydown', onKey);

  const cal = h('div', { class: 'cal' }, h('div', { class: 'cal-head' }, prev, label, next), dow, grid);

  picked = h('p', { class: 'picked' });
  nameIn = h('input', { type: 'text', name: 'name', autocomplete: 'name', required: true, maxlength: 60, placeholder: 'Your name' });
  detailsIn = h('textarea', { name: 'details', rows: 3, maxlength: 400, placeholder: 'Flavour, size, message on the cake, number of guests...' });
  nameIn.addEventListener('input', update);
  detailsIn.addEventListener('input', update);
  form = h('div', { class: 'sched-form' },
    picked,
    chips("What's it for?", 'occasion', S.occasions.map((o) => ({ v: o, text: o })), occasion, (v) => (occasion = v)),
    chips('Pickup or delivery?', 'fulfil', S.fulfilment.map((f) => ({ v: f, text: f === 'pickup' ? 'Pickup' : 'Delivery' })), fulfil, (v) => (fulfil = v as 'pickup' | 'delivery')),
    h('label', { class: 'field' }, h('span', {}, 'Your name'), nameIn),
    h('label', { class: 'field' }, h('span', {}, 'Tell us what you want'), detailsIn));
  form.hidden = true;

  body.append(cal);
  if (S.note) body.append(h('p', { class: 'cal-note' }, S.note));
  body.append(form);
  hint = h('p', { class: 'sched-hint', role: 'status' }, 'Pick a date to continue.');
  send = h('a', { class: 'btn wide', href: '#', target: '_blank', rel: 'noopener', 'aria-disabled': 'true' }, site.labels.sendRequest);
  send.addEventListener('click', (e) => {
    if (valid()) {
      hint.textContent = 'WhatsApp is opening. Send the message there to confirm your request.';
      if (site.leads?.logOrders) postLead('booking', { ref, date: iso(selected!), dateText: longFmt.format(selected!), occasion, fulfilment: fulfil, name: nameIn.value.trim(), details: detailsIn.value.trim(), at: new Date().toISOString() });
      return;
    }
    e.preventDefault();
    hint.textContent = !selected ? 'Please pick a date first.' : 'Please add your name.';
    hint.classList.add('err');
    if (selected) nameIn.focus();
  });
  foot.append(hint, send);
  renderMonth();
  built = true;
}

export function openScheduler() {
  if (!built) {
    dlg = document.getElementById('sched-dialog') as HTMLDialogElement;
    body = dlg.querySelector('[data-body]')!; foot = dlg.querySelector('[data-foot]')!;
    wireSheet(dlg);
    build();
  }
  openSheet(dlg);
  grid.querySelector<HTMLButtonElement>('.day[tabindex="0"]')?.focus({ preventScroll: true });
}