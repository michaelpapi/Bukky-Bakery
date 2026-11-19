// Entry point. Small on purpose: the cart and the hero start now, the popups load only when needed.
import { lite } from './data';
import { initCart } from './cart';
import { initHero } from './hero';

initHero();
initCart();

// category chips: hide/show product cards
const chips = document.querySelectorAll<HTMLButtonElement>('.chip');
chips.forEach((chip) => {
  chip.addEventListener('click', () => {
    const f = chip.dataset.filter || '';
    chips.forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
    document.querySelectorAll<HTMLElement>('.card-wrap').forEach((card) => { card.hidden = f !== '' && card.dataset.cat !== f; });
  });
});

// touch "hover": a finger has no hover, so lift the product while it is pressed (the mouse uses CSS :hover)
let held: HTMLElement | null = null;
let liftTimer = 0;
let dropTimer = 0;
const dropLift = (now: boolean) => {
  clearTimeout(liftTimer);
  const c = held;
  held = null;
  if (!c) return;
  if (now) c.classList.remove('lift');
  else { clearTimeout(dropTimer); dropTimer = window.setTimeout(() => c.classList.remove('lift'), 380); } // a quick tap still shows the lift
};
document.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'mouse') return;
  const card = (e.target as Element).closest<HTMLElement>('.card');
  if (!card) return;
  clearTimeout(dropTimer);
  held?.classList.remove('lift');
  held = card;
  liftTimer = window.setTimeout(() => card.classList.add('lift'), 70); // short wait so a scroll flick does not make cards jump
});
document.addEventListener('pointerup', () => dropLift(false));
document.addEventListener('pointercancel', () => dropLift(true)); // the browser started scrolling: let go

// subscribe form (only on pages that have one)
if (document.querySelector('[data-subscribe]')) import('./subscribe');

// popups: loaded on first use
document.addEventListener('click', (e) => {
  const t = e.target as Element;
  const card = t.closest<HTMLElement>('[data-product]');
  if (card) { import('./product').then((m) => m.openProduct(card.dataset.product!)).catch(() => undefined); return; }
  const sched = t.closest<HTMLAnchorElement>('[data-open="schedule"]');
  if (sched) {
    e.preventDefault();
    import('./calendar').then((m) => m.openScheduler()).catch(() => window.open(sched.href, '_blank', 'noopener')); // offline: fall back to a plain WhatsApp message
  }
});

// warm the popups up when the phone is idle (not on data saver), so the first tap is instant
if (!lite() && 'requestIdleCallback' in window) {
  (window as any).requestIdleCallback(() => { import('./product'); import('./calendar'); }, { timeout: 6000 });
}