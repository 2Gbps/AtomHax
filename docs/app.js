import { animate, createTimeline } from 'animejs';

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ═══════════════════════════════════════════════
   HERO ENTRANCE — clean, immediate presentation
   ═══════════════════════════════════════════════ */
const heroCopy = document.querySelector('.hero-copy');
const statsBand = document.querySelector('.stats-band');

if (heroCopy && !reduced) {
  createTimeline({ defaults: { ease: 'outExpo' } })
    .add('.tag-badge', { opacity: [0, 1], translateY: [-6, 0], duration: 400 }, 40)
    .add('.hero-title', { opacity: [0, 1], translateY: [16, 0], duration: 650 }, 120)
    .add('.hero-sub', { opacity: [0, 1], translateY: [12, 0], duration: 550 }, 220)
    .add('.hero-actions', { opacity: [0, 1], translateY: [10, 0], duration: 500 }, 320)
    .add(statsBand, { opacity: [0, 1], translateY: [12, 0], duration: 550 }, 420);
}
