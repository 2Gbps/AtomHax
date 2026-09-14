import { animate, createTimeline, onScroll, stagger, splitText, spring, utils } from 'animejs';

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ═══════════════════════════════════════════════
   HERO ENTRANCE — sequenced:
   eyebrow tick draws → title char cascade (lift + rotate)
   → sub words de-blur → CTA + hint → stats rise
   ═══════════════════════════════════════════════ */
const heroTitle = splitText('[data-hero-title]', { chars: true });
const heroSub = splitText('[data-hero-sub]', { words: true });

createTimeline({ defaults: { ease: 'outExpo' } })
  .add('.hero-eyebrow', { opacity: [0, 1], duration: 500 }, 0)
  .add('.hero-eyebrow .eyebrow-tick', { width: [0, '26px'], duration: 500, ease: 'outCubic' }, 80)
  .add(heroTitle.chars, {
    translateY: ['110%', '0%'],
    rotate: [-9, 0],
    opacity: [0, 1],
    duration: 950,
    delay: stagger(24),
  }, 120)
  .add(heroSub.words, {
    translateY: [20, 0],
    opacity: [0, 1],
    filter: ['blur(6px)', 'blur(0px)'],
    duration: 700,
    delay: stagger(40),
  }, 420)
  .add('[data-cta]', { opacity: [0, 1], translateY: [16, 0], duration: 650 }, 640)
  .add('#atom-hint', { opacity: [0, 1], duration: 420 }, 780)
  .add('.stats-band .stat', {
    translateY: [22, 0],
    opacity: [0, 1],
    duration: 700,
    delay: stagger(110),
  }, 860);

/* ═══════════════════════════════════════════════
   SCROLL PROGRESS BAR — scrubbed to full page scroll
   ═══════════════════════════════════════════════ */
createTimeline({
  autoplay: onScroll({ target: document.body, sync: true }),
})
  .add('.scroll-progress', { scaleX: [0, 1], ease: 'linear', duration: 1000 });

/* ═══════════════════════════════════════════════
   HINT — breathing loop
   ═══════════════════════════════════════════════ */
if (!reduced) {
  animate('#atom-hint', {
    opacity: [0.35, 1],
    duration: 1900,
    alternate: true,
    loop: true,
    ease: 'inOutSine',
  });
}

/* ═══════════════════════════════════════════════
   STATS COUNTERS — above the fold → time-driven
   ═══════════════════════════════════════════════ */
document.querySelectorAll('[data-counter]').forEach((el, i) => {
  const target = Number(el.dataset.counter);
  const counter = { v: 0 };
  animate(counter, {
    v: target,
    duration: 1600,
    delay: 900 + i * 140,
    ease: 'outExpo',
    onUpdate: () => { el.textContent = String(Math.round(counter.v)); },
  });
});

/* ═══════════════════════════════════════════════
   SHOWCASE — media zoom only. The copy is static:
   no scroll-scrubbed entrance on the title.
   ═══════════════════════════════════════════════ */
if (!reduced) {
  createTimeline({
    autoplay: onScroll({ target: '.showcase', sync: true }),
  })
    .add('.showcase-media', { scale: [1, 1.16], ease: 'linear', duration: 1000 }, 0);
}

/* ═══════════════════════════════════════════════
   FEATURES — per-feature timelines:
   tick draw, eyebrow, word cascade, paragraph lift
   ═══════════════════════════════════════════════ */
document.querySelectorAll('[data-feature]').forEach((feature, featureIndex) => {
  const eyebrow = feature.querySelector('[data-eyebrow]');
  const tick = feature.querySelector('.eyebrow-tick');
  const heading = splitText(feature.querySelector('[data-feature-heading]'), { words: true });
  const desc = feature.querySelector('[data-feature-desc]');
  const code = feature.querySelector('[data-feature-code]');

  const featureTimeline = createTimeline({
    autoplay: onScroll({ target: feature }),
    defaults: { ease: 'outExpo' },
  })
    .add(eyebrow, { opacity: [0, 1], translateY: [-10, 0], duration: 420 }, 0)
    .add(tick, { width: [0, '26px'], duration: 420, ease: 'outCubic' }, 40)
    .add(heading.words, {
      translateY: [30, 0],
      opacity: [0, 1],
      duration: 820,
      delay: stagger(26),
    }, 60)
    .add(desc, { opacity: [0, 1], translateY: [26, 0], duration: 700 }, 320);

  if (code) {
    featureTimeline.add(code, { translateY: [30, 0], duration: 750, ease: 'outCubic' }, 440);

    /* decode-typing: every character surfaces in random order */
    const codeSplit = splitText(code, { chars: true });
    animate(codeSplit.chars, {
      opacity: [0, 1],
      duration: 240,
      delay: () => utils.random(120, 1250 + featureIndex * 120),
      ease: 'linear',
      autoplay: onScroll({ target: code }),
    });

    if (!reduced) {
      animate(code, {
        borderColor: ['rgba(255,255,255,0.5)', 'rgba(232,238,242,0.08)'],
        duration: 1500,
        delay: 420,
        ease: 'outCubic',
      });
    }
  }
});

/* ═══════════════════════════════════════════════
   DOWNLOAD — sequenced entrance + button glow pulse
   ═══════════════════════════════════════════════ */
const downloadTitle = splitText('.download [data-section-title]', { chars: true });

createTimeline({
  autoplay: onScroll({ target: '.download' }),
  defaults: { ease: 'outExpo' },
})
  .add('.download [data-eyebrow]', { opacity: [0, 1], duration: 420 }, 0)
  .add('.download .eyebrow-tick', { width: [0, '26px'], duration: 420, ease: 'outCubic' }, 40)
  .add(downloadTitle.chars, {
    translateY: ['110%', '0%'],
    rotate: [-7, 0],
    opacity: [0, 1],
    duration: 750,
    delay: stagger(13),
  }, 60)
  .add('.download [data-section-desc]', { opacity: [0, 1], translateY: [26, 0], duration: 700 }, 240)
  .add('.download [data-cta]', { opacity: [0, 1], translateY: [18, 0], duration: 700 }, 380)
  .add('.download [data-note]', { opacity: [0, 1], duration: 600 }, 520);

if (!reduced) {
  animate('.download-btn', {
    boxShadow: ['0 0 0 rgba(255,255,255,0)', '0 0 34px rgba(255,255,255,0.22)'],
    duration: 2100,
    alternate: true,
    loop: true,
    ease: 'inOutSine',
  });
}

/* ═══════════════════════════════════════════════
   CTA — spring hover scale + magnetic pull toward cursor
   ═══════════════════════════════════════════════ */
if (!reduced) {
  document.querySelectorAll('[data-cta]').forEach((cta) => {
    cta.addEventListener('mouseenter', () => {
      animate(cta, { scale: 1.045, duration: 400, ease: spring({ stiffness: 270, damping: 15 }) });
    });
    cta.addEventListener('mouseleave', () => {
      animate(cta, { scale: 1, x: 0, y: 0, duration: 520, ease: spring({ stiffness: 230, damping: 18 }) });
    });
    cta.addEventListener('pointermove', (event) => {
      const rect = cta.getBoundingClientRect();
      const relX = (event.clientX - rect.left - rect.width / 2) / rect.width;
      const relY = (event.clientY - rect.top - rect.height / 2) / rect.height;
      animate(cta, { x: relX * 12, y: relY * 8, duration: 420, ease: spring({ stiffness: 210, damping: 17 }) });
    });
  });
}

/* ═══════════════════════════════════════════════
   SCROLL VELOCITY SKEW — titles shear subtly with
   scroll speed, damped back through utils.damp
   ═══════════════════════════════════════════════ */
if (!reduced) {
  const shearTargets = [...document.querySelectorAll('[data-section-title], [data-feature-heading]')];
  let lastScrollY = window.scrollY;
  let shearCurrent = 0;
  let lastTime = performance.now();

  const shearLoop = (now) => {
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;
    const velocity = (window.scrollY - lastScrollY) / Math.max(dt, 0.001);
    lastScrollY = window.scrollY;
    const shearTarget = utils.clamp(velocity * 0.004, -5, 5);
    shearCurrent = utils.damp(shearCurrent, shearTarget, 9, dt);
    const shear = shearCurrent.toFixed(3);
    shearTargets.forEach((target) => {
      target.style.transform = `skewY(${shear}deg)`;
    });
    requestAnimationFrame(shearLoop);
  };
  requestAnimationFrame(shearLoop);
}
