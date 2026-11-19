// Product popup: details, add-to-order, and (when the product has turntable frames) a drag-to-spin viewer.
// Loaded on demand, so it costs nothing until a customer taps a product.
import { site, byId, money, wa, h, wireSheet, openSheet, lite, reduced, type Product, type Spin as SpinSpec } from './data';
import { qty, add, set, onChange } from './cart';

let dlg: HTMLDialogElement, body: HTMLElement, foot: HTMLElement, title: HTMLElement;
let wired = false;
let current: Product | null = null;
let spin: SpinViewer | null = null;
let off: (() => void) | null = null;

const loadImg = (src: string) => new Promise<HTMLImageElement>((res, rej) => {
  const i = new Image(); i.decoding = 'async'; i.onload = () => res(i); i.onerror = () => rej(new Error(src)); i.src = src;
});

/* ---------- turntable viewer: N pictures of the product turning, drawn on a canvas ---------- */
class SpinViewer {
  private frames: (HTMLImageElement | undefined)[];
  private n: number;
  private pos = 0;
  private shown = -1;
  private ready = false;
  private alive = true;
  private raf = 0;
  private v = 0;
  private auto = 0;        // requestAnimationFrame id of the turning loop
  private hold = 0;        // ms timestamp: do not auto-turn before this moment
  private dragging = false;
  private lastT = 0;
  private ctx: CanvasRenderingContext2D;
  private dir: number;

  constructor(private root: HTMLElement, private canvas: HTMLCanvasElement, private spec: SpinSpec, private status: HTMLElement, private hint: HTMLElement, private onFail: () => void) {
    this.n = spec.frames;
    this.frames = new Array(this.n);
    this.ctx = canvas.getContext('2d')!;
    this.dir = spec.reverse ? 1 : -1;
    this.bind();
    this.load();
  }

  private url = (k: number) => this.spec.src.replace('{nn}', String(k + 1).padStart(2, '0'));

  private async load() {
    try {
      this.frames[0] = await loadImg(this.url(0));            // the first frame shows at once
      if (!this.alive) return;
      this.draw(0);
      this.canvas.classList.add('on');
      let done = 1;
      const setStatus = () => { this.status.textContent = `Loading 3D view ${done}/${this.n}`; };
      setStatus();
      const queue = Array.from({ length: this.n - 1 }, (_, k) => k + 1);
      const worker = async () => {
        for (let k = queue.shift(); k !== undefined && this.alive; k = queue.shift()) {
          this.frames[k] = await loadImg(this.url(k));
          done++; setStatus();
        }
      };
      await Promise.all([worker(), worker(), worker(), worker()]); // 4 at a time: kind to slow connections
      if (!this.alive) return;
      this.ready = true;
      this.status.hidden = true;
      this.hint.hidden = false;
      this.root.classList.add('ready');
      if (!reduced()) this.loop();
    } catch {
      if (this.alive) this.onFail();                            // a frame failed: fall back to the still picture
    }
  }

  private draw(i: number) {
    const im = this.frames[i];
    if (!im || i === this.shown) return;
    this.shown = i;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.drawImage(im, 0, 0, this.canvas.width, this.canvas.height);
  }
  private setPos(p: number) {
    this.pos = p;
    const i = ((Math.round(p) % this.n) + this.n) % this.n;
    this.draw(i);
  }

  /** keeps turning slowly (one full turn in about 9 s) until the visitor touches it, then waits 2.5 s after they let go */
  private loop() {
    const step = (t: number) => {
      if (!this.alive) return;
      const dt = Math.min(64, t - (this.lastT || t)); this.lastT = t;
      if (!this.dragging && !this.raf && t > this.hold) this.setPos(this.pos + (dt * this.n) / 9000);
      this.auto = requestAnimationFrame(step);
    };
    this.auto = requestAnimationFrame(step);
  }
  private pause(ms = 2500) { this.hold = performance.now() + ms; }

  private inertia() {
    let last = performance.now();
    const tick = (t: number) => {
      if (!this.alive) return;
      const dt = t - last; last = t;
      this.setPos(this.pos + this.v * dt);
      this.v *= Math.pow(0.94, dt / 16);
      if (Math.abs(this.v) > 0.002) this.raf = requestAnimationFrame(tick); else { this.raf = 0; this.pause(); }
    };
    this.raf = requestAnimationFrame(tick);
  }

  private bind() {
    let down = false, sx = 0, sp = 0, lx = 0, lt = 0;
    const r = this.root;
    r.addEventListener('pointerdown', (e) => {
      if (!this.ready || (e.target as Element).closest('button')) return;
      down = true; sx = lx = e.clientX; sp = this.pos; lt = e.timeStamp; this.v = 0;
      this.dragging = true; this.pause(60000); if (this.raf) { cancelAnimationFrame(this.raf); this.raf = 0; }
      r.setPointerCapture(e.pointerId); r.classList.add('grab'); this.hint.hidden = true;
    });
    r.addEventListener('pointermove', (e) => {
      if (!down) return;
      const frames = ((e.clientX - sx) / r.clientWidth) * this.n * 0.9;   // a full-width drag is almost one full turn
      this.setPos(sp + this.dir * frames);
      const dt = e.timeStamp - lt;
      if (dt > 0) this.v = (this.dir * (e.clientX - lx) / r.clientWidth) * this.n * 0.9 / dt;
      lx = e.clientX; lt = e.timeStamp;
    });
    const end = () => { if (!down) return; down = false; this.dragging = false; this.pause(); r.classList.remove('grab'); if (Math.abs(this.v) > 0.004) this.inertia(); };
    r.addEventListener('pointerup', end); r.addEventListener('pointercancel', end);
    r.addEventListener('keydown', (e) => {
      if (!this.ready) return;
      const d = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
      if (d) { e.preventDefault(); this.pause(); this.setPos(Math.round(this.pos) + d); this.hint.hidden = true; }
    });
    r.querySelectorAll<HTMLButtonElement>('[data-rot]').forEach((b) => b.addEventListener('click', () => {
      if (!this.ready) return; this.pause(); this.setPos(Math.round(this.pos) + Number(b.dataset.rot) * 2); this.hint.hidden = true;
    }));
  }

  destroy() { this.alive = false; if (this.auto) cancelAnimationFrame(this.auto); if (this.raf) cancelAnimationFrame(this.raf); }
}

/* ---------- the popup ---------- */
function mediaBlock(p: Product) {
  const wrap = h('div', { class: `pd-media tint-${p.tint ?? 'surface'}` });
  if (p.badge) wrap.append(h('span', { class: 'badge' }, p.badge === 'sold-out' ? 'Sold out' : p.badge[0].toUpperCase() + p.badge.slice(1)));

  const still = () => p.img
    ? h('img', { class: 'pd-img', src: p.img, alt: p.alt, width: 600, height: 600, decoding: 'async' })
    : h('span', { class: 'pd-img fallback', 'aria-hidden': 'true' }, p.name[0]);

  if (p.spin && !lite()) {
    const canvas = h('canvas', { width: 480, height: 480 });
    const status = h('span', { class: 'spin-status', role: 'status' }, 'Loading 3D view');
    const hint = h('span', { class: 'spin-hint' }, h('i', { 'aria-hidden': 'true' }), 'Drag to spin');
    hint.hidden = true;
    const prev = h('button', { type: 'button', class: 'rot', 'data-rot': '-1', 'aria-label': 'Turn left' }, '‹');
    const next = h('button', { type: 'button', class: 'rot r', 'data-rot': '1', 'aria-label': 'Turn right' }, '›');
    const root = h('div', { class: 'spin', tabindex: 0, role: 'group', 'aria-label': `${p.name}: drag to turn it around, or use the left and right arrow keys` }, canvas, status, hint, prev, next);
    wrap.append(root);
    spin = new SpinViewer(root, canvas, p.spin, status, hint, () => { root.replaceWith(still()); spin = null; });
  } else {
    wrap.append(still());
  }
  return wrap;
}

function infoBlock(p: Product) {
  const price = p.price != null ? h('p', { class: 'pd-price' }, money(p.price), p.note ? h('small', {}, p.note) : null)
    : h('p', { class: 'pd-price' }, p.rx ? 'Prescription only' : 'Price on request');
  return h('div', { class: 'pd-info' },
    p.category ? h('p', { class: 'cat' }, p.category) : null,
    h('p', { class: 'pd-name', 'aria-hidden': 'true' }, p.name),
    price,
    h('p', { class: 'pd-desc' }, p.desc ?? p.blurb),
    p.includes.length ? h('ul', { class: 'pd-list' }, ...p.includes.map((t) => h('li', {}, t))) : null,
    ...p.options.map((o) => h('p', { class: 'opt' }, `${o.label}: ${o.values.join(' · ')}`)),
    p.lead ? h('p', { class: 'pd-lead' }, p.lead) : null);
}

function renderFoot() {
  const p = current;
  if (!p) return;
  foot.replaceChildren();
  const L = site.labels;
  const ask = wa(`Hello ${site.business}, I have a question about: ${p.name}`);
  const quote = wa(`Hello ${site.business}, I would like a quote for: ${p.name}`);

  if (!p.available) { foot.append(h('button', { type: 'button', class: 'btn wide', disabled: true }, 'Sold out')); return; }
  if (p.price == null || p.rx) {
    foot.append(h('a', { class: 'btn wide', href: quote, target: '_blank', rel: 'noopener' }, L.enquire));
    return;
  }
  const q = qty(p.id);
  if (!site.wa || !document.getElementById('cart-bar')) { // no cart on this site: just a WhatsApp question
    foot.append(h('a', { class: 'btn wide', href: ask, target: '_blank', rel: 'noopener' }, L.enquire));
    return;
  }
  if (q === 0) {
    const b = h('button', { type: 'button', class: 'btn wide' }, `${L.add} to order · ${money(p.price)}`);
    b.addEventListener('click', () => add(p.id));
    foot.append(b);
  } else {
    const minus = h('button', { type: 'button', class: 'step', 'aria-label': 'One less' }, '−');
    const plus = h('button', { type: 'button', class: 'step', 'aria-label': 'One more' }, '+');
    minus.addEventListener('click', () => set(p.id, q - 1));
    plus.addEventListener('click', () => set(p.id, q + 1));
    const view = h('button', { type: 'button', class: 'btn' }, `${L.viewOrder} · ${money(p.price * q)}`);
    view.addEventListener('click', () => { dlg.close(); document.dispatchEvent(new CustomEvent('open-cart')); });
    foot.append(h('div', { class: 'pd-actions' }, h('div', { class: 'stepper', role: 'group', 'aria-label': 'Quantity' }, minus, h('output', { class: 'qty', 'aria-live': 'polite' }, String(q)), plus), view));
  }
  foot.append(h('a', { class: 'linkbtn', href: ask, target: '_blank', rel: 'noopener' }, 'Ask a question on WhatsApp'));
}

export function openProduct(id: string) {
  const p = byId.get(id);
  if (!p) return;
  if (!wired) {
    dlg = document.getElementById('product-dialog') as HTMLDialogElement;
    body = dlg.querySelector('[data-body]')!; foot = dlg.querySelector('[data-foot]')!; title = dlg.querySelector('#pd-title')!;
    wireSheet(dlg);
    dlg.addEventListener('close', () => { spin?.destroy(); spin = null; off?.(); off = null; body.replaceChildren(); });
    wired = true;
  }
  spin?.destroy(); spin = null; off?.();
  current = p;
  title.textContent = p.name;
  body.replaceChildren(mediaBlock(p), infoBlock(p));
  body.scrollTop = 0;
  renderFoot();
  off = onChange(renderFoot);
  openSheet(dlg);
}