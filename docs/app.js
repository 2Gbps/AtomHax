(() => {
  "use strict";

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const hasGsap = typeof window.gsap !== "undefined"
    && typeof window.ScrollTrigger !== "undefined";

  if (!hasGsap || reduced) return;

  gsap.registerPlugin(ScrollTrigger);

  /* ─── HERO ENTRANCE ─── */
  gsap.from("[data-hero-title] .hero-line", {
    y: 64,
    opacity: 0,
    duration: 1.1,
    ease: "power3.out",
    stagger: 0.12,
    delay: 0.15,
  });
  gsap.from("[data-hero-sub]", { y: 28, opacity: 0, duration: 0.9, delay: 0.45, ease: "power2.out" });
  gsap.from("[data-hero-cta]", { y: 24, opacity: 0, duration: 0.9, delay: 0.58, ease: "power2.out" });
  gsap.from("[data-hero-meta]", { opacity: 0, duration: 0.9, delay: 0.7, ease: "power2.out" });
  gsap.from(".hero-scroll", { opacity: 0, duration: 1, delay: 0.9 });

  /* hero atom: drop in, then idle float */
  gsap.from(".atom-card-hero", {
    y: -60,
    opacity: 0,
    rotateX: -35,
    duration: 1.4,
    delay: 0.35,
    ease: "power3.out",
  });
  gsap.to(".atom-card-hero", {
    y: -14,
    rotateY: 10,
    duration: 3.2,
    yoyo: true,
    repeat: -1,
    ease: "sine.inOut",
    delay: 1.8,
  });

  /* ─── ATOM PIN SCROLL-STOPPER ───
     .atom-pin (350vh runway) + position:sticky inner pin the card natively.
     ScrollTrigger only maps scroll progress to the rotation timeline. */
  const captions = gsap.utils.toArray(".atom-caption");
  const progressEl = document.querySelector("[data-atom-progress]");

  const atomTl = gsap.timeline({
    scrollTrigger: {
      trigger: ".atom-pin",
      start: "top top",
      end: "bottom bottom",
      scrub: 0.6,
      onUpdate(self) {
        if (progressEl) {
          progressEl.textContent = String(Math.round(self.progress * 360)).padStart(3, "0");
        }
      },
    },
  });

  atomTl
    .fromTo(".atom-card-big",
      { scale: 0.72, rotateX: -22, rotateY: -18 },
      { scale: 1, rotateX: -6, rotateY: 0, ease: "none", duration: 0.18 })
    .to(".atom-card-big", { rotateY: 360, rotateX: 6, ease: "none", duration: 0.62 })
    .to(".atom-card-big", { scale: 0.94, ease: "none", duration: 0.2 })
    .to(".atom-ring-a", { scale: 1.18, opacity: 0.4, ease: "none", duration: 1 }, 0)
    .to(".atom-ring-b", { scale: 0.86, opacity: 0.3, ease: "none", duration: 1 }, 0)
    .to(".atom-ring-c", { scale: 1.08, ease: "none", duration: 1 }, 0);

  if (captions.length >= 3) {
    const showCaption = (index) => {
      captions.forEach((el, i) => {
        el.classList.toggle("is-active", i === index);
      });
    };
    ScrollTrigger.create({
      trigger: ".atom-pin",
      start: "top top",
      end: "bottom bottom",
      onUpdate(self) {
        const p = self.progress;
        if (p < 0.34) showCaption(0);
        else if (p < 0.7) showCaption(1);
        else showCaption(2);
      },
    });
  }

  /* ─── FEATURE REVEALS ─── */
  document.querySelectorAll("[data-reveal-group]").forEach((group) => {
    gsap.from(group.querySelectorAll("[data-reveal]"), {
      y: 40,
      opacity: 0,
      duration: 1,
      ease: "power3.out",
      stagger: 0.09,
      scrollTrigger: {
        trigger: group,
        start: "top 76%",
      },
    });
  });

  gsap.from(".feature-alt", {
    backgroundColor: "rgba(11,27,42,0)",
    ease: "none",
    scrollTrigger: { trigger: ".feature-alt", start: "top bottom", end: "top 40%", scrub: true },
  });

  /* ─── GAMEPLAY ─── */
  gsap.fromTo(".gameplay-media", { scale: 1 }, {
    scale: 1.14,
    ease: "none",
    scrollTrigger: {
      trigger: ".gameplay",
      start: "top bottom",
      end: "bottom top",
      scrub: true,
    },
  });
  gsap.from(".gameplay-content [data-reveal]", {
    y: 44,
    opacity: 0,
    duration: 1,
    ease: "power3.out",
    stagger: 0.1,
    scrollTrigger: { trigger: ".gameplay", start: "top 62%" },
  });

  ScrollTrigger.refresh();
  window.addEventListener("load", () => ScrollTrigger.refresh());
})();
