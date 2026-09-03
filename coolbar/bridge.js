// nyxcoolbar bridge — runs in the MAIN frame (top-level document).
// Injected by main.js right after inject.js. Creates the overlay canvas,
// boots the WASM module, wires window.nyxCoolbarBridge to app actions, and
// forwards input to the module.
//
// INPUT has two sources, and whichever fires last wins:
//   1. The PARENT document's own events — these fire whenever the cursor is
//      over parent-DOM (room list, menus, header, etc.).
//   2. A forwarder injected INTO the gameframe (GAMEFRAME_FORWARDER in
//      main.js) — fires when the cursor is over the in-game iframe, which
//      would otherwise swallow all mouse events from the parent.
// Both post the same shape, so the sidebar shows/hides correctly everywhere.
//
// VISIBILITY / PERFORMANCE: the sidebar is ALWAYS visible as a thin icon bar
// (COLLAPSE_W). When the cursor approaches the left edge it EXPANDS to
// STRIP_W with labels; when the cursor stays away for COLLAPSE_DELAY ms it
// shrinks back. Shrinking to a 44px composited strip (instead of display:none)
// keeps the game at full fps while guaranteeing the bar is always on screen —
// a display:none approach made the bar effectively invisible.
(function () {
  if (window.__nyxCoolbarBooted) return;
  window.__nyxCoolbarBooted = true;

  const STRIP_W = 260;
  const SHOW_MARGIN = 40;
  const COLLAPSE_W = 44;
  const COLLAPSE_DELAY = 1800;
  const dpr = window.devicePixelRatio || 1;
  let canvas = document.getElementById("nyx-coolbar-canvas");
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.id = "nyx-coolbar-canvas";
    canvas.tabIndex = 0;
    canvas.style.cssText =
      "position:fixed;top:0;left:0;height:100vh;" +
      "pointer-events:none;z-index:2147483000;";
    document.documentElement.appendChild(canvas);
  }

  let expanded = false;
  let collapseTimer = null;

  // Emscripten attaches exported C functions with a leading underscore.
  const call = (name, ...args) => {
    const mod = window.__nyxCoolbarMod;
    if (!mod) return;
    const f = mod["_" + name] || mod[name];
    if (typeof f === "function") return f(...args);
  };

  function resize() {
    const w = expanded ? STRIP_W : COLLAPSE_W;
    canvas.style.width = w + "px";
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    call("nyxSetDisplaySize", w, window.innerHeight, dpr);
  }

  function setExpanded(v) {
    if (v === expanded) return;
    expanded = v;
    resize();
    const mod = window.__nyxCoolbarMod;
    if (mod) {
      if (v) {
        if (mod.resumeMainLoop) mod.resumeMainLoop();
      } else {
        // stay rendered (collapsed bar is tiny); keep the loop ticking so the
        // dock's collapsed icons stay painted
      }
    }
  }

  function onMouse(x, y) {
    if (x <= STRIP_W + SHOW_MARGIN) {
      if (collapseTimer) { clearTimeout(collapseTimer); collapseTimer = null; }
      setExpanded(true);
    } else {
      if (!collapseTimer) {
        collapseTimer = setTimeout(() => {
          collapseTimer = null;
          setExpanded(false);
        }, COLLAPSE_DELAY);
      }
    }
    call("nyxFeedMouse", x, y);
  }

  // ── action dispatch: ids must match NyxAction in main.cpp ──
  window.nyxCoolbarBridge = function (id, arg) {
    const api = window.electronAPI;
    const app = window.__nyxApp;
    switch (id) {
      case 0: api && api.windowMinimize(); break;
      case 1:
        api && api.windowMaximizeToggle();
        setTimeout(() => {
          api.windowIsMaximized().then((v) => call("nyxSetMaximized", !!v));
        }, 150);
        break;
      case 2: api && api.windowClose(); break;
      case 3: app && app.profileManage(); break;
      case 4: app && app.openSettingsAlert(); break;
      case 5: app && app.aboutAlert(); break;
      case 6: app && app.helpAlert(); break;
      case 7: if (arg) window.location.href = arg; break;
    }
  };

  // ── shared input path ──
  const KEY = {
    Enter: 0, Escape: 1, Backspace: 2,
    ArrowLeft: 3, ArrowRight: 4, Delete: 5, Tab: 6, Home: 7, End: 8
  };

  // ── source 1: parent document events (room list, menus, header) ──
  document.addEventListener("mousemove", (e) => onMouse(e.clientX, e.clientY), { passive: true });
  document.addEventListener("mousedown", (e) => {
    call("nyxFeedButton", e.button, 1);
  }, { passive: true });
  document.addEventListener("mouseup", (e) => {
    call("nyxFeedButton", e.button, 0);
  }, { passive: true });
  document.addEventListener("wheel", (e) => {
    call("nyxFeedWheel", e.deltaX, e.deltaY);
  }, { passive: true });

  // ── source 2: gameframe forwarder (in-game) ──
  window.addEventListener("message", (e) => {
    const msg = e.data;
    if (!msg || !msg.__nyxForward || !msg.data) return;
    const d = msg.data;
    switch (d.type) {
      case "mouse": onMouse(d.x, d.y); break;
      case "down": call("nyxFeedButton", d.b, 1); break;
      case "up": call("nyxFeedButton", d.b, 0); break;
      case "wheel": call("nyxFeedWheel", d.dx, d.dy); break;
      case "fps": call("nyxSetFps", d.v); break;
    }
  });

  // ── fallback fps (parent rAF, used outside the gameframe) ──
  let last = performance.now();
  let smooth = 60;
  let lastPush = 0;
  function fpsLoop(now) {
    const dt = now - last;
    last = now;
    if (dt > 0 && dt < 250) smooth = smooth * 0.9 + (1000 / dt) * 0.1;
    if (now - lastPush >= 250) {
      lastPush = now;
      call("nyxSetFps", smooth);
    }
    requestAnimationFrame(fpsLoop);
  }
  requestAnimationFrame(fpsLoop);

  // keys: canvas has tabindex so the C++ side can focus it (address popup)
  canvas.addEventListener("keydown", (e) => {
    const k = KEY[e.code];
    if (k !== undefined) call("nyxFeedKey", k, 1);
  }, { passive: true });
  canvas.addEventListener("keyup", (e) => {
    const k = KEY[e.code];
    if (k !== undefined) call("nyxFeedKey", k, 0);
  }, { passive: true });
  canvas.addEventListener("keypress", (e) => {
    if (e.charCode) call("nyxFeedChar", e.charCode);
  }, { passive: true });

  // ── boot the module ──
  window.addEventListener("resize", resize);
  resize();

  const factory = window.createNyxCoolbar || createNyxCoolbar;
  const modPromise = factory({ canvas: canvas });
  modPromise.then((mod) => {
    window.__nyxCoolbarMod = mod;
    resize();
    if (window.electronAPI && window.electronAPI.windowIsMaximized) {
      window.electronAPI.windowIsMaximized().then((v) => call("nyxSetMaximized", !!v));
    }
    const app = window.__nyxApp;
    if (app && app.profileName) call("nyxSetProfile", app.profileName);
    // start collapsed (thin icon bar) — always visible, zero-cost strip
    setExpanded(false);
  }).catch((e) => {
    console.warn("[nyxcoolbar] boot failed:", e);
  });
})();