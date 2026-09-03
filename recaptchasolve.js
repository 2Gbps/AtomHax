// RecaptchaSolver — drives Google's REAL reCAPTCHA v2 widget over the Chrome
// DevTools Protocol, ported from GoogleRecaptchaBypass/RecaptchaSolver.py.
//
// The old RecaptchaV3Ninja anchor/reload trick mints tokens that Google's
// siteverify rejects server-side (haxball re-validates the token and re-arms
// the captcha). Solving the actual widget — clicking the checkbox, and if a
// challenge pops up, transcribing the audio challenge and submitting it —
// yields a token Google accepts.
"use strict";

const { MPEGDecoder } = require("mpg123-decoder");

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const ANCHOR_URL = "recaptcha/api2/anchor";
const BFRAME_URL = "recaptcha/api2/bframe";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class RecaptchaSolver {
  constructor(webContents, opts) {
    opts = opts || {};
    this.wc = webContents;
    this.timeout = opts.timeout || 45000;
    this.sttTranscribe = opts.sttTranscribe; // offline Vosk transcription fn
    this.contexts = new Map(); // frameId -> execution context id
    this.frameUrls = new Map(); // frameId -> url
    this.ready = false;
    this.busy = false;
    this._msg = this._onMessage.bind(this);
  }

  // ── CDP plumbing ────────────────────────────────────────────────────────

  async ensureAttached() {
    if (this.ready) return;
    const dbg = this.wc.debugger;
    if (!dbg.isAttached()) dbg.attach("1.3");
    dbg.on("message", this._msg);
    await dbg.sendCommand("Runtime.enable");
    await dbg.sendCommand("Page.enable");
    await this._refreshFrames();
    this.ready = true;
  }

  detach() {
    if (!this.ready) return;
    try {
      this.wc.debugger.removeListener("message", this._msg);
      if (this.wc.debugger.isAttached()) this.wc.debugger.detach();
    } catch (e) {}
    this.ready = false;
  }

  _onMessage(_event, method, params) {
    if (method === "Runtime.executionContextCreated") {
      const ctx = params.context;
      const fid = ctx.auxData && ctx.auxData.frameId;
      if (fid) this.contexts.set(fid, ctx.id);
    }
    if (method === "Page.frameNavigated") {
      const f = params.frame;
      if (f && f.id) this.frameUrls.set(f.id, f.url);
    }
  }

  async _refreshFrames() {
    try {
      const { frameTree } = await this.wc.debugger.sendCommand("Page.getFrameTree");
      const walk = (n) => {
        if (n.frame) this.frameUrls.set(n.frame.id, n.frame.url);
        (n.childFrames || []).forEach(walk);
      };
      walk(frameTree);
    } catch (e) {}
  }

  _findFrameId(urlSubstr) {
    for (const [fid, url] of this.frameUrls) {
      if (url && url.indexOf(urlSubstr) >= 0) return fid;
    }
    return null;
  }

  async _evalInFrame(frameId, expression) {
    const cid = this.contexts.get(frameId);
    if (!cid) return { ok: false, error: "no execution context" };
    try {
      const res = await this.wc.debugger.sendCommand("Runtime.evaluate", {
        contextId: cid,
        expression,
        returnByValue: true,
        awaitPromise: true,
        userGesture: true,
      });
      if (res.exceptionDetails) {
        return { ok: false, error: res.exceptionDetails.text };
      }
      return { ok: true, value: res.result ? res.result.value : undefined };
    } catch (e) {
      return { ok: false, error: (e && e.message) || String(e) };
    }
  }

  // ── Frame geometry ──────────────────────────────────────────────────────

  // Match the iframe ELEMENT inside a parent frame by its src (readable
  // cross-origin), so the offset walk works regardless of title attributes.
  _selectorFor(url) {
    if (url.indexOf(BFRAME_URL) >= 0) return 'iframe[src*="recaptcha/api2/bframe"]';
    if (url.indexOf(ANCHOR_URL) >= 0) return 'iframe[src*="recaptcha/api2/anchor"]';
    if (url.indexOf("html5.haxball") >= 0) return 'iframe[src*="html5.haxball"]';
    return null;
  }

  async _frameParents() {
    const parents = new Map();
    try {
      const { frameTree } = await this.wc.debugger.sendCommand("Page.getFrameTree");
      const walk = (n, pid) => {
        if (n.frame) {
          if (pid) parents.set(n.frame.id, pid);
          this.frameUrls.set(n.frame.id, n.frame.url);
        }
        (n.childFrames || []).forEach((c) => walk(c, n.frame ? n.frame.id : pid));
      };
      walk(frameTree, null);
    } catch (e) {}
    return parents;
  }

  // Offsets of a frame's viewport origin (top-left) inside the top frame's
  // viewport, by walking iframe elements up the frame tree.
  async _frameOriginInTop(frameId) {
    const parents = await this._frameParents();
    let cur = frameId;
    let total = { x: 0, y: 0 };
    let guard = 0;
    while (parents.has(cur) && guard++ < 8) {
      const pid = parents.get(cur);
      const childUrl = this.frameUrls.get(cur) || "";
      const sel = this._selectorFor(childUrl);
      if (!sel) break;
      const res = await this._evalInFrame(
        pid,
        `(() => {
          const el = document.querySelector(${JSON.stringify(sel)});
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { x: r.left, y: r.top };
        })()`
      );
      if (!res.ok || !res.value) break;
      total.x += res.value.x;
      total.y += res.value.y;
      cur = pid;
    }
    return total;
  }

  async _elementCenter(frameId, selector) {
    const origin = await this._frameOriginInTop(frameId);
    const res = await this._evalInFrame(
      frameId,
      `(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return null;
        try { el.scrollIntoView({ block: 'center', inline: 'center' }); } catch (e) {}
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      })()`
    );
    if (!res.ok || !res.value) return null;
    return { x: Math.round(origin.x + res.value.x), y: Math.round(origin.y + res.value.y) };
  }

  // Physical left-click at viewport coordinates (top frame space).
  async _mouseClick(x, y) {
    // Move first so the event stream looks like a real pointer.
    await this.wc.debugger.sendCommand("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x,
      y,
    });
    await sleep(40 + Math.floor(Math.random() * 80));
    await this.wc.debugger.sendCommand("Input.dispatchMouseEvent", {
      type: "mousePressed",
      x,
      y,
      button: "left",
      clickCount: 1,
    });
    await sleep(30 + Math.floor(Math.random() * 50));
    await this.wc.debugger.sendCommand("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x,
      y,
      button: "left",
      clickCount: 1,
    });
  }

  async clickElement(frameId, selector) {
    const pt = await this._elementCenter(frameId, selector);
    if (!pt) return false;
    await this._mouseClick(pt.x, pt.y);
    return true;
  }

  async _checkboxChecked(anchorFrameId) {
    const res = await this._evalInFrame(
      anchorFrameId,
      `(() => {
        const c = document.querySelector('.recaptcha-checkbox');
        const resp = document.querySelector('textarea[name="g-recaptcha-response"]');
        const tokenLen = resp && resp.value ? resp.value.length : 0;
        return {
          checked: c ? c.getAttribute('aria-checked') : null,
          tokenLen: tokenLen,
        };
      })()`
    );
    if (!res.ok || !res.value) return false;
    return res.value.checked === "true" || res.value.tokenLen > 0;
  }

  // ── Audio transcription (mp3 → mono Float32 → offline Vosk STT) ─────────

  // Mix all channels down to a single Float32Array (mono, [-1, 1]) resampled
  // to 16 kHz — the sample rate Vosk's recognizer is configured for.
  _toMonoFloat(channelData, sampleRate) {
    if (!channelData || !channelData.length) return null;
    const n = channelData[0].length;
    const targetRate = 16000;
    const outLen = Math.max(1, Math.round((n * targetRate) / sampleRate));
    const out = new Float32Array(outLen);
    const numCh = channelData.length;
    const step = sampleRate / targetRate;
    for (let i = 0; i < outLen; i++) {
      const srcIdx = Math.min(n - 1, Math.floor(i * step));
      let v = 0;
      for (let ch = 0; ch < numCh; ch++) v += channelData[ch][srcIdx];
      v /= numCh;
      out[i] = Math.max(-1, Math.min(1, v));
    }
    return out;
  }

  async _transcribeAudio(url) {
    let buf;
    try {
      const res = await fetch(url, {
        headers: {
          "user-agent": UA,
          referer: "https://www.google.com/",
          accept: "audio/webm,audio/ogg,audio/wav,audio/mp3,audio/*;q=0.9,*/*;q=0.8",
        },
      });
      if (!res.ok) return null;
      buf = Buffer.from(await res.arrayBuffer());
    } catch (e) {
      return null;
    }
    if (!buf || !buf.length) return null;

    let channelData, sampleRate;
    const decoder = new MPEGDecoder();
    try {
      const decoded = await decoder.decode(new Uint8Array(buf));
      const flushed = await decoder.flush();
      channelData = flushed.channelData || decoded.channelData;
      sampleRate = flushed.sampleRate || decoded.sampleRate;
    } catch (e) {
      try { decoder.free(); } catch (_) {}
      return null;
    }
    try { decoder.free(); } catch (_) {}

    const mono = this._toMonoFloat(channelData, sampleRate);
    if (!mono) return null;

    if (typeof this.sttTranscribe !== "function") return null;
    try {
      const text = await this.sttTranscribe(mono, 16000);
      return (text || "").trim() || null;
    } catch (e) {
      console.warn("[recaptcha] offline STT failed:", (e && e.message) || e);
      return null;
    }
  }

  // ── Challenge state helpers ─────────────────────────────────────────────

  async _challengeType(bfid) {
    const res = await this._evalInFrame(
      bfid,
      `(() => {
        const audioBtn = document.querySelector('#recaptcha-audio-button');
        const imgTable = document.querySelector('#rc-imageselect');
        const verifyBtn = document.querySelector('#recaptcha-verify-button');
        const audioSrc = document.querySelector('#audio-source');
        const blocked = document.body.innerText.indexOf('automated queries') >= 0;
        return {
          hasAudioBtn: !!audioBtn,
          hasImageTable: !!imgTable,
          hasVerifyBtn: !!verifyBtn,
          hasAudioSrc: !!(audioSrc && (audioSrc.src || audioSrc.getAttribute('src'))),
          blocked: blocked,
          bodyTextLen: document.body.innerText.length,
          bodyHtmlLen: document.body.innerHTML.length,
        };
      })()`
    );
    if (!res.ok || !res.value) return null;
    return res.value;
  }

  // ── Main solve flow ─────────────────────────────────────────────────────

  async _waitForFrame(urlSubstr, timeoutMs) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      await this._refreshFrames();
      const fid = this._findFrameId(urlSubstr);
      // Wait until the frame's execution context is registered too, so
      // _evalInFrame won't race the executionContextCreated events.
      if (fid && this.contexts.has(fid)) return fid;
      await sleep(300);
    }
    return null;
  }

  async _solveAudioChallenge(anchorFrameId) {
    const bfid = await this._waitForFrame(BFRAME_URL, 12000);
    if (!bfid) return { solved: false, reason: "no-challenge" };

    // Wait until the challenge DOM actually builds (not just the blank bframe).
    let challengeInfo = null;
    for (let i = 0; i < 25; i++) {
      await sleep(400);
      challengeInfo = await this._challengeType(bfid);
      if (challengeInfo && (challengeInfo.hasVerifyBtn || challengeInfo.hasImageTable)) {
        break;
      }
    }
    if (!challengeInfo || !challengeInfo.hasVerifyBtn) {
      return { solved: false, reason: "challenge-render-failed" };
    }
    console.log('[recaptcha] challenge DOM ready:', JSON.stringify(challengeInfo));

    // Sometimes Google only shows a "Verify" button (high-trust case).
    if (!challengeInfo.hasImageTable && challengeInfo.hasVerifyBtn) {
      await this.clickElement(bfid, '#recaptcha-verify-button');
      for (let i = 0; i < 12; i++) {
        await sleep(1000);
        if (await this._checkboxChecked(anchorFrameId)) return { solved: true };
      }
      return { solved: false, reason: 'verify-button-failed' };
    }

    // Image-grid challenge: prefer switching to audio.
    for (let attempt = 0; attempt < 4; attempt++) {
      if (await this._checkboxChecked(anchorFrameId)) return { solved: true };

      const info = await this._challengeType(bfid);
      if (!info || info.blocked) {
        await this.clickElement(bfid, '#recaptcha-reload-button');
        await sleep(1500);
        continue;
      }

      if (info.hasAudioSrc) {
        // Already on audio challenge.
      } else if (info.hasAudioBtn) {
        // Click the audio button (realistic move + click).
        await this.clickElement(bfid, '#recaptcha-audio-button');
        await sleep(2000);
      }

      const srcRes = await this._evalInFrame(
        bfid,
        `(() => { const a = document.querySelector('#audio-source'); return a ? (a.src || a.getAttribute('src')) : null; })()`
      );
      if (!srcRes.ok || !srcRes.value) {
        await this.clickElement(bfid, '#recaptcha-reload-button');
        await sleep(1500);
        continue;
      }

      console.log('[recaptcha] audio source found, transcribing...');
      const transcript = await this._transcribeAudio(srcRes.value);
      console.log('[recaptcha] transcript:', transcript);
      if (transcript) {
        await this._evalInFrame(
          bfid,
          `(() => { const i = document.querySelector('#audio-response'); if (i) { i.focus(); i.value = ''; } return true; })()`
        );
        await sleep(100);
        // Type character-by-character so it looks like human input.
        for (const ch of transcript) {
          try {
            await this.wc.debugger.sendCommand('Input.insertText', { text: ch });
          } catch (e) {}
          await sleep(40 + Math.floor(Math.random() * 60));
        }
        await sleep(200);
        await this.clickElement(bfid, '#recaptcha-verify-button');

        for (let i = 0; i < 14; i++) {
          await sleep(1000);
          if (await this._checkboxChecked(anchorFrameId)) return { solved: true };
        }
      }

      await this.clickElement(bfid, '#recaptcha-reload-button');
      await sleep(1500);
    }

    return { solved: false, reason: 'audio-failed' };
  }

  async solve() {
    if (this.busy) return { solved: false, reason: "busy" };
    this.busy = true;
    const start = Date.now();
    try {
      console.log('[recaptcha] solver starting');
      await this.ensureAttached();

      const anchorFid = await this._waitForFrame(ANCHOR_URL, 15000);
      if (!anchorFid) return { solved: false, reason: "no-widget" };
      console.log('[recaptcha] anchor frame ready:', anchorFid);
      await sleep(800); // let the widget initialize

      // Already solved? (retry/reconnect case)
      if (await this._checkboxChecked(anchorFid)) {
        console.log('[recaptcha] already solved');
        return { solved: true };
      }

      // Click the "I'm not a robot" checkbox.
      const clicked = await this.clickElement(anchorFid, ".rc-anchor-content");
      console.log('[recaptcha] checkbox click:', clicked);
      if (this.timeout && Date.now() - start > this.timeout) return { solved: false, reason: "timeout" };

      // Poll: checkbox may solve instantly (no challenge).
      for (let i = 0; i < 20; i++) {
        await sleep(600);
        if (await this._checkboxChecked(anchorFid)) {
          console.log('[recaptcha] solved by checkbox click');
          return { solved: true };
        }
        if (this.timeout && Date.now() - start > this.timeout) return { solved: false, reason: "timeout" };
        // A challenge frame appeared → attempt the audio challenge once.
        if (this._findFrameId(BFRAME_URL)) {
          console.log('[recaptcha] challenge frame detected, switching to audio');
          return this._solveAudioChallenge(anchorFid);
        }
      }
      return { solved: false, reason: "unsolved" };
    } finally {
      this.busy = false;
    }
  }
}

module.exports = { RecaptchaSolver, sleep };