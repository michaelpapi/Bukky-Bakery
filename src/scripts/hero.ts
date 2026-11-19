// Hero: waits for the cake pieces to be ready, then starts the drop-in intro (CSS does the animating);
// afterwards the cake leans toward the pointer / a dragging finger.
import { lite, reduced } from './data';

export function initHero() {
  const root = document.documentElement;
  const go = () => root.classList.add('intro-go');
  const imgs = [...document.querySelectorAll<HTMLImageElement>('.hero .piece img')];

  if (!imgs.length || lite() || reduced()) go();
  else {
    // start once the pieces are decoded so nothing pops in mid-fall; never wait longer than 1.8 s
    Promise.race([Promise.all(imgs.map((i) => i.decode().catch(() => undefined))), new Promise((r) => setTimeout(r, 1800))]).then(go);
  }

  const cake = document.querySelector<HTMLElement>('[data-cake]');
  const hero = document.querySelector<HTMLElement>('.hero');
  if (!cake || !hero || lite() || reduced()) return;

  let tx = 0, ty = 0, raf = 0, touching = false;
  const clamp = (n: number) => Math.max(-1, Math.min(1, n));
  const apply = () => { raf = 0; cake.style.setProperty('--tx', tx.toFixed(3)); cake.style.setProperty('--ty', ty.toFixed(3)); };
  const aim = (x: number, y: number, ref: DOMRect) => {
    const c = cake.getBoundingClientRect();
    tx = clamp((x - (c.left + c.width / 2)) / (ref.width * 0.5));
    ty = clamp((y - (c.top + c.height / 2)) / (ref.height * 0.5));
    cake.classList.add('tilting');
    if (!raf) raf = requestAnimationFrame(apply);
  };
  const rest = () => { tx = ty = 0; touching = false; cake.classList.remove('tilting'); if (!raf) raf = requestAnimationFrame(apply); };

  // mouse and pen: lean toward the pointer anywhere over the hero
  hero.addEventListener('pointermove', (e) => { if (e.pointerType !== 'touch') aim(e.clientX, e.clientY, hero.getBoundingClientRect()); });
  hero.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'touch') rest(); });
  // finger: drag on the cake (vertical scrolling still works, see touch-action in CSS)
  cake.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') { touching = true; aim(e.clientX, e.clientY, cake.getBoundingClientRect()); } });
  cake.addEventListener('pointermove', (e) => { if (touching && e.pointerType === 'touch') aim(e.clientX, e.clientY, cake.getBoundingClientRect()); });
  for (const t of ['pointerup', 'pointercancel'] as const) cake.addEventListener(t, (e) => { if (e.pointerType === 'touch') rest(); });
}
