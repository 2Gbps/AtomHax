import { animate, spring } from 'animejs';

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

/* ═══════════════════════════════════════════════
   DOCK — Fluid macOS dock magnification without clunkiness
   ═══════════════════════════════════════════════ */
const dock = document.querySelector('.dock');

if (dock) {
  const items = [...dock.querySelectorAll('.dock-item')];
  const REACH = 140;
  const BASE_SCALE = 1.0;
  const MAX_SCALE = 1.22;

  let centers = [];
  const measure = () => {
    centers = items.map((item) => {
      const rect = item.getBoundingClientRect();
      return { midX: rect.left + rect.width / 2 };
    });
  };

  const handlePointerMove = (e) => {
    if (!finePointer || reduced) return;
    const x = e.clientX;
    items.forEach((item, i) => {
      const midX = centers[i] ? centers[i].midX : 0;
      const dist = Math.abs(x - midX);
      if (dist < REACH) {
        const factor = 1 - dist / REACH;
        const scale = BASE_SCALE + (MAX_SCALE - BASE_SCALE) * Math.sin(factor * Math.PI * 0.5);
        item.style.transform = `scale(${scale.toFixed(3)}) translateY(-2px)`;
      } else {
        item.style.transform = 'scale(1) translateY(0)';
      }
    });
  };

  const handlePointerLeave = () => {
    items.forEach((item) => {
      item.style.transform = 'scale(1) translateY(0)';
    });
  };

  dock.addEventListener('pointerenter', measure);
  dock.addEventListener('pointermove', handlePointerMove);
  dock.addEventListener('pointerleave', handlePointerLeave);
  window.addEventListener('resize', measure, { passive: true });

  /* Active dot tracking based on viewport scroll position */
  const sectionEntries = items
    .filter((item) => item.tagName === 'A' && /^#.+/.test(item.getAttribute('href') || ''))
    .map((link) => ({ link, element: document.getElementById(link.getAttribute('href').slice(1)) }))
    .filter((entry) => entry.element);

  if (sectionEntries.length) {
    const setActive = () => {
      const scrollY = window.scrollY + window.innerHeight * 0.35;
      let activeEntry = sectionEntries[0];
      sectionEntries.forEach((entry) => {
        if (entry.element.offsetTop <= scrollY) {
          activeEntry = entry;
        }
      });
      sectionEntries.forEach((entry) => {
        entry.link.classList.toggle('is-active', entry === activeEntry);
      });
    };
    window.addEventListener('scroll', setActive, { passive: true });
    setActive();
  }

  const brand = document.querySelector('.nav-brand');
  if (brand && !reduced) {
    animate(brand, {
      opacity: [0, 1],
      y: [-8, 0],
      duration: 500,
      ease: 'outCubic',
    });
  }
}

/* ═══════════════════════════════════════════════
   CHROME BUTTONS — reflective metallic sweep
   ═══════════════════════════════════════════════ */
document.querySelectorAll('.btn-chrome, .download-btn').forEach((button) => {
  if (button.dataset.chromeReady) return;
  button.dataset.chromeReady = '1';

  const sheen = document.createElement('span');
  sheen.className = 'btn-sheen';
  sheen.style.cssText = `
    position: absolute;
    top: -50%;
    bottom: -50%;
    left: -60%;
    width: 50%;
    background: linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.7) 50%, rgba(255,255,255,0) 100%);
    transform: skewX(-20deg);
    pointer-events: none;
    opacity: 0;
  `;
  button.prepend(sheen);

  button.addEventListener('mouseenter', () => {
    if (reduced) return;
    sheen.style.opacity = '1';
    animate(sheen, {
      left: ['-60%', '160%'],
      duration: 650,
      ease: 'outCubic',
    });
  });
});
