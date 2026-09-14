import { animate, spring, utils } from 'animejs';

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

/* ═══════════════════════════════════════════════
   DOCK — macOS magnification: each item's scale
   and position are damped toward a target derived
   from cursor distance. Release falls back to rest.
   ═══════════════════════════════════════════════ */
const dock = document.querySelector('.dock');

if (dock) {
  const items = [...dock.querySelectorAll('.dock-item')];
  const MAGNIFY = { range: 130, scale: 0.5, lift: 9, push: 8 };

  const states = items.map((item, index) => ({
    item,
    index,
    center: 0,
    scale: reduced ? 1 : 0.55,
    y: reduced ? 0 : -16,
    x: 0,
    bounce: 0,
  }));

  let dockLeft = 0;
  const measure = () => {
    dockLeft = dock.getBoundingClientRect().left;
    states.forEach((state) => {
      state.center = state.item.offsetLeft + state.item.offsetWidth / 2;
    });
  };
  measure();

  let pointerX = null;
  const trackPointer = (event) => { pointerX = event.clientX; };

  if (finePointer && !reduced) {
    dock.addEventListener('pointerenter', trackPointer);
    dock.addEventListener('pointermove', trackPointer);
    dock.addEventListener('pointerleave', () => { pointerX = null; });
  }

  states.forEach((state) => {
    state.item.style.transitionDelay = `${state.index * 55}ms`;
    requestAnimationFrame(() => state.item.classList.add('is-ready'));

    state.item.addEventListener('click', () => {
      state.bounce = -6;
      animate(state, {
        bounce: 0,
        duration: 900,
        ease: spring({ stiffness: 260, damping: 11 }),
      });
    });
  });

  let lastTime = performance.now();
  const dockLoop = (now) => {
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;

    states.forEach((state) => {
      let targetScale = 1;
      let targetX = 0;
      let targetY = 0;

      if (pointerX !== null) {
        const delta = pointerX - dockLeft - state.center;
        const influence = Math.max(0, 1 - Math.abs(delta) / MAGNIFY.range);
        const eased = influence * influence * (3 - 2 * influence);
        targetScale = 1 + MAGNIFY.scale * eased;
        targetY = MAGNIFY.lift * eased;
        targetX = -Math.sign(delta) * MAGNIFY.push * eased;
      }

      state.scale = utils.damp(state.scale, targetScale, 11, dt);
      state.x = utils.damp(state.x, targetX, 11, dt);
      state.y = utils.damp(state.y, targetY, 11, dt);
      state.item.style.transform =
        `translate3d(${state.x.toFixed(2)}px, ${(state.y + state.bounce).toFixed(2)}px, 0) scale(${state.scale.toFixed(4)})`;
    });

    requestAnimationFrame(dockLoop);
  };
  requestAnimationFrame(dockLoop);

  window.addEventListener('resize', measure, { passive: true });

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
