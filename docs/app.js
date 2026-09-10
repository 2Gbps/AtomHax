import { animate, createTimeline, onScroll, stagger, splitText, spring } from 'animejs';

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ─── HERO: entrance cascade ─── */
const title = splitText('[data-hero-title]', { chars: true });
animate(title.chars, {
  translateY: ['110%', '0%'],
  opacity: [0, 1],
  duration: 900,
  delay: stagger(26),
  ease: 'outExpo',
});

const sub = splitText('[data-hero-sub]', { words: true });
animate(sub.words, {
  translateY: [18, 0],
  opacity: [0, 1],
  duration: 700,
  delay: stagger(45, { start: 350 }),
  ease: 'outCubic',
});

animate('.hero-eyebrow', { opacity: [0, 1], duration: 600, delay: 100, ease: 'outCubic' });
animate('[data-cta]', { opacity: [0, 1], translateY: [16, 0], duration: 700, delay: 650, ease: 'outCubic' });

/* ─── ATOM HINT: breathing loop ─── */
if (!reduced) {
  animate('#atom-hint', {
    opacity: [0.35, 1],
    duration: 1800,
    alternate: true,
    loop: true,
    ease: 'inOutSine',
  });
}

/* ─── STATS COUNTERS: above the fold → time-based ─── */
document.querySelectorAll('[data-counter]').forEach((el, i) => {
  const target = Number(el.dataset.counter);
  const counter = { v: 0 };
  animate(counter, {
    v: target,
    duration: 1500,
    delay: 700 + i * 120,
    ease: 'outExpo',
    onUpdate: () => { el.textContent = String(Math.round(counter.v)); },
  });
});

/* ─── SHOWCASE: pinned scrub timeline ─── */
if (!reduced) {
  createTimeline({
    autoplay: onScroll({ target: '.showcase', sync: true }),
  })
    .add('.showcase-media', { scale: [1, 1.14], duration: 600, ease: 'linear' })
    .add('.showcase-content [data-eyebrow]', { opacity: [0, 1], duration: 100 }, 80)
    .add('.showcase-content [data-section-title]', { opacity: [0.5, 1], duration: 150 }, 180)
    .add('.showcase-content [data-section-desc]', { opacity: [0, 1], translateY: [22, 0], duration: 170 }, 240);
}

/* ─── SECTION TITLES: chars cascade on enter ─── */
document.querySelectorAll('[data-section-title]').forEach((el) => {
  const split = splitText(el, { chars: true });
  animate(split.chars, {
    translateY: ['110%', '0%'],
    opacity: [0, 1],
    duration: 700,
    delay: stagger(14),
    ease: 'outExpo',
    autoplay: onScroll({ target: el }),
  });
});

/* ─── FEATURES: staggered reveals ─── */
document.querySelectorAll('[data-feature]').forEach((feature) => {
  const heading = splitText(feature.querySelector('[data-feature-heading]'), { words: true });
  animate(heading.words, {
    translateY: [26, 0],
    opacity: [0, 1],
    duration: 800,
    delay: stagger(28),
    ease: 'outExpo',
    autoplay: onScroll({ target: feature }),
  });
  animate(feature.querySelectorAll('[data-feature-desc], [data-feature-code]'), {
    translateY: [28, 0],
    opacity: [0, 1],
    duration: 800,
    delay: stagger(90),
    ease: 'outCubic',
    autoplay: onScroll({ target: feature }),
  });
});

/* ─── DOWNLOAD section ─── */
animate('.download [data-eyebrow], .download [data-section-desc], .download [data-cta], .download [data-note]', {
  translateY: [26, 0],
  opacity: [0, 1],
  duration: 800,
  delay: stagger(80),
  ease: 'outExpo',
  autoplay: onScroll({ target: '.download' }),
});
