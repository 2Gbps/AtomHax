// ==UserScript==
// @name         HaxBall BlockHelper
// @namespace    nyx
// @version      2.0.0
// @description  Assistente di blocco per HaxBall, funziona in qualsiasi stanza pubblica. Tieni premuto L per il block macro (spam di kick umanizzato, piu' aggressivo quando la palla e' vicina). X e gli altri tasti di kick restano normali per tirare. H = OP mode: quando hai la palla e stai calciando, cicla rapidamente la direzione (pattern del cheat OP-Lite) per colpi piu' forti.
// @author       Nyx
// @match        https://www.haxball.com/*
// @match        https://haxball.com/*
// @run-at       document-start
// @grant        none
// @noframes     true
// ==/UserScript==

(function () {
    'use strict';

    if (window.top !== window.self) return;

    var CFG = {
        macroKey: 'KeyL',      // unico tasto che attiva la macro (tieni premuto per bloccare)
        cps: 12,               // velocita' base del block: click al secondo (M = piu' veloce, N = piu' lento) - default 12/s come corner hack
        cpsMin: 1,
        cpsMax: 20,
        tapHoldMs: 41,         // ms di tenuta kick (come corner hack: 30-70); varia a ogni colpo
        holdMinMs: 25,         // umanizzazione: durata kick minima (random holdMinMs..tapHoldMs -> forza variabile)
        jitter: 0.12,          // umanizzazione: variazione casuale del ritmo (+-12%)
        boostNear: 1.5,        // palla vicina: moltiplica il ritmo (block piu' aggressivo)
        boostRangePad: 22,     // palla vicina: margine range kick (px)
        opKey: 'KeyH',         // OP mode: attiva/disattiva (H) - shake direzionale stile cheat OP-Lite
        opValue: 3,            // OP mode: frame di tenuta per ogni passo della sequenza (7=lento, 3=aggressivo, 1=massimo)
        opRing: [2, 1, 8, 4, 1, 8, 2, 4], // OP mode: sequenza direzioni up,left,down,right,left,down,up,right (bitmask del gioco: 1=sx 2=su 4=dx 8=giu)
        opPersistMax: 10,      // OP mode: cedi il controllo se tieni una direzione per N frame consecutivi (non combatto la tua sterzata)
        pollMs: 16,
        keysRefreshMs: 2000,
        connectMs: 300
    };

    var SCRIPT_VERSION = '2.1.0';

    var DEFAULT_KEYS = {
        ArrowUp: 'Up', KeyW: 'Up', ArrowDown: 'Down', KeyS: 'Down',
        ArrowLeft: 'Left', KeyA: 'Left', ArrowRight: 'Right', KeyD: 'Right',
        KeyX: 'Kick', Space: 'Kick', ControlLeft: 'Kick', ControlRight: 'Kick',
        ShiftLeft: 'Kick', ShiftRight: 'Kick', Numpad0: 'Kick'
    };

    var KEY_VALUES = {
        KeyX: 'x', Space: ' ', ControlLeft: 'Control', ControlRight: 'Control',
        ShiftLeft: 'Shift', ShiftRight: 'Shift', Numpad0: '0'
    };

    var state = {
        active: true,
        kickCodes: kickCodesOf(readKeyMap()),
        heldCodes: [],
        heldKeys: [],
        pendingKeyup: {},
        lastTapAt: 0,
        lastKeysRefresh: 0,
        kicks: 0,
        frame: null,
        gameDoc: null,
        connected: false,
        lastAction: '',
        dirs: directionCodes(),
        op: { enabled: false, step: 0, wait: 0, dir: null, persist: 0, lastSig: '' }
    };

    var hud = null;

    function cpsInterval() {
        return Math.round(1000 / CFG.cps);
    }

    function setCps(delta) {
        CFG.cps = Math.max(CFG.cpsMin, Math.min(CFG.cpsMax, CFG.cps + delta));
    }

    function ballNear() {
        var g = getG();
        if (!g || typeof g.getRoomManager !== 'function') return false;
        try {
            var rm = g.getRoomManager();
            var mp = rm.getPlayerManager && rm.getPlayerManager();
            var players = mp && mp.players ? mp.players : rm.players;
            var p = players && players[rm.getAvatarId ? rm.getAvatarId() : g.avatarId];
            var ball = rm.getBall ? rm.getBall() : rm.ball;
            if (!p || !ball) return false;
            return Math.hypot(p.x - ball.x, p.y - ball.y) <= p.r * 2 + CFG.boostRangePad;
        } catch (e) {
            return false;
        }
    }

    function currentInterval() {
        var base = 1000 / CFG.cps;
        if (ballNear()) {
            base = 1000 / Math.min(CFG.cpsMax, Math.max(CFG.cps, Math.round(CFG.cps * CFG.boostNear)));
        }
        var jitter = 1 + (Math.random() * 2 - 1) * CFG.jitter;
        return Math.max(30, Math.round(base * jitter));
    }

    /* ------------------------------ util ------------------------------ */

    function readKeyMap() {
        try {
            var raw = localStorage.getItem('player_keys');
            if (raw) {
                var parsed = JSON.parse(raw);
                if (parsed && typeof parsed === 'object') return parsed;
            }
        } catch (e) {}
        return DEFAULT_KEYS;
    }

    function kickCodesOf(map) {
        var out = [];
        for (var code in map) {
            if (map[code] === 'Kick' && out.indexOf(code) < 0) out.push(code);
        }
        if (!out.length) {
            for (var c in DEFAULT_KEYS) {
                if (DEFAULT_KEYS[c] === 'Kick') out.push(c);
            }
        }
        return out;
    }

    function directionCodes() {
        var map = readKeyMap();
        var out = {};
        for (var code in map) {
            var act = map[code];
            if (act === 'Up' && !out.Up) out.Up = code;
            else if (act === 'Left' && !out.Left) out.Left = code;
            else if (act === 'Down' && !out.Down) out.Down = code;
            else if (act === 'Right' && !out.Right) out.Right = code;
        }
        if (!out.Up) out.Up = 'KeyW';
        if (!out.Left) out.Left = 'KeyA';
        if (!out.Down) out.Down = 'KeyS';
        if (!out.Right) out.Right = 'KeyD';
        if (map.KeyW === 'Up') out.Up = 'KeyW';
        if (map.KeyA === 'Left') out.Left = 'KeyA';
        if (map.KeyS === 'Down') out.Down = 'KeyS';
        if (map.KeyD === 'Right') out.Right = 'KeyD';
        return out;
    }

    function getG() {
        try {
            if (window.g) return window.g;
            if (state.frame && state.frame.contentWindow && state.frame.contentWindow.g) {
                return state.frame.contentWindow.g;
            }
        } catch (e) {}
        return null;
    }

    function isTyping(doc) {
        var t = doc && doc.activeElement;
        if (!t) return false;
        var tag = (t.tagName || '').toUpperCase();
        return tag === 'INPUT' || tag === 'TEXTAREA' || t.isContentEditable;
    }

    /* --------------------------- game frame link --------------------------- */

    function getGameFrame() {
        return document.querySelector('iframe.gameframe') || document.querySelector('iframe');
    }

    function connect() {
        var f = getGameFrame();
        var d = null;
        if (f) {
            try {
                d = f.contentDocument || (f.contentWindow && f.contentWindow.document);
            } catch (e) {
                d = null;
            }
        }
        if ((!d || !d.body) && location.href.indexOf('game.html') >= 0) {
            d = document;
        }
        if (!d || !d.body) return false;
        if (state.gameDoc === d && state.connected) return true;

        if (state.gameDoc && state.gameDoc !== d) detach(state.gameDoc);
        state.frame = f;
        state.gameDoc = d;
        attach(d);
        state.connected = true;
        hudSet({});
        updateHud();
        return true;
    }

    function detach(d) {
        d.removeEventListener('keydown', onKeyDown, true);
        d.removeEventListener('keyup', onKeyUp, true);
        d.removeEventListener('keydown', onHotKey, true);
        opReleaseAll();
    }

    function attach(d) {
        d.addEventListener('keydown', onKeyDown, true);
        d.addEventListener('keyup', onKeyUp, true);
        d.addEventListener('keydown', onHotKey, true);
    }

    /* ------------------------------ kick driver ------------------------------ */

    function kickKeyValue(code) {
        if (KEY_VALUES[code] != null) return KEY_VALUES[code];
        if (code.length === 1) return code;
        if (code.indexOf('Key') === 0) return code.charAt(3).toLowerCase();
        return code;
    }

    function pickKickCode() {
        for (var i = 0; i < state.kickCodes.length; i++) {
            if (state.heldKeys.indexOf(state.kickCodes[i]) < 0) return state.kickCodes[i];
        }
        return state.kickCodes[0] || null;
    }

    function tap() {
        var d = state.gameDoc;
        if (!d) return;
        var code = pickKickCode();
        if (!code) return;
        var key = kickKeyValue(code);
        d.dispatchEvent(new KeyboardEvent('keydown', { key: key, code: code, bubbles: true, cancelable: true }));
        if (state.pendingKeyup[code]) clearTimeout(state.pendingKeyup[code]);
        var hold = Math.max(CFG.holdMinMs, Math.round(CFG.tapHoldMs * (0.65 + Math.random() * 0.7)));
        state.pendingKeyup[code] = setTimeout(function () {
            var gd = state.gameDoc;
            if (gd) gd.dispatchEvent(new KeyboardEvent('keyup', { key: key, code: code, bubbles: true, cancelable: true }));
        }, hold);
        state.kicks++;
        updateHud();
    }

    /* ------------------------------ interception ------------------------------ */

    function onKeyDown(ev) {
        if (!state.active || !state.gameDoc) return;
        if (isTyping(state.gameDoc)) return;
        if (!ev.isTrusted) return;
        if (state.heldKeys.indexOf(ev.code) < 0) state.heldKeys.push(ev.code);
        if (ev.code === CFG.macroKey) {
            ev.preventDefault();
            ev.stopImmediatePropagation();
            if (state.heldCodes.indexOf(ev.code) < 0) {
                state.heldCodes.push(ev.code);
                try { console.log('[BlockHelper] macro ATTIVA (L premuto)'); } catch (e) {}
            }
            state.lastTapAt = 0;
        }
    }

    function onKeyUp(ev) {
        if (!ev.isTrusted) return;
        var i;
        i = state.heldCodes.indexOf(ev.code);
        if (i >= 0) state.heldCodes.splice(i, 1);
        i = state.heldKeys.indexOf(ev.code);
        if (i >= 0) state.heldKeys.splice(i, 1);
    }

    function releaseAllHeld() {
        var d = state.gameDoc;
        var codes = state.heldCodes.slice();
        state.heldCodes = [];
        if (d) {
            for (var i = 0; i < codes.length; i++) {
                var c = codes[i];
                if (state.pendingKeyup[c]) {
                    clearTimeout(state.pendingKeyup[c]);
                    state.pendingKeyup[c] = null;
                }
                d.dispatchEvent(new KeyboardEvent('keyup', {
                    key: kickKeyValue(c), code: c, bubbles: true, cancelable: true
                }));
            }
        }
    }

    function onHotKey(ev) {
        if (!state.gameDoc) return;
        if (isTyping(state.gameDoc)) return;
        if (ev.code === 'KeyK') {
            state.active = !state.active;
            ev.preventDefault();
            ev.stopImmediatePropagation();
            if (!state.active) {
                releaseAllHeld();
                opReleaseAll();
            }
            updateHud();
            hudSet({});
        } else if (ev.code === 'KeyO') {
            ev.preventDefault();
            ev.stopImmediatePropagation();
            if (hud) hud.style.display = hud.style.display === 'none' ? 'block' : 'none';
        } else if (ev.code === 'KeyM') {
            ev.preventDefault();
            ev.stopImmediatePropagation();
            setCps(1);
            updateHud();
        } else if (ev.code === 'KeyN') {
            ev.preventDefault();
            ev.stopImmediatePropagation();
            setCps(-1);
            updateHud();
        } else if (ev.code === CFG.opKey) {
            ev.preventDefault();
            ev.stopImmediatePropagation();
            state.op.enabled = !state.op.enabled;
            if (!state.op.enabled) opReleaseAll();
            updateHud();
        }
    }

    /* ------------------------------ kick: ritmo ------------------------------ */

    function rhythmTap(now) {
        if (now - state.lastTapAt >= currentInterval()) {
            state.lastTapAt = now;
            tap();
            state.lastAction = 'spam';
        }
    }

    /* ------------------------------ OP mode (shake direzionale) ------------------------------ */

    function hasBall() {
        var g = getG();
        if (!g || typeof g.getRoomManager !== 'function') return false;
        try {
            var rm = g.getRoomManager();
            var mp = rm.getPlayerManager && rm.getPlayerManager();
            var players = mp && mp.players ? mp.players : rm.players;
            var p = players && players[rm.getAvatarId ? rm.getAvatarId() : g.avatarId];
            var ball = rm.getBall ? rm.getBall() : rm.ball;
            if (!p || !ball) return false;
            return Math.hypot(p.x - ball.x, p.y - ball.y) <= p.r + ball.r + 8;
        } catch (e) {
            return false;
        }
    }

    function kickHeld() {
        for (var i = 0; i < state.kickCodes.length; i++) {
            if (state.heldKeys.indexOf(state.kickCodes[i]) >= 0) return true;
        }
        return false;
    }

    function opRingCode(step) {
        var v = CFG.opRing[step % CFG.opRing.length];
        var dirs = state.dirs;
        return v === 2 ? dirs.Up : v === 1 ? dirs.Left : v === 8 ? dirs.Down : dirs.Right;
    }

    function opDispatch(code, down) {
        var d = state.gameDoc;
        if (!d || !code) return;
        d.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', {
            key: kickKeyValue(code), code: code, bubbles: true, cancelable: true
        }));
    }

    function opReleaseDir() {
        var c = state.op.dir;
        state.op.dir = null;
        if (c && state.heldKeys.indexOf(c) < 0) opDispatch(c, false);
    }

    function opReleaseAll() {
        opReleaseDir();
        state.op.step = 0;
        state.op.wait = 0;
        state.op.persist = 0;
        state.op.lastSig = '';
    }

    function opStep() {
        opReleaseDir();
        state.op.step = (state.op.step + 1) % CFG.opRing.length;
        var next = opRingCode(state.op.step);
        state.op.dir = state.heldKeys.indexOf(next) < 0 ? next : null;
        if (state.op.dir) opDispatch(next, true);
        state.op.wait = CFG.opValue;
    }

    function opTick() {
        if (!state.op.enabled) {
            opReleaseAll();
            return false;
        }
        if (!hasBall() || !(kickHeld() || state.heldCodes.length)) {
            opReleaseAll();
            return false;
        }
        var sig = [];
        var dirs = state.dirs;
        for (var k in dirs) {
            if (state.heldKeys.indexOf(dirs[k]) >= 0) sig.push(dirs[k]);
        }
        sig.sort();
        sig = sig.join(',');
        if (sig && sig === state.op.lastSig) state.op.persist++;
        else if (sig) state.op.persist = 1;
        else state.op.persist = 0;
        state.op.lastSig = sig;
        if (state.op.persist >= CFG.opPersistMax) {
            opReleaseDir();
            return false;
        }
        state.op.wait--;
        if (state.op.wait <= 0) opStep();
        return state.op.dir !== null;
    }

    /* ------------------------------ dispatch ------------------------------ */

    function tick(now) {
        if (!state.active) {
            hudSet({ disabled: true });
            return;
        }
        if (!state.gameDoc) return;
        var opActive = opTick();
        if (!state.heldCodes.length) {
            hudSet({ mode: state.op.enabled ? 'OP' : 'NONE', op: opActive });
            state.lastTapAt = 0;
            return;
        }
        rhythmTap(now);
        hudSet({ mode: state.op.enabled ? 'OP' : 'SPAM', action: 'spam', boost: ballNear(), op: opActive });
    }

    /* ------------------------------ HUD ------------------------------ */

    function ensureHud() {
        if (hud) return hud;
        hud = document.createElement('div');
        hud.id = 'nyx-bh-hud';
        hud.style.cssText = 'position:fixed;top:8px;left:8px;z-index:99999;background:rgba(10,12,18,0.85);color:#d7e3f4;font:12px/1.5 Consolas,monospace;padding:8px 10px;border:1px solid #2a3550;border-radius:4px;pointer-events:none;white-space:pre;text-align:left;';
        hud._body = document.createElement('div');
        hud.appendChild(hud._body);
        (document.body || document.documentElement).appendChild(hud);
        hudSet({});
        return hud;
    }

    function hudSet(info) {
        var o = {
            disabled: false,
            connected: state.connected,
            mode: 'NONE',
            boost: false,
            op: false,
            action: ''
        };
        for (var k in info) {
            if (info[k] !== undefined) o[k] = info[k];
        }
        hud._info = o;
        updateHud();
    }

    function updateHud() {
        if (!hud) return;
        var o = hud._info || {};
        var lines = [];
        var opShaking = o.op;
        if (o.disabled) {
            lines.push({ t: '[BlockHelper] DISATTIVO - premi L per attivare', c: null });
        } else if (!o.connected) {
            lines.push({ t: '[BlockHelper] in attesa del gioco...', c: null });
        } else {
            lines.push({ t: '[BlockHelper] ' + o.mode + (state.active ? '' : ' - DISATTIVO') + (state.heldCodes.length ? ' - BLOCK' : ''), c: null });
            lines.push({ t: 'kick: ' + state.kicks + '  ritmo: ' + CFG.cps + '/s (' + cpsInterval() + 'ms)' + (o.boost ? '  PALLA VICINA +' : ''), c: null });
            var opLabel = state.op.enabled ? 'ON' : 'off';
            var opSuffix = o.op ? '  << OP >>' : '';
            var opExtra = (state.op.enabled && !hasBall()) ? '  (servono palla + kick)' : '';
            lines.push({ t: 'OP: ' + opLabel + ' (H)' + opSuffix + opExtra, c: o.op ? '#00ff88' : (state.op.enabled ? '#80c0ff' : null) });
            if (o.action) lines.push({ t: 'azione: ' + o.action, c: null });
        }
        lines.push({ t: 'v' + SCRIPT_VERSION + '  L block  K on/off  H OP  O hud  M/N ritmo', c: null });
        var el = hud._body;
        el.textContent = '';
        for (var i = 0; i < lines.length; i++) {
            var d = document.createElement('div');
            d.textContent = lines[i].t;
            if (lines[i].c) d.style.color = lines[i].c;
            el.appendChild(d);
        }
        if (opShaking) {
            hud.style.borderColor = '#00ff88';
            hud.style.boxShadow = '0 0 12px #00ff8860';
        } else if (state.op.enabled) {
            hud.style.borderColor = '#4a7a5a';
            hud.style.boxShadow = 'none';
        } else {
            hud.style.borderColor = '#2a3550';
            hud.style.boxShadow = 'none';
        }
    }

    /* ------------------------------ avvio ------------------------------ */

    function refreshKeys() {
        state.kickCodes = kickCodesOf(readKeyMap());
        state.dirs = directionCodes();
        state.lastKeysRefresh = Date.now();
    }

    ensureHud();
    setInterval(function () {
        connect();
    }, CFG.connectMs);
    setInterval(function () {
        if (Date.now() - state.lastKeysRefresh > CFG.keysRefreshMs) refreshKeys();
    }, CFG.keysRefreshMs);
    setInterval(function () {
        tick(Date.now());
    }, CFG.pollMs);
    setInterval(updateHud, 600);
})();
