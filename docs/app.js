import { animate, createTimeline, onScroll } from 'animejs';

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ═══════════════════════════════════════════════
   HERO ENTRANCE — subtle Apple-like fade & lift
   ═══════════════════════════════════════════════ */
const heroCopy = document.querySelector('.hero-copy');
const heroActions = document.querySelector('.hero-actions');
const statsBand = document.querySelector('.stats-band');

if (heroCopy && !reduced) {
  createTimeline({ defaults: { ease: 'outExpo' } })
    .add('.tag-badge', { opacity: [0, 1], translateY: [-8, 0], duration: 500 }, 50)
    .add('.hero-title', { opacity: [0, 1], translateY: [20, 0], duration: 750 }, 150)
    .add('.hero-sub', { opacity: [0, 1], translateY: [15, 0], duration: 650 }, 300)
    .add(heroActions, { opacity: [0, 1], translateY: [12, 0], duration: 600 }, 450)
    .add(statsBand, { opacity: [0, 1], translateY: [15, 0], duration: 650 }, 600);
}

/* ═══════════════════════════════════════════════
   SCROLL PROGRESS BAR
   ═══════════════════════════════════════════════ */
const progress = document.querySelector('.scroll-progress');
if (progress) {
  createTimeline({
    autoplay: onScroll({ target: document.body, sync: true }),
  }).add(progress, { scaleX: [0, 1], ease: 'linear', duration: 1000 });
}

/* ═══════════════════════════════════════════════
   BUTTON HOVER & CLICK STYLING
   ═══════════════════════════════════════════════ */
document.querySelectorAll('.btn, .nav-btn').forEach((btn) => {
  btn.addEventListener('mouseenter', () => {
    if (!reduced) {
      animate(btn, { scale: 1.025, duration: 180, ease: 'outQuad' });
    }
  });
  btn.addEventListener('mouseleave', () => {
    if (!reduced) {
      animate(btn, { scale: 1, duration: 180, ease: 'outQuad' });
    }
  });
});

/* ═══════════════════════════════════════════════
   NAV HIGHLIGHTING ON SCROLL
   ═══════════════════════════════════════════════ */
const navLinks = document.querySelectorAll('.nav-link');
const trackedSections = [
  { id: 'hero', link: null },
  { id: 'showcase', link: document.querySelector('.nav-link[href="#showcase"]') },
  { id: 'features', link: document.querySelector('.nav-link[href="#features"]') }
];

const updateActiveNav = () => {
  const midline = window.innerHeight * 0.35;
  let currentActive = null;
  trackedSections.forEach((sec) => {
    const el = document.getElementById(sec.id);
    if (el && el.getBoundingClientRect().top <= midline) {
      currentActive = sec.link;
    }
  });

  navLinks.forEach((link) => {
    if (link === currentActive) {
      link.classList.add('is-active');
    } else {
      link.classList.remove('is-active');
    }
  });
};

window.addEventListener('scroll', updateActiveNav, { passive: true });
updateActiveNav();
