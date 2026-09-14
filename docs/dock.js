import { animate, spring } from 'animejs';

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

/* ═══════════════════════════════════════════════
   DOCK — macOS dock sizing, after imanolortega/mac-dock:
   item size is a linear falloff of the 2D cursor
   distance to the item's centre (200px reach), applied
   as layout so neighbours shuffle aside. The 0.1s
   ease-out transition is the dock's snap.
   ═══════════════════════════════════════════════ */
const dock = document.querySelector('.dock');

if (dock) {
  const items = [...dock.querySelectorAll('.dock-item')];
  const REACH = 200;
  const MIN_SIZE = 70;
  const MAX_SIZE = 95;
  const BASE_FONT = 11;
  const BASE_PAD_X = 15;
  const BASE_PAD_Y = 8;

  const applySize = (item, size) => {
    const grow = size / MIN_SIZE;
    item.style.fontSize = `${(BASE_FONT * grow).toFixed(2)}px`;
    item.style.padding = `${(BASE_PAD_Y * grow).toFixed(2)}px ${(BASE_PAD_X * grow).toFixed(2)}px`;
  };

  const reset = () => items.forEach((item) => applySize(item, MIN_SIZE));

  let centers = [];
  const measure = () => {
    centers = items.map((item) => {
      const rect = item.getBoundingClientRect();
      return { midX: rect.left + rect.width / 2, midY: rect.top + rect.height / 2 };
    });
  };

  const resize = (event) => {
    const x = event.clientX;
    const y = event.clientY;
    items.forEach((item, index) => {
      const { midX, midY } = centers[index];
      const distance = Math.hypot(x - midX, y - midY);
      const size = Math.max(MIN_SIZE, MAX_SIZE - (MAX_SIZE - MIN_SIZE) * (distance / REACH));
      applySize(item, size);
    });
  };

  if (finePointer && !reduced) {
    dock.addEventListener('pointerenter', (event) => {
      measure();
      resize(event);
    });
    dock.addEventListener('pointermove', resize);
    dock.addEventListener('pointerleave', reset);
  }

  window.addEventListener('resize', () => {
    measure();
    reset();
  }, { passive: true });

  /* click bounce — the dock icon hop, keyframes in styles.css */
  items.forEach((item) => {
    item.addEventListener('click', () => {
      item.classList.remove('is-bouncing');
      void item.offsetWidth;
      item.classList.add('is-bouncing');
    });
    item.addEventListener('animationend', () => item.classList.remove('is-bouncing'));
  });

  /* ═══════════════════════════════════════════════
     ACTIVE DOT — the "running app" marker tracks the
     section crossing the upper third of the viewport
     ═══════════════════════════════════════════════ */
  const sectionEntries = items
    .filter((item) => item.tagName === 'A' && /^#.+/.test(item.getAttribute('href') || ''))
    .map((link) => ({ link, element: document.getElementById(link.getAttribute('href').slice(1)) }))
    .filter((entry) => entry.element);

  if (sectionEntries.length) {
    const setActive = () => {
      const midline = window.innerHeight * 0.45;
      let activeEntry = null;
      sectionEntries.forEach((entry) => {
        if (entry.element.getBoundingClientRect().top <= midline) activeEntry = entry;
      });
      sectionEntries.forEach((entry) => entry.link.classList.toggle('is-active', entry === activeEntry));
    };
    window.addEventListener('scroll', setActive, { passive: true });
    setActive();
  }

  const brand = document.querySelector('.nav-brand');
  if (brand) {
    animate(brand, {
      opacity: [0, 1],
      y: [-10, 0],
      duration: 650,
      delay: 120,
      ease: 'outCubic',
    });
  }
}

/* ═══════════════════════════════════════════════
   CHROME HOVER — every CTA gains a chrome fill, a
   liquid background shift, and a sheen sweep driven
   by anime.js on pointer enter.
   ═══════════════════════════════════════════════ */
document.querySelectorAll('[data-cta], .copy-btn').forEach((button) => {
  if (button.dataset.chromeReady) return;
  button.dataset.chromeReady = '1';

  const chromeLayer = document.createElement('span');
  chromeLayer.className = 'btn-chrome';
  chromeLayer.setAttribute('aria-hidden', 'true');
  const sheen = document.createElement('span');
  sheen.className = 'btn-sheen';
  sheen.setAttribute('aria-hidden', 'true');
  button.prepend(chromeLayer, sheen);

  [...button.childNodes].forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
      const label = document.createElement('span');
      label.className = 'btn-label';
      node.replaceWith(label);
      label.append(node);
    }
  });

  const enter = () => {
    button.classList.add('is-chrome');
    if (reduced) {
      chromeLayer.style.opacity = '1';
      return;
    }
    animate(chromeLayer, { opacity: 1, duration: 340, ease: 'outQuad' });
    animate(chromeLayer, {
      backgroundPosition: ['0% 50%', '100% 50%'],
      duration: 1200,
      ease: 'outQuad',
    });
    animate(sheen, {
      translateX: '230%',
      skewX: '-18deg',
      duration: 820,
      delay: 40,
      ease: 'inOutCubic',
    });
  };

  const leave = () => {
    button.classList.remove('is-chrome');
    if (reduced) {
      chromeLayer.style.opacity = '0';
      return;
    }
    animate(chromeLayer, { opacity: 0, duration: 420, ease: 'outQuad' });
    animate(sheen, {
      translateX: '-150%',
      skewX: '-18deg',
      duration: 460,
      ease: 'outQuad',
    });
  };

  button.addEventListener('pointerenter', enter);
  button.addEventListener('pointerleave', leave);
  button.addEventListener('focus', enter);
  button.addEventListener('blur', leave);
});
