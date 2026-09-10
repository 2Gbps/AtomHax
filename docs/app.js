import { animate, createTimeline, onScroll, stagger, splitText, spring } from 'animejs';

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ═══════════════════════════════════════════════════
   HERO ENTRANCE — sequenced timeline:
   eyebrow → title char cascade → sub words → CTA → hint → stats
   ═══════════════════════════════════════════════════ */
const heroTitle = splitText('[data-hero-title]', { chars: true });
const heroSub = splitText('[data-hero-sub]', { words: true });

createTimeline({ defaults: { ease: 'outExpo' } })
  .add('.hero-eyebrow', { opacity: [0, 1], duration: 500 }, 0)
  .add(heroTitle.chars, {
    translateY: ['110%', '0%'],
    rotate: [-8, 0],
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

/* ═══════════════════════════════════════════════════
   SCROLL PROGRESS BAR — scrubbed to full page scroll
   ═══════════════════════════════════════════════════ */
createTimeline({
  autoplay: onScroll({ target: document.body, sync: true }),
})
  .add('.scroll-progress', { scaleX: [0, 1], ease: 'linear', duration: 1000 });

/* ═══════════════════════════════════════════════════
   HINT — breathing loop
   ═══════════════════════════════════════════════════ */
if (!reduced) {
  animate('#atom-hint', {
    opacity: [0.35, 1],
    duration: 1900,
    alternate: true,
    loop: true,
    ease: 'inOutSine',
  });
}

/* ═══════════════════════════════════════════════════
   STATS COUNTERS — hero is above the fold → time-driven
   ═══════════════════════════════════════════════════ */
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

/* ═══════════════════════════════════════════════════
   SHOWCASE — pinned scrub: media zoom + text entrance
   ═══════════════════════════════════════════════════ */
const showcaseTitle = splitText('.showcase [data-section-title]', { chars: true });

if (!reduced) {
  createTimeline({
    autoplay: onScroll({ target: '.showcase', sync: true }),
  })
    .add('.showcase-media', { scale: [1, 1.16], ease: 'linear', duration: 550 }, 0)
    .add('.showcase .section-eyebrow', { opacity: [0, 1], duration: 90 }, 60)
    .add(showcaseTitle.chars, {
      translateY: ['110%', '0%'],
      opacity: [0, 1],
      duration: 500,
      delay: stagger(12),
    }, 90)
    .add('.showcase [data-section-desc]', {
      opacity: [0, 1],
      translateY: [22, 0],
      duration: 220,
    }, 260);
}

/* ═══════════════════════════════════════════════════
   FEATURES — per-feature timelines: eyebrow, word cascade,
   paragraph lift, code block slide + border draw
   ═══════════════════════════════════════════════════ */
document.querySelectorAll('[data-feature]').forEach((feature, featureIndex) => {
  const eyebrow = feature.querySelector('[data-eyebrow]');
  const heading = splitText(feature.querySelector('[data-feature-heading]'), { words: true });
  const desc = feature.querySelector('[data-feature-desc]');
  const code = feature.querySelector('[data-feature-code]');

  const featureTimeline = createTimeline({
    autoplay: onScroll({ target: feature }),
    defaults: { ease: 'outExpo' },
  })
    .add(eyebrow, { opacity: [0, 1], translateY: [-10, 0], duration: 420 }, 0)
    .add(heading.words, {
      translateY: [30, 0],
      opacity: [0, 1],
      duration: 820,
      delay: stagger(26),
    }, 60)
    .add(desc, { opacity: [0, 1], translateY: [26, 0], duration: 700 }, 300);

  if (code) {
    featureTimeline.add(code, { opacity: [0, 1], translateY: [30, 0], duration: 750, ease: 'outCubic' }, 430);
    if (!reduced) {
      animate(code, {
        borderColor: ['rgba(232,238,242,0.35)', 'rgba(232,238,242,0.08)'],
        duration: 1400,
        delay: 500 + featureIndex * 100,
        ease: 'outCubic',
      });
    }
  }
});

/* ═══════════════════════════════════════════════════
   DOWNLOAD — sequenced entrance on enter
   ═══════════════════════════════════════════════════ */
const downloadTitle = splitText('.download [data-section-title]', { chars: true });

createTimeline({
  autoplay: onScroll({ target: '.download' }),
  defaults: { ease: 'outExpo' },
})
  .add('.download [data-eyebrow]', { opacity: [0, 1], duration: 420 }, 0)
  .add(downloadTitle.chars, {
    translateY: ['110%', '0%'],
    opacity: [0, 1],
    duration: 750,
    delay: stagger(13),
  }, 60)
  .add('.download [data-section-desc]', { opacity: [0, 1], translateY: [26, 0], duration: 700 }, 240)
  .add('.download [data-cta]', { opacity: [0, 1], translateY: [18, 0], duration: 700 }, 380)
  .add('.download [data-note]', { opacity: [0, 1], duration: 600 }, 520);

/* ═══════════════════════════════════════════════════
   CTA HOVER — anime.js spring on the element itself
   ═══════════════════════════════════════════════════ */
if (!reduced) {
  document.querySelectorAll('[data-cta]').forEach((cta) => {
    cta.addEventListener('mouseenter', () => {
      animate(cta, { scale: 1.045, duration: 400, ease: spring({ stiffness: 270, damping: 15 }) });
    });
    cta.addEventListener('mouseleave', () => {
      animate(cta, { scale: 1, duration: 460, ease: spring({ stiffness: 230, damping: 18 }) });
    });
  });
}

/* ═══════════════════════════════════════════════════
   NAV — entrance
   ═══════════════════════════════════════════════════ */
animate('.nav-brand', { opacity: [0, 1], translateY: [-12, 0], duration: 600, ease: 'outCubic' });
animate('.nav-links a', {
  opacity: [0, 1],
  translateY: [-10, 0],
  duration: 500,
  delay: stagger(70, { start: 200 }),
  ease: 'outCubic',
});
