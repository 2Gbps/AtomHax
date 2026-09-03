// canvaspatch.ts
//
// Canvas2D performance hooks for HaxBall's gameframe iframe. Ported from
// purehax.eu's perf-canvas-patch.js (their recipe for 1000+ fps) and made
// always-on — there's no `__PURE_PERF__` flag toggle, both optimizations
// apply unconditionally because they're pure wins:
//
//   1. LINEWIDTH CAP TO 1px
//      HaxBall draws thick strokes (field markings, player outlines).
//      Under GPU rasterization every thick stroke is a more expensive
//      tessellation; capping lineWidth to 1 turns them all into trivial
//      single-pixel lines. Visually nearly identical at game zoom (the
//      lines are short and the camera zooms out far enough that 1px is
//      what you see anyway), but the GPU cost drops sharply.
//
//   2. ARCS → POLYLINES
//      HaxBall's balls, players, and field arcs are drawn with
//      CanvasRenderingContext2D.arc(). On the GPU-rasterized Canvas2D path
//      each arc is a costly bezier tessellation. The patch replaces large
//      arcs (r >= 48 — the field circles, center spot, etc) with a 6-segment
//      polyline approximation and small arcs with a single lineTo to the
//      endpoint. Players/balls (small r) keep using real arcs so they stay
//      visually round; the big decorative arcs get the cheap path.
//
// Both hooks store the originals on __origArc / __origArcTo / __orig1pxLw
// so they're idempotent (re-apply is a no-op) and theoretically reversible.

const FIELD_ARC_MIN_R = 48;

function normalizeSweep(start: number, end: number, ccw: boolean): number {
    const tau = Math.PI * 2;
    let sweep = end - start;
    if (ccw) {
        while (sweep > 0) sweep -= tau;
        while (sweep <= -tau) sweep += tau;
    } else {
        while (sweep < 0) sweep += tau;
        while (sweep >= tau) sweep -= tau;
    }
    return sweep;
}

/**
 * Apply the canvas perf hooks to a given window (typically the gameframe
 * iframe's contentWindow). Idempotent — safe to call multiple times on the
 * same window.
 */
export const applyCanvasPatch = (w: Window): void => {
    try {
        const p = (w as any).CanvasRenderingContext2D.prototype;
        if (!p) return;

        // ── 1px lineWidth cap ──
        if (!p.__nyx1pxLw) {
            const desc = Object.getOwnPropertyDescriptor(p, "lineWidth");
            if (desc && desc.get && desc.set) {
                const getLw = desc.get;
                const setLw = desc.set;
                Object.defineProperty(p, "lineWidth", {
                    get: function () { return getLw.call(this); },
                    set: function (v: number) {
                        let n = Number(v);
                        if (n > 1) n = 1;     // always-on: cap thick strokes
                        setLw.call(this, n);
                    },
                    configurable: true,
                    enumerable: desc.enumerable,
                });
                p.__nyx1pxLw = true;
            }
        }

        // ── arcs → polylines ──
        if (!p.__nyxOrigArc && typeof p.arc === "function") p.__nyxOrigArc = p.arc;
        if (!p.__nyxOrigArcTo && typeof p.arcTo === "function") p.__nyxOrigArcTo = p.arcTo;
        if (p.__nyxCurves) return; // already patched

        const origArc = p.__nyxOrigArc;
        const origArcTo = p.__nyxOrigArcTo;

        // arcTo → lineTo (the heavy arcs-to-endpoint shortcut)
        if (typeof origArcTo === "function") {
            p.arcTo = function (_x1: number, _y1: number, x2: number, y2: number) {
                return p.lineTo.call(this, x2, y2);
            };
        }

        // arc → 6-segment polyline for large arcs, lineTo for small arcs
        if (typeof origArc === "function") {
            p.arc = function (x: number, y: number, r: number, start: number, end: number, ccw: boolean) {
                if (Math.abs(Number(r)) < FIELD_ARC_MIN_R) {
                    return origArc.apply(this, arguments as any);
                }
                const sweep = normalizeSweep(start, end, ccw);
                if (Math.abs(sweep) >= Math.PI * 2 - 0.08) {
                    // Full circle: 6-segment closed polyline.
                    const sx = x + r * Math.cos(start);
                    const sy = y + r * Math.sin(start);
                    p.moveTo.call(this, sx, sy);
                    for (let i = 1; i <= 6; i++) {
                        const t = start + (sweep * i) / 6;
                        p.lineTo.call(this, x + r * Math.cos(t), y + r * Math.sin(t));
                    }
                    p.closePath.call(this);
                    return;
                }
                // Partial large arc: single chord to the endpoint.
                p.lineTo.call(this, x + r * Math.cos(end), y + r * Math.sin(end));
            };
        }

        p.__nyxCurves = true;
    } catch (e) {
        console.warn("[canvaspatch] failed to apply:", e);
    }
};
