import { animate, stagger } from 'animejs';

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

/* ═══════════════════════════════════════════════
   DOCK — Fluid macOS dock magnification without clunkiness
   ═══════════════════════════════════════════════ */
const dock = document.querySelector('.dock');

if (dock) {
  const items = [...dock.querySelectorAll('.dock-item')];
  const REACH = 170;          // pointer influence radius, px
  const MAX_SCALE = 1.32;     // peak magnification under the pointer
  const PUSH_X = 8;           // horizontal shove applied to neighbors, px
  const LIFT_Y = 3;           // vertical lift at the pointer, px
  const TRACKING = 'transform 70ms linear';
  const SETTLING = 'transform 360ms cubic-bezier(0.34, 1.56, 0.64, 1)';

  let centers = [];
  const measure = () => {
    centers = items.map((item) => {
      const rect = item.getBoundingClientRect();
      return { midX: rect.left + rect.width / 2 };
    });
  };
  measure();

  let entranceDone = reduced;   // pointer physics unlocks once the entrance settles

  const handlePointerMove = (e) => {
    if (!finePointer || reduced || !entranceDone) return;
    const x = e.clientX;
    items.forEach((item, i) => {
      const midX = centers[i] ? centers[i].midX : 0;
      const dist = Math.abs(x - midX);
      if (dist < REACH) {
        const falloff = 1 - dist / REACH;
        const eased = falloff * falloff * (3 - 2 * falloff);   // smoothstep — gentle shoulders
        const scale = 1 + (MAX_SCALE - 1) * eased;
        const shove = (midX >= x ? 1 : -1) * PUSH_X * eased * eased;
        item.style.transition = TRACKING;
        item.style.transform =
          `translate3d(${shove.toFixed(2)}px, ${(-LIFT_Y * eased).toFixed(2)}px, 0) scale(${scale.toFixed(3)})`;
      } else {
        item.style.transition = SETTLING;
        item.style.transform = 'translate3d(0, 0, 0) scale(1)';
      }
    });
  };

  const handlePointerLeave = () => {
    items.forEach((item) => {
      item.style.transition = SETTLING;
      item.style.transform = 'translate3d(0, 0, 0) scale(1)';
    });
  };

  dock.addEventListener('pointerenter', measure);
  dock.addEventListener('pointermove', handlePointerMove);
  dock.addEventListener('pointerleave', handlePointerLeave);
  window.addEventListener('resize', measure, { passive: true });

  /* Entrance — items rise into place, then the pointer drives the physics */
  if (!reduced) {
    items.forEach((item) => {
      item.style.opacity = '0';
    });
    try {
      animate(items, {
        opacity: [0, 1],
        translateY: [-14, 0],
        delay: stagger(55, { start: 160 }),
        duration: 560,
        ease: 'outCubic',
        onComplete: () => { entranceDone = true; },
      });
    } catch (e) {
      items.forEach((item) => {
        item.style.opacity = '1';
      });
      entranceDone = true;
    }
  }

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
