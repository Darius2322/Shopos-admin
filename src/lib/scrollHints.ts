/** Makes every scrolling menu easy to spot: a soft fade on the side that has more, a thin always-visible scroll bar, and the chosen tab slides into view.
 * Works on tab rows (overflow-x-auto) and on side menus (overflow-y-auto inside nav/aside). No change is needed in each screen. */
const X_SEL = '.overflow-x-auto, .overflow-x-scroll, [data-scroll-hint="x"]';
const Y_SEL = 'aside .overflow-y-auto, nav.overflow-y-auto, aside nav, [data-scroll-hint="y"]';
const seen = new WeakSet<Element>();

function paint(el: HTMLElement, axis: 'x' | 'y') {
  const size = axis === 'x' ? el.scrollWidth : el.scrollHeight; const view = axis === 'x' ? el.clientWidth : el.clientHeight; const pos = axis === 'x' ? el.scrollLeft : el.scrollTop;
  const over = size - view > 6;
  const a = over && pos > 4 ? '1' : '0'; const b = over && pos + view < size - 4 ? '1' : '0';
  const k = axis === 'x' ? 'sx' : 'sy';
  if (over) { if (el.dataset[k] !== '1') el.dataset[k] = '1'; } else if (el.dataset[k]) delete el.dataset[k];
  el.style.setProperty(axis === 'x' ? '--fl' : '--ft', a); el.style.setProperty(axis === 'x' ? '--fr' : '--fb', b);
}

function attach(el: HTMLElement, axis: 'x' | 'y') {
  if (seen.has(el)) return; seen.add(el);
  let raf = 0; const run = () => { raf = 0; paint(el, axis); };
  const queue = () => { if (!raf) raf = requestAnimationFrame(run); };
  el.addEventListener('scroll', queue, { passive: true });
  if (typeof ResizeObserver !== 'undefined') { const ro = new ResizeObserver(queue); ro.observe(el); }
  new MutationObserver(queue).observe(el, { childList: true, subtree: true, characterData: true });
  if (axis === 'x') {
    el.addEventListener('click', (e) => { const t = (e.target as HTMLElement | null)?.closest?.('[role="tab"], button, a') as HTMLElement | null; if (t && el.contains(t)) t.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' }); }, { passive: true });
    window.setTimeout(() => { const on = el.querySelector<HTMLElement>('[aria-selected="true"], [aria-current="page"], [aria-pressed="true"]'); if (on && el.scrollWidth > el.clientWidth + 6) el.scrollTo({ left: Math.max(0, on.offsetLeft - el.clientWidth / 2 + on.offsetWidth / 2), behavior: 'auto' }); queue(); }, 60);
  }
  queue();
}

function scan(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>(X_SEL).forEach((el) => attach(el, 'x'));
  root.querySelectorAll<HTMLElement>(Y_SEL).forEach((el) => { if (!el.matches(X_SEL)) attach(el, 'y'); });
}

export function initScrollHints() {
  if (typeof document === 'undefined') return;
  let t = 0; const later = () => { if (!t) t = window.setTimeout(() => { t = 0; scan(); }, 120); };
  scan();
  new MutationObserver(later).observe(document.body, { childList: true, subtree: true });
}
