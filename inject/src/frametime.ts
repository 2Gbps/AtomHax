// frametime.ts
// Paints a "12.3ms" overlay on the TOP-LEVEL page (the parent document), not
// inside the gameframe's document. HaxBall's gameframe document gets wiped and
// re-rendered as you move between rooms, which destroyed any element we put
// inside it. By living on the parent page it survives every room change and
// stays glued to the bottom-left corner above the gameframe.
//
// The frame time is sampled from the parent window's requestAnimationFrame,
// which fires in sync with the compositor (same vsync as the gameframe), so
// the ms value matches what the game actually renders at.

let hudActive = false;

export const startFrameTimeHud = (_gameframe?: HTMLIFrameElement): void => {
  if (hudActive) return;
  const doc = document;
  if (!doc.body) {
    console.warn("[frametime] no <body> on top document");
    return;
  }

  doc.getElementById("hb-frametime")?.remove();

  const el = doc.createElement("div");
  el.id = "hb-frametime";
  el.style.cssText =
    "position:fixed;pointer-events:none;z-index:2147483647;left:78px;bottom:8px;" +
    "color:#fff;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;" +
    "text-shadow:0 0 3px #000,0 0 5px #000,1px 1px 1px #000,0 1px 2px #000;" +
    "white-space:nowrap;letter-spacing:0.3px;";
  el.textContent = "0.0ms";
  doc.body.appendChild(el);
  console.log("[frametime] overlay attached to top document");

  hudActive = true;
  let last = performance.now();
  let smooth = 16.6;
  let lastWrite = 0;

  const tick = (now: number) => {
    if (!el.isConnected) {
      hudActive = false;
      return;
    }
    const dt = now - last;
    last = now;
    if (dt < 250) smooth = smooth * 0.9 + dt * 0.1;
    // Throttle the actual DOM write — at 1000+ fps we don't want a textContent
    // mutation every frame (each one marks the layer dirty and steals compositor
    // time from HaxBall). 33ms (= ~30Hz) is more than smooth enough for a human
    // eye to read the ms counter and costs effectively nothing.
    if (now - lastWrite >= 33) {
      el.textContent = `${smooth.toFixed(1)}ms`;
      lastWrite = now;
    }
    requestAnimationFrame(tick);
  };

  requestAnimationFrame(tick);
};
