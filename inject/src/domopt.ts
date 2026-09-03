// domopt.ts
// DOM-level performance optimizations for HaxBall.
// This runs early in init() and on every gameframe load. The goal is to
// remove every element/feature HaxBall ships that costs GPU/CPU cycles per
// frame but that the user doesn't actually need to SEE for gameplay.

// HaxBall's in-game settings panel exposes a "Low latency canvas" toggle that
// uses canvas.focus({ preventScroll: true }) + desynchronized canvas contexts.
//
// DEFAULT = DISABLED (He's request). The desync benefit is still fully applied
// by preload.js, which forces attrs.desynchronized = true on the game canvas
// getContext() call regardless of HaxBall's own setting — so the present-queue
// backup fix holds while the in-game toggle now reads OFF by default. We just
// clear the localStorage override so HaxBall falls back to its stock default.
export const forceLowLatencyCanvasOff = (): void => {
    try {
        // HaxBall stores this setting under this exact localStorage key.
        // Removing it lets HaxBall use its stock default (disabled). The
        // actual desync is applied by preload.js's getContext patch anyway.
        localStorage.removeItem("low_latency_canvas");
        console.log("[domopt] low_latency_canvas left at default (disabled)");
    } catch (e) {
        console.warn("[domopt] could not clear low_latency_canvas:", e);
    }
};

// Prune DOM elements HaxBall ships that trigger re-layouts or paint each
// frame but carry no gameplay information. Runs on the gameframe document.
export const pruneGameframeDom = (doc: Document): void => {
    try {
        // 1. Strip CSS box-shadows and filters on containers — these force
        //    layer creation + blur passes every frame even when unchanged.
        //    We replace them with flat backgrounds (the transparent-UI code
        //    also sets backgrounds, but it can be off by default; this is a
        //    pure perf win and never changes what the user sees structurally).
        const shadowTargets = doc.querySelectorAll<HTMLElement>(
            ".container, .bar, .buttons, .dialog, .room-view, .game-view"
        );
        shadowTargets.forEach((el) => {
            el.style.boxShadow = "none";
        });

        // 2. Remove the chat-log scroll container's transform/opacity layer
        //    promotion hints (HaxBall sets will-change: transform on it; we
        //    drop it because the chat doesn't animate and it costs a layer).
        const chatScroll = doc.querySelector<HTMLElement>(".chatbox-view-contents");
        if (chatScroll) {
            chatScroll.style.willChange = "auto";
            chatScroll.style.contain = "none";
        }

        // 3. Hide the copyright footer — it's a text reflow target that
        //    gets repainted whenever HaxBall re-renders the page chrome.
        //    (We don't remove it because some HaxBall code checks its
        //    existence; we just zero its size and visibility.)
        const copyright = doc.getElementById("copyright");
        if (copyright) {
            copyright.style.display = "none";
        }

        // 4. Cap the chat log length. HaxBall keeps an unbounded chat log;
        //    when it gets long, every chat-related re-layout is O(n).
        const chatLogContents = doc.querySelector<HTMLElement>(".chatbox-view-contents > .log > .log-contents");
        if (chatLogContents) {
            // Keep the last 30 message nodes; older ones get removed.
            while (chatLogContents.childElementCount > 30) {
                chatLogContents.removeChild(chatLogContents.firstChild as ChildNode);
            }
        }
    } catch (e) {
        console.warn("[domopt] pruneGameframeDom error:", e);
    }
};

// Inject a tiny <style> block into the gameframe that disables expensive CSS
// effects globally. This runs once per gameframe load.
// NOTE: liquid glass is injected SEPARATELY from the main process
// (GAMEFRAME_GLASS_PATCH in main.js) on did-frame-finish-load, so it applies
// to all views (roomlist, nickname, loading) from the first load — not just
// game views. The glass selectors there win over these `*` kills by
// specificity, so both stylesheets coexist.
export const injectPerfStylesheet = (doc: Document): void => {
    if (doc.getElementById("nyx-perf-css")) return;
    const style = doc.createElement("style");
    style.id = "nyx-perf-css";
    style.textContent = `
        /* Kill CSS filters + box-shadows on everything HaxBall renders. These
           force separate compositor layers and blur passes every frame. */
        * { box-shadow: none !important; filter: none !important; }
        /* Promote the game canvas only, nothing else. HaxBall's canvas is the
           only thing that actually animates; everything else is static chrome. */
        canvas { will-change: transform; }
        /* Revert any will-change HaxBall sets on chat/containers — those create
           unnecessary layers and cost GPU memory. */
        .chatbox-view-contents, .container, .bar, .buttons, .dialog,
        .room-view, .game-view, .player-list-view, .teams {
            will-change: auto !important;
            contain: none !important;
        }
        /* Backdrop-filter is extremely expensive (separate render pass). Kill
           it everywhere — the glass patch in main.js re-enables it on the
           panels that matter (dialog, bar, chat, ...) with higher
           specificity, so those still get their blur. */
        * { backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }
    `;
    (doc.head || doc.documentElement).appendChild(style);
    console.log("[domopt] perf stylesheet injected into gameframe");
};

// Same idea as injectPerfStylesheet but for the TOP-LEVEL page. The server
// list (roomlist) and its dialogs live in the top-level document, so they get
// their liquid glass here. The glass selectors win over the `*` kills by
// specificity, exactly like in the gameframe patch.
export const injectTopLevelPerfStylesheet = (): void => {
    if (document.getElementById("nyx-perf-css-top")) return;
    const style = document.createElement("style");
    style.id = "nyx-perf-css-top";
    style.textContent = `
        * { box-shadow: none !important; filter: none !important; }
        * { backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }
        /* ══ EXCEPTIONS — our own UI layers must keep their blur ══ */
        #blur-overlay {
            backdrop-filter: blur(12px) !important;
            -webkit-backdrop-filter: blur(12px) !important;
        }
        #custom-alert {
            backdrop-filter: blur(20px) saturate(1.8) !important;
            -webkit-backdrop-filter: blur(20px) saturate(1.8) !important;
        }
        iframe.nyx-modal-blur { filter: blur(12px) !important; }
        /* ══ LIQUID GLASS — top-level panels ══ */
        .dialog, .roomlist-view > .notice {
            background: linear-gradient(135deg, rgba(27,33,37,0.85) 0%, rgba(27,33,37,0.7) 50%, rgba(27,33,37,0.8) 100%) !important;
            backdrop-filter: blur(20px) saturate(1.8) !important;
            -webkit-backdrop-filter: blur(20px) saturate(1.8) !important;
            border: 1px solid rgba(255,255,255,0.12) !important;
            border-radius: 12px !important;
            box-shadow: 0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -1px 0 rgba(0,0,0,0.1) !important;
        }
        .roomlist-view > .dialog > .splitter > .list table.header {
            background: rgba(17,22,25,0.55) !important;
            border-radius: 8px !important;
        }
        .dialog > h1 { border-bottom-color: rgba(255,255,255,0.12) !important; }
        .dialog button {
            background: linear-gradient(135deg, rgba(36,73,103,0.85) 0%, rgba(36,73,103,0.65) 100%) !important;
            border: 1px solid rgba(255,255,255,0.1) !important;
            border-radius: 8px !important;
            box-shadow: 0 2px 8px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.08) !important;
        }
        .dialog button:hover {
            background: linear-gradient(135deg, rgba(59,93,130,0.95) 0%, rgba(59,93,130,0.75) 100%) !important;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.12) !important;
        }
        .dialog button:disabled { background: rgba(62,62,62,0.6) !important; }
        .dialog input:not([type=range]) {
            background: rgba(255,255,255,0.06) !important;
            border: 1px solid rgba(255,255,255,0.15) !important;
            border-radius: 6px !important;
        }
        .dialog input:not([type=range]):focus { border-color: rgba(255,255,255,0.35) !important; }
        .dialog select {
            background: rgba(255,255,255,0.06) !important;
            border: 1px solid rgba(255,255,255,0.15) !important;
            border-radius: 6px !important;
        }
        .dialog .label-input {
            background: rgba(36,73,103,0.5) !important;
            border-radius: 6px !important;
        }
        /* The address bar/transp button chrome — no compositor promotion. */
        .header, .left-container, .center-container, .right-container {
            display: none !important; height: 0 !important; overflow: hidden !important;
            will-change: auto !important; contain: none !important;
        }
    `;
    (document.head || document.documentElement).appendChild(style);
    console.log("[domopt] perf stylesheet injected into top-level page");
};
