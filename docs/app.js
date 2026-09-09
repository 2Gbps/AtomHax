(() => {
  "use strict";

  const root = document.documentElement;
  const body = document.body;
  const header = document.querySelector(".site-header");
  const progress = document.querySelector(".scroll-progress");
  const sceneName = document.querySelector("[data-scene-name]");
  const sceneCoordinate = document.querySelector("[data-scene-coordinate]");
  const sections = [...document.querySelectorAll(".chapter")];
  const indexButtons = [...document.querySelectorAll(".side-index button")];
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const sceneLabels = ["origin / 01", "frame path / 02", "script surface / 03", "room shell / 04", "enter / 05"];

  root.classList.add("js");

  const setActive = (section) => {
    const index = Number(section.dataset.index || 0);
    body.dataset.active = section.dataset.scene || "intro";
    sections.forEach((candidate) => candidate.classList.toggle("is-active", candidate === section));
    indexButtons.forEach((button) => button.classList.toggle("is-active", button.dataset.jump === section.id));
    if (sceneName) sceneName.textContent = sceneLabels[index] || sceneLabels[0];
    window.dispatchEvent(new CustomEvent("atom-scene-change", { detail: { index, name: section.dataset.scene } }));
  };

  const sectionObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) setActive(entry.target);
    });
  }, { threshold: 0.55 });

  sections.forEach((section) => sectionObserver.observe(section));
  setActive(sections[0]);

  indexButtons.forEach((button) => {
    button.addEventListener("click", () => {
      document.getElementById(button.dataset.jump)?.scrollIntoView({ behavior: reduced ? "auto" : "smooth" });
    });
  });

  let scrollFrame = 0;
  let latestProgress = 0;
  const updateScroll = () => {
    const scrollable = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    latestProgress = Math.min(1, Math.max(0, window.scrollY / scrollable));
    root.style.setProperty("--scroll-progress", latestProgress.toFixed(4));
    if (progress) progress.style.width = `${latestProgress * 100}%`;
    if (header) header.classList.toggle("is-scrolled", window.scrollY > 14);
    const sectionIndex = Math.min(4, Math.floor(latestProgress * 5));
    if (sceneCoordinate) sceneCoordinate.textContent = `${String(Math.round(latestProgress * 360)).padStart(3, "0")}.00 / 360.00`;
    window.dispatchEvent(new CustomEvent("atom-scroll", { detail: { progress: latestProgress, sectionIndex } }));
    scrollFrame = 0;
  };

  window.addEventListener("scroll", () => {
    if (!scrollFrame) scrollFrame = window.requestAnimationFrame(updateScroll);
  }, { passive: true });
  updateScroll();

  const menuToggle = document.querySelector(".menu-toggle");
  menuToggle?.addEventListener("click", () => {
    const open = body.classList.toggle("menu-open");
    menuToggle.setAttribute("aria-expanded", String(open));
  });

  document.querySelectorAll("[data-reveal]").forEach((element, index) => {
    element.style.setProperty("--reveal-delay", `${index * 60}ms`);
  });

  const animateSection = (section) => {
    section.querySelectorAll("[data-reveal]").forEach((element) => {
      element.classList.remove("revealed");
      requestAnimationFrame(() => element.classList.add("revealed"));
    });
  };

  sections.forEach((section) => {
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) animateSection(section);
    }, { threshold: 0.42 });
    observer.observe(section);
  });

  window.addEventListener("pointermove", (event) => {
    root.style.setProperty("--pointer-x", (event.clientX / window.innerWidth - 0.5).toFixed(4));
    root.style.setProperty("--pointer-y", (event.clientY / window.innerHeight - 0.5).toFixed(4));
    window.dispatchEvent(new CustomEvent("atom-pointer", {
      detail: { x: event.clientX / window.innerWidth, y: event.clientY / window.innerHeight },
    }));
  }, { passive: true });

  const loadAnime = async () => {
    if (reduced) return null;
    try {
      return await import("https://cdn.jsdelivr.net/npm/animejs@4.0.2/lib/anime.esm.min.js");
    } catch {
      return null;
    }
  };

  loadAnime().then((anime) => {
    if (!anime) return;
    const { animate } = anime;
    window.addEventListener("atom-scene-change", (event) => {
      const section = sections[event.detail.index];
      if (!section) return;
      animate(section.querySelectorAll("[data-reveal]"), {
        opacity: [0, 1],
        translateY: [18, 0],
        duration: 850,
        delay: anime.stagger(55),
        ease: "outExpo",
      });
    });
  });
})();
