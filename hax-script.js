// ==UserScript==
// @name         HaxScript v16.2 - BlockHelper + OPMODE (engine bridge)
// @version      16.2.0
// @description  Kick macro, block/glue, OPMODE ElMono, HUD. Uses window.g bridge (patched engine).
// @match        https://*.haxball.com/play*
// @noframes     true
// ==/UserScript==

(function () {
    'use strict';
    if (window.__nyx_hax_v16) return;
    window.__nyx_hax_v16 = true;

    var CFG = {
        macroKey: 'KeyL',
        cps: 12,
        cpsMin: 1,
        cpsMax: 20,
        tapHoldMs: 41,
        holdMinMs: 25,
        jitter: 0.12,
        boostNear: 1.5,
        pollMs: 16,
        connectMs: 300,
        blockContactDelta: 3,
        blockCornerRange: 45,
        opPresets: [0, 25, 40, 60],
        hudVisible: true
    };

    var SCRIPT_VERSION = '16.2';

    var state = {
        active: true,
        kicks: 0,
        heldMacro: false,
        lastTapAt: 0,
        blockActive: false,
        connected: false,
        _pendingDir: {},
        userMask: 0,
        gameData: null,
        opPresetIdx: -1
    };

    var hud = null;
    var gameDoc = null;

    /* ====================================================================
     *  BRIDGE ACCESS — window.g (top page) or window.parent.g (gameframe)
     * ==================================================================== */

    function getBridge() {
        try { if (window.g && window.g.bh) return window.g; } catch (e) {}
        try { if (window.parent && window.parent.g && window.parent.g.bh) return window.parent.g; } catch (e) {}
        return null;
    }

    function opPercent() {
        var g = getBridge();
        if (g && g.opGet) { try { return g.opGet(); } catch (e) {} }
        return 0;
    }

    /* ====================================================================
     *  GAMEFRAME DOC — works whether we run in the gameframe or top page
     * ==================================================================== */

    function inGameframe() {
        try {
            if (window.frameElement) return true;
            if (window !== window.parent && document.querySelector('canvas')) return true;
        } catch (e) {}
        return false;
    }

    function getGameFrame() {
        return document.querySelector('iframe.gameframe') || document.querySelector('iframe');
    }

    function getGameDoc() {
        if (inGameframe()) return document;
        var f = getGameFrame();
        if (!f) return null;
        try { return f.contentDocument || (f.contentWindow && f.contentWindow.document) || null; } catch (e) { return null; }
    }

    function isTyping() {
        var t = (gameDoc || document).activeElement;
        if (!t) return false;
        var tag = (t.tagName || '').toUpperCase();
        return tag === 'INPUT' || tag === 'TEXTAREA' || t.isContentEditable;
    }

    function connect() {
        var d = getGameDoc();
        if (!d || !d.body) return false;
        try {
            if (inGameframe()) {
                try { window.__haxscript_listening = true; } catch (e) {}
            } else {
                var f = getGameFrame();
                if (f) { try { f.contentWindow.__haxscript_listening = true; } catch (e) {} }
            }
            if (gameDoc !== d) {
                if (gameDoc) {
                    gameDoc.removeEventListener('keydown', onKeyDown, true);
                    gameDoc.removeEventListener('keyup', onKeyUp, true);
                    gameDoc.removeEventListener('keydown', onHotKey, true);
                    gameDoc.removeEventListener('keydown', onChatKey, true);
                }
                gameDoc = d;
                d.addEventListener('keydown', onKeyDown, true);
                d.addEventListener('keyup', onKeyUp, true);
                d.addEventListener('keydown', onHotKey, true);
                d.addEventListener('keydown', onChatKey, true);
            }
            state.connected = !!getBridge();
            return state.connected;
        } catch (e) {
            return false;
        }
    }

    /* ====================================================================
     *  GAME STATE SNAPSHOT (via bridge snap())
     * ==================================================================== */

    function readGameData() {
        var g = getBridge();
        if (!g) return state.gameData;
        try {
            var s = g.snap();
            if (!s || !s.ok || !s.ball || !s.me) return state.gameData;
            state.gameData = {
                ok: true,
                ball: s.ball,
                ballR: s.ball.r,
                ballVx: s.ball.vx,
                ballVy: s.ball.vy,
                player: s.me,
                playerR: s.me.r,
                myId: s.pid,
                ballDist: s.ballDist,
                fieldW: s.fieldW,
                fieldH: s.fieldH,
                playerCount: s.players,
                isOwner: !!s.isOwner,
                ts: s.ts
            };
        } catch (e) {}
        return state.gameData;
    }

    /* ====================================================================
     *  ENGINE INPUT — direct Set manipulation via bridge (vq/lq path)
     * ==================================================================== */

    function engineTap(action, ms) {
        var g = getBridge();
        if (!g) return;
        if (state._pendingDir[action]) clearTimeout(state._pendingDir[action]);
        g.in(action);
        state._pendingDir[action] = setTimeout(function () {
            state._pendingDir[action] = null;
            var gg = getBridge();
            if (gg && gg.out) gg.out(action);
        }, ms);
    }

    function releaseAllTaps() {
        var g = getBridge();
        if (!g) return;
        for (var a in state._pendingDir) {
            if (state._pendingDir[a]) {
                clearTimeout(state._pendingDir[a]);
                state._pendingDir[a] = null;
                if (g.out) g.out(a);
            }
        }
    }

    function engineKickTap() {
        var g = getBridge();
        if (!g) return;
        g.in('Kick');
        setTimeout(function () {
            var gg = getBridge();
            if (gg && gg.out) gg.out('Kick');
        }, Math.max(CFG.holdMinMs, Math.round(CFG.tapHoldMs * (0.65 + Math.random() * 0.7))));
    }

    /* ====================================================================
     *  KICK MACRO
     * ==================================================================== */

    function ballNear(gd) {
        return !!(gd && gd.ok && gd.ballDist >= 0 && gd.ballDist <= 80);
    }

    function currentInterval(gd) {
        var base = 1000 / CFG.cps;
        if (ballNear(gd)) {
            base = 1000 / Math.min(CFG.cpsMax, Math.max(CFG.cps, Math.round(CFG.cps * CFG.boostNear)));
        }
        var j = 1 + (Math.random() * 2 - 1) * CFG.jitter;
        return Math.max(30, Math.round(base * j));
    }

    function setCps(delta) {
        CFG.cps = Math.max(CFG.cpsMin, Math.min(CFG.cpsMax, CFG.cps + delta));
    }

    function rhythmTap(now, gd) {
        if (now - state.lastTapAt >= currentInterval(gd)) {
            state.lastTapAt = now;
            engineKickTap();
            state.kicks++;
        }
    }

    /* ====================================================================
     *  BLOCK / GLUE HELPER
     * ==================================================================== */

    function codeToBit(code) {
        if (code === 'ArrowUp' || code === 'KeyW') return 1;
        if (code === 'ArrowDown' || code === 'KeyS') return 2;
        if (code === 'ArrowLeft' || code === 'KeyA') return 4;
        if (code === 'ArrowRight' || code === 'KeyD') return 8;
        return 0;
    }

    function tapBit(d) { return d === 'Right' ? 8 : d === 'Left' ? 4 : d === 'Down' ? 2 : d === 'Up' ? 1 : 0; }
    function oppositeBit(b) { return b === 1 ? 2 : b === 2 ? 1 : b === 4 ? 8 : b === 8 ? 4 : 0; }

    function heldMask() {
        var g = getBridge();
        if (!g) return state.userMask;
        try {
            var w = g._rm;
            if (!w || !w.W || !w.W.Qc) return state.userMask;
            var r = 0;
            if (w.W.Qc.has('Up')) r |= 1;
            if (w.W.Qc.has('Down')) r |= 2;
            if (w.W.Qc.has('Left')) r |= 4;
            if (w.W.Qc.has('Right')) r |= 8;
            return r;
        } catch (e) { return state.userMask; }
    }

    function isContact(gd) {
        if (!gd || !gd.ok || !gd.ball || !gd.player || gd.ballDist < 0) return false;
        return gd.ballDist <= gd.playerR + gd.ballR + CFG.blockContactDelta;
    }

    function isCorner(gd) {
        if (!gd || !gd.ok || !gd.ball || !gd.player) return false;
        if (gd.fieldW <= 0 || gd.fieldH <= 0) return false;
        var bx = gd.ball.x, by = gd.ball.y;
        var r = CFG.blockCornerRange;
        return (bx < r || bx > gd.fieldW - r) && (by < r || by > gd.fieldH - r);
    }

    function tapDirections(taps) {
        var held = heldMask();
        for (var i = 0; i < taps.length; i++) {
            var dir = taps[i];
            var bit = tapBit(dir);
            if (bit && (held & bit)) continue;
            if (bit && (held & oppositeBit(bit))) continue;
            engineTap(dir, 8);
        }
    }

    function counterImpulse(gd) {
        if (!isContact(gd)) {
            state.blockActive = false;
            releaseAllTaps();
            return;
        }
        if (gd.isOwner) {
            state.blockActive = false;
            releaseAllTaps();
            return;
        }
        state.blockActive = true;

        if (isCorner(gd)) {
            var bx = gd.ball.x, by = gd.ball.y;
            var taps = [];
            if (bx < CFG.blockCornerRange) taps.push('Right');
            else if (bx > gd.fieldW - CFG.blockCornerRange) taps.push('Left');
            if (by < CFG.blockCornerRange) taps.push('Down');
            else if (by > gd.fieldH - CFG.blockCornerRange) taps.push('Up');
            releaseAllTaps();
            tapDirections(taps);
            return;
        }

        var rx = gd.player.x - gd.ball.x;
        var ry = gd.player.y - gd.ball.y;
        var rl = Math.hypot(rx, ry);
        if (rl < 0.1) return;
        rx /= rl; ry /= rl;

        var vx = -(gd.ballVx || 0);
        var vy = -(gd.ballVy || 0);
        var vl = Math.hypot(vx, vy);
        if (vl > 0.5) { vx /= vl; vy /= vl; } else { vx = rx; vy = ry; }

        var ix = rx * 0.6 + vx * 0.4;
        var iy = ry * 0.6 + vy * 0.4;
        var il = Math.hypot(ix, iy);
        if (il > 0.01) { ix /= il; iy /= il; }

        releaseAllTaps();
        var taps = [];
        if (Math.abs(ix) > Math.abs(iy) * 1.5) {
            taps.push(ix > 0 ? 'Right' : 'Left');
        } else if (Math.abs(iy) > Math.abs(ix) * 1.5) {
            taps.push(iy > 0 ? 'Down' : 'Up');
        } else {
            if (ix > 0.3) taps.push('Right');
            if (ix < -0.3) taps.push('Left');
            if (iy > 0.3) taps.push('Down');
            if (iy < -0.3) taps.push('Up');
        }
        tapDirections(taps);
    }

    /* ====================================================================
     *  OPMODE PRESETS
     * ==================================================================== */

    function nextOpPreset() {
        var cur = opPercent();
        for (var i = 0; i < CFG.opPresets.length; i++) {
            if (CFG.opPresets[i] > cur) return i;
        }
        return 0;
    }

    function applyOpPreset(idx) {
        var g = getBridge();
        if (g && g.opSet) { try { g.opSet(CFG.opPresets[idx]); } catch (e) {} }
    }

    /* ====================================================================
     *  HOTKEYS
     * ==================================================================== */

    function onKeyDown(ev) {
        var code = ev.code;
        var bit = codeToBit(code);
        if (bit) state.userMask |= bit;
        if (isTyping()) return;
        if (code === 'KeyK') {
            ev.preventDefault();
            ev.stopImmediatePropagation();
            state.active = !state.active;
            if (!state.active) { releaseAllTaps(); state.heldMacro = false; }
            updateHud();
            return;
        }
        if (!state.active) return;
        if (code === CFG.macroKey) {
            ev.preventDefault();
            ev.stopImmediatePropagation();
            state.heldMacro = true;
            state.lastTapAt = 0;
        } else if (code === 'KeyO') {
            ev.preventDefault();
            ev.stopImmediatePropagation();
            CFG.hudVisible = !CFG.hudVisible;
            if (hud) hud.style.display = CFG.hudVisible ? 'block' : 'none';
        } else if (code === 'KeyM') {
            ev.preventDefault();
            ev.stopImmediatePropagation();
            setCps(1);
            updateHud();
        } else if (code === 'KeyN') {
            ev.preventDefault();
            ev.stopImmediatePropagation();
            setCps(-1);
            updateHud();
        } else if (code === 'KeyH') {
            ev.preventDefault();
            ev.stopImmediatePropagation();
            state.opPresetIdx = nextOpPreset();
            applyOpPreset(state.opPresetIdx);
            updateHud();
        }
    }

    function onKeyUp(ev) {
        var bit = codeToBit(ev.code);
        if (bit) state.userMask &= ~bit;
        if (ev.code === CFG.macroKey) state.heldMacro = false;
    }

    function onHotKey(ev) {
        if (isTyping()) return;
        if (ev.code === 'KeyK' || ev.code === 'KeyO' || ev.code === 'KeyM' || ev.code === 'KeyN' || ev.code === 'KeyH' || ev.code === CFG.macroKey) {
            ev.preventDefault();
            ev.stopImmediatePropagation();
        }
    }

    /* ====================================================================
     *  CHAT /op COMMAND (the engine also handles it — this mirrors to HUD)
     * ==================================================================== */

    function onChatKey(ev) {
        if (ev.key !== 'Enter') return;
        var t = ev.target;
        if (!t || !t.value) return;
        var match = /^\/op\s+(\d+)/i.exec(t.value.trim());
        if (match) {
            var v = parseInt(match[1], 10);
            if (v >= 0 && v <= 100) {
                var g = getBridge();
                if (g && g.opSet) { try { g.opSet(v); } catch (e) {} }
                updateHud();
            }
        }
    }

    /* ====================================================================
     *  HUD (top page — HaxBall never touches it)
     * ==================================================================== */

    function ensureHud() {
        if (hud && hud.isConnected) return hud;
        hud = null;
        try {
            if (!document.body && !document.documentElement) return null;
            hud = document.createElement('div');
            hud.id = 'nyx-haxscript-hud';
            hud.style.cssText = 'position:fixed;top:8px;left:8px;z-index:2147483647;background:rgba(10,12,18,0.92);color:#d7e3f4;font:11px/1.35 Consolas,monospace;padding:8px 12px;border:1px solid #2a3550;border-radius:4px;pointer-events:none;white-space:pre;text-align:left;box-shadow:0 0 8px rgba(0,0,0,0.5);';
            hud._body = document.createElement('div');
            hud.appendChild(hud._body);
            (document.body || document.documentElement).appendChild(hud);
            hud._lastSig = '';
        } catch (e) {
            hud = null;
        }
        return hud;
    }

    function updateHud() {
        if (!CFG.hudVisible) return;
        var h = ensureHud();
        if (!h) return;
        var lines = [];
        var gd = state.gameData;
        var bridge = !!getBridge();
        var gf = inGameframe() || !!getGameFrame();
        if (!state.active) {
            lines.push(['[HS] DISATTIVO', '#ff5555']);
        } else if (!gf) {
            lines.push(['[HS] in attesa del gioco...', '#888']);
        } else if (!bridge) {
            lines.push(['[HS] bridge non attivo - toggle ON + reload', '#ff8800']);
            lines.push(['    (script v' + SCRIPT_VERSION + ')', '#555']);
        } else {
            var contactOwner = gd && gd.ok && gd.isOwner && isContact(gd);
            var status = state.blockActive ? 'GLUE' : contactOwner ? 'DRIBBLE' : 'ready';
            lines.push(['[HS] ' + status, state.blockActive || contactOwner ? '#00ff88' : '#888']);
            lines.push(['kick: ' + state.kicks + '  cps: ' + CFG.cps, '#aaa']);
            lines.push(['OP: ' + opPercent() + '%', opPercent() > 0 ? '#ffb86c' : '#555']);
            if (gd && gd.ok) {
                lines.push(['dist:' + gd.ballDist.toFixed(1) + (isCorner(gd) ? ' CORNER' : ''), isCorner(gd) ? '#ffaa00' : '#aaa']);
            } else {
                lines.push(['game: no data', '#ff8800']);
            }
        }
        lines.push(['v' + SCRIPT_VERSION + ' K:off L:macro O:hud H:op M/N:spd (/op N)', '#555']);
        var el = h._body;
        var sig = '';
        for (var i = 0; i < lines.length; i++) sig += '|' + lines[i][0] + ':' + (lines[i][1] || '');
        if (h._lastSig === sig) return;
        h._lastSig = sig;
        el.textContent = '';
        for (var j = 0; j < lines.length; j++) {
            var d = document.createElement('div');
            d.textContent = lines[j][0];
            if (lines[j][1]) d.style.color = lines[j][1];
            el.appendChild(d);
        }
        var active = state.blockActive || (state.heldMacro && state.active) || opPercent() > 0;
        h.style.borderColor = active ? '#00ff88' : '#2a3550';
    }

    /* ====================================================================
     *  TICK / BOOT
     * ==================================================================== */

    function tick(now) {
        if (!state.active) return;
        var g = getBridge();
        if (!g) return;
        var gd = readGameData();
        state.gameData = gd;
        if (gd && gd.ok) counterImpulse(gd);
        if (!state.heldMacro) { state.lastTapAt = 0; return; }
        rhythmTap(now, gd);
    }

    try {
        var hudObserver = new MutationObserver(function () { ensureHud(); });
        hudObserver.observe(document.documentElement || document, { childList: true, subtree: true });
    } catch (e) {}

    setInterval(function () { connect(); }, CFG.connectMs);
    setInterval(function () { tick(Date.now()); }, CFG.pollMs);
    setInterval(function () { ensureHud(); updateHud(); }, 400);
    connect();
    ensureHud();
    updateHud();
})();