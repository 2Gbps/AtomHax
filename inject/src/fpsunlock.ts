// fpsunlock.ts
// DEAD CODE — kept as a record of what NOT to do.
//
// History: tried two approaches here, both broke HaxBall.
//   1. queueMicrotask-based rAF override: never yielded to the browser,
//      HaxBall's compositor never painted, game froze.
//   2. MessageChannel-based setTimeout(0) trampoline: dropped HaxBall's FPS
//      counter to 1 FPS — the recursive setTimeout(loop, 0) pattern
//      deadlocked in the MessageChannel's pending queue.
//
// purehax.eu does NOT achieve 1000+ fps by patching setTimeout/rAF. We
// confirmed this the hard way. The "real" secret is almost certainly a
// different approach — e.g. patching HaxBall's game.js directly, or wrapping
// the requestAnimationFrame callback to call the real rAF multiple times
// per compositor frame (which would multiply ticks without breaking paint).
//
// This file is intentionally NOT imported anywhere. Do not re-import it
// without a provenly-safe replacement.
export const __fpsunlockDead = true;
