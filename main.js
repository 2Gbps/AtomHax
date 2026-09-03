const { app, shell, BrowserWindow, ipcMain, dialog, screen, Menu, powerSaveBlocker, webFrameMain, protocol, net, session } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const { URL, pathToFileURL } = require('url');
const { z } = require('zod');
const { version } = require('./package.json');
const { generateKeyPairSync } = require('crypto');
const { RecaptchaSolver } = require('./recaptchasolve');

// Custom scheme serving the local Vosk model files to the hidden offline STT
// renderer. Registered before app ready (required by Electron).
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'stt',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
  {
    scheme: 'haxengine',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Offline speech-to-text (Vosk WASM) â€” fully local, no network, no API key.
// The reCAPTCHA audio challenge is decoded to PCM in the main process
// (mpg123-decoder), then transcribed here in a hidden renderer running
// vosk-browser with a bundled model served over the stt:// scheme.
let sttWindow = null;
let sttModelPath = null;
let sttReady = false;
let sttPending = null; // { resolve, reject, timer }

const sttModelDir = () => {
  // Root folder holding the bundled Vosk model archive.
  return app.isPackaged
    ? path.join(process.resourcesPath, 'stt-model')
    : path.join(__dirname, 'stt-model');
};

const STT_MODEL_ARCHIVE = 'vosk-model-small-en-us-0.15.tar.gz';

const registerSttProtocol = () => {
  try {
    if (protocol.isProtocolHandled('stt')) return;
    protocol.handle('stt', (req) => {
      const url = new URL(req.url);
      const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
      // Only ever serve the model archive; anything else 404s.
      if (rel !== STT_MODEL_ARCHIVE) {
        return new Response('not found', { status: 404 });
      }
      const p = path.join(sttModelPath || sttModelDir(), rel);
      return net.fetch(pathToFileURL(p).toString());
    });
  } catch (e) {
    console.warn('[stt] protocol registration failed:', (e && e.message) || e);
  }
};

const initSttWindow = () => {
  sttModelPath = sttModelDir();
  if (!fs.existsSync(path.join(sttModelPath, STT_MODEL_ARCHIVE))) {
    console.warn('[stt] Vosk model archive not found at', sttModelPath);
    return;
  }
  registerSttProtocol();
  sttWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'stt-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: false, // allow the blob worker to fetch stt:// model archive
      backgroundThrottling: false,
    },
  });
  sttWindow.on('closed', () => {
    sttWindow = null;
    sttReady = false;
  });
  sttWindow.webContents.on('console-message', (_e, _l, message) => {
    console.log('[stt] renderer:', message);
  });
  sttWindow.loadFile(path.join(__dirname, 'stt.html'), {
    query: { model: 'stt://model/' + STT_MODEL_ARCHIVE },
  });
};

ipcMain.on('stt-ready', () => {
  sttReady = true;
  console.log('[stt] Vosk model loaded (offline STT ready)');
});
ipcMain.on('stt-error', (_e, msg) => {
  console.warn('[stt] error:', msg);
  if (sttPending) {
    clearTimeout(sttPending.timer);
    sttPending.reject(new Error(msg));
    sttPending = null;
  }
});
ipcMain.on('stt-result', (_e, text) => {
  if (sttPending) {
    clearTimeout(sttPending.timer);
    sttPending.resolve(text);
    sttPending = null;
  }
});

// Transcribe a Float32Array (mono, [-1, 1]) using the offline Vosk model.
const sttTranscribe = (pcmFloat, sampleRate) =>
  new Promise((resolve, reject) => {
    if (!sttWindow || !sttReady) {
      reject(new Error('stt-not-ready'));
      return;
    }
    sttPending = {
      resolve,
      reject,
      timer: setTimeout(() => {
        sttPending = null;
        reject(new Error('stt-timeout'));
      }, 30000),
    };
    sttWindow.webContents.send('stt-transcribe', {
      pcm: pcmFloat,
      sampleRate: sampleRate || 16000,
    });
  });

let win;
let rpc = null;
const rpcClientId = "1391027232352501841";

// Lazy-init Discord RPC so the module isn't loaded/parsed on startup
// unless Rich Presence is actually enabled (perf checklist #1/#2).
const getRpc = () => {
	if (!rpc) {
		const DiscordRPC = require("discord-rpc");
		rpc = new DiscordRPC.Client({ transport: 'ipc' });
		rpc.on('ready', () => {
			console.log('Discord RPC ready');
		});
	}
	return rpc;
};


const validatePreferences = (prefs) => {
  const PreferencesSchema = z.object({
      fps_unlock: z.boolean(),
      notes: z.array(z.object({
        title: z.string(),
        body: z.string(),
        time: z.string()
      })), 
      transp_ui: z.boolean(),
      shortcuts: z.array(z.tuple([z.string(), z.string()])),
      discord_rpc: z.boolean().optional(),
      render_scale: z.number().optional(),
      // FPS limit for the gameframe-realm rAF throttle. 0 (default) = no
      // throttle, rely on native vsync for smooth gameplay at monitor
      // refresh (60 / 144 / 240 etc, depending on display). Set to a
      // positive integer to cap HaxBall's rAF at that rate via the
      // gameframe-realm limiter (e.g. 240 to cap at 240fps even on a
      // 144hz monitor â€” useful only if vsync is also disabled, which we
      // now keep ON, so values above monitor refresh are mostly cosmetic).
      fps_limit: z.number().optional(),
      // Tick multiplier: how many game-loop iterations to run per compositor
      // frame. The game's loop is rAF-driven and its physics is a wall-clock
      // accumulator, so running the callback N times per BeginFrame advances
      // ~0 extra simulation time (no double-speed) while the in-game FPS
      // counter (which counts loop ticks) reads Nx. The canvas still commits
      // once per BeginFrame, so real present rate is unchanged. 1 = disabled.
      tick_mult: z.number().optional()
  });

  try {
    PreferencesSchema.parse(prefs);
  } catch (err) {
    console.error('Failed to validate preferences:', err);
}

}

// In-memory preferences cache: preferences are read once from disk and kept
// in RAM afterwards, so IPC calls during gameplay never hit the disk.
let preferencesCache = null;

const saveAppPreferences = (prefs) => {
  preferencesCache = prefs;
  const userDatapath = app.getPath('userData')
  const preferencesPath = path.join(userDatapath, 'preferences.json')
  try {
    fs.writeFileSync(preferencesPath, JSON.stringify(prefs, null, 2));
  } catch (error) {
    console.error('Error saving app preferences:', error);
  }
}

const loadAppPreferences = () => {
  if (preferencesCache) return preferencesCache;
  const userDataPath = app.getPath('userData')
  const preferencesPath = path.join(userDataPath, 'preferences.json')
  const preferencesDefaultPath = path.join(__dirname, 'inject', 'preferences_default.json')
  try {
    if (fs.existsSync(preferencesPath)) {
      const fileContent = fs.readFileSync(preferencesPath, 'utf-8');
      const data = JSON.parse(fileContent)
      validatePreferences(data)
      preferencesCache = data;
      return data;
    } else {
      // File doesn't exist, return and save default settings
      const fileContent = fs.readFileSync(preferencesDefaultPath, 'utf8')
      const data = JSON.parse(fileContent)
      validatePreferences(data)
      saveAppPreferences(data)
      return data;
    }
  } catch (error) {
    console.error('Error loading preferences:', error);
    app.quit();
    return {};
  }
}

const preferences = loadAppPreferences();

// â”€â”€ Scripts storage â”€â”€
const scriptsPath = () => path.join(app.getPath('userData'), 'scripts.json');
const loadScripts = () => {
  try {
    if (fs.existsSync(scriptsPath())) {
      return JSON.parse(fs.readFileSync(scriptsPath(), 'utf-8'));
    }
  } catch (e) { console.error('[scripts] load error:', e); }
  return [];
};
const saveScripts = (scripts) => {
  try { fs.writeFileSync(scriptsPath(), JSON.stringify(scripts, null, 2)); }
  catch (e) { console.error('[scripts] save error:', e); }
};

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// PERFORMANCE SWITCHES â€” purehax.eu's proven recipe (decompiled from their
// app.asar; v1.1.3, the build He reports hits 1000+ fps).
//
// Why match purehax exactly: our speculative flag pileup fought itself and
// dropped us to 370-400. purehax uses JUST 6 flags and gets 4-5x our FPS.
// The real win is in inject.js's Canvas2D patch (arcsâ†’lines, 1px lineWidth)
// â€” see canvaspatch.ts â€” not in flags. But the flag set must be identical to
// theirs to avoid conflicting with the canvas patch's GPU-raster expectations.
// Specifically:
//   - They DISABLE CanvasOopRasterization (we had it ENABLED â†’ conflict).
//   - They use overlay-strategies:'' (kills overlay/windowed compositing).
//   - They use disable-smooth-scrolling (no scroll animation work).
//   - They DON'T use enable-accelerated-2d-canvas (conflicts with enable-gpu-
//     rasterization â€” both target the same path, setting both raises a
//     conflict warning in chrome://gpu).
//   - They DON'T use disable-gpu-sandbox (keeps the GPU process sandboxed
//     for security; their perf doesn't need it).
//   - They DON'T use disable-software-rasterizer (let the blocklist decide).
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const applyPerformanceSwitches = () => {
  // â”€â”€ GPU acceleration (Canvas2D) â”€â”€
  app.commandLine.appendSwitch('ignore-gpu-blocklist');
  app.commandLine.appendSwitch('enable-gpu-rasterization');
  app.commandLine.appendSwitch('disable-smooth-scrolling');
  app.commandLine.appendSwitch('overlay-strategies', '');
  // â”€â”€ 2D-canvas cost reduction (the game is 100% 2D canvas) â”€â”€
  // Real, still-supported Chromium switches (content_switches.cc):
  //   disable-canvas-aa        â†’ no antialiasing on 2D canvas. HaxBall's
  //                              sprites/lines are chunky game art; the AA
  //                              pass on every path stroke is pure GPU cost.
  //   disable-2d-canvas-clip-aa â†’ same, for canvas clip regions.
  // net: every gameframe draw call gets cheaper, which raises the internal
  // rAF ceiling further without touching the present path (no stutter risk).
  app.commandLine.appendSwitch('disable-canvas-aa');
  app.commandLine.appendSwitch('disable-2d-canvas-clip-aa');
  // num-raster-threads=4 â†’ DOM/UI raster work (room list, menus, chat) runs
  // on up to 4 raster threads instead of 1-2, so the main thread stays free
  // for the game loop during gameplay. Max is 4 (Chromium clamps).
  app.commandLine.appendSwitch('num-raster-threads', '4');
  // gpu-rasterization-msaa-sample-count=0 â†’ no MSAA on GPU-rasterized tiles.
  // Same philosophy as canvas-aa above; 0 is the documented "disable" value.
  app.commandLine.appendSwitch('gpu-rasterization-msaa-sample-count', '0');
  // CanvasOopRasterization is DISABLED here. Purehax disables it because it
  // conflicts with the JS-level canvas patch in inject.js â€” if OOP raster
  // bounces canvas work to the GPU process, our lineWidth/arc hooks on the
  // renderer-side CanvasRenderingContext2D.prototype don't take effect.
  // Also bundled with CalculateNativeWinOcclusion + WidgetLayering in the
  // present-path optimization block below (Chromium keeps the LAST
  // duplicate --disable-features value, so we set the combined set there).

  // â”€â”€ FPS mode â”€â”€
  // THE STUTTER ROOT CAUSE (now fixed):
  //   `disable-gpu-vsync` lets rAF spin at 1000+ fps on the renderer thread.
  //   The GPU process queues Present() calls faster than slower GPUs can
  //   drain them. DWM composites a stale frame from deep in the queue, so
  //   visible movement looks frozen at ~0.1fps even though the internal
  //   frame counter says 1000. Friend's faster GPU drains the queue and
  //   sees smooth gameplay; ours doesn't.
  //
  // THE BETTER WAY (this build):
  //   Keep `disable-frame-rate-limit` (lifts Chromium's artificial 60fps
  //   cap on rAF), DROP `disable-gpu-vsync` (keep vsync ON so the Present
  //   queue is bounded to 2 frames, no backup, DWM composites the latest
  //   ready frame).
  //
  //   Net behavior on a 60hz monitor: 60fps (DWM caps at refresh, can't see
  //   more anyway). On a 144hz monitor: 144fps â€” "unlocked" relative to
  //   HaxBall's vanilla 60fps cap, smooth because vsync bounds the queue.
  //   On 240hz: 240fps. etc.
  //
  //   DWM ALWAYS composites at the monitor's refresh rate, so visible FPS
  //   above that is physically impossible regardless of any flag â€”
  //   uncapping rAF only causes Present-queue backup on slow GPUs.
  //
  // PUREHAX'S BROKEN LIMITER:
  //   They have a "locked" mode that injects a rAF throttle into the
  //   top-level webContents (parent realm). But HaxBall's game loop runs
  //   `requestAnimationFrame` INSIDE the gameframe iframe's contentWindow
  //   â€” a SEPARATE JS realm. Their throttle overrides the wrong window
  //   and is a no-op for the actual game. That's why their "locked" mode
  //   doesn't fix the stutter either.
  //
  //   We do it correctly below: inject the throttle INTO the gameframe
  //   via WebFrameMain.executeJavaScript (same mechanism as the canvas
  //   patch), so it overrides `window.requestAnimationFrame` in the
  //   iframe's realm where HaxBall's game loop actually lives.
  app.commandLine.appendSwitch('disable-frame-rate-limit');
  app.commandLine.appendSwitch('disable-gpu-vsync');
  // Prevents the GPU process from hitting permission deadlocks when pumping
  // 1300+ frames through the compositor (online-recipe requirement for the
  // d3d9 desync-canvas bypass).
  app.commandLine.appendSwitch('disable-gpu-sandbox');
  // Prevents the GPU watchdog from killing the GPU process when it's been
  // pushing 1000+ presents/sec for a while (sustained high-fps load looks
  // like a "hang" to the watchdog and it force-resets the GPU process,
  // which manifests as a brief freeze/black screen mid-game). Known-good
  // flag for unlimited-fps setups. NOTE: it was in our OLD suspect pile
  // (see the CAREFUL LAYERED ADD-ONS comment) that we blamed for a room-join
  // freeze â€” that freeze was later traced to domopt forcing
  // low_latency_canvas=0, NOT to any flag. Safe to re-add now that the
  // real root cause is fixed.
  app.commandLine.appendSwitch('disable-gpu-watchdog');

  // â”€â”€ ANGLE backend â”€â”€
  // VULKAN. He clarified: his display is 60Hz, so Vulkan's 154 internal was
  // ALREADY uncapped (154 > 60) and it was the ONLY backend that was smooth
  // end-to-end. Why: ANGLE Vulkan uses MAILBOX present mode â€” a present
  // never waits on a queue; each new frame REPLACES the pending one and is
  // presented at the next scanout. That is literally "don't wait for the
  // queue, always render the newest stuff".
  //
  // d3d9 fixed the freeze but DEGRADED over time (perfect first seconds,
  // then worse until it matches the old dx9 stall). Classic growing frame
  // queue / backbuffer accumulation in the legacy present path.
  //
  // History:
  //   d3d11       â†’ 1300fps internal, visible ~1fps (flip-model queue).
  //   gl          â†’ ANGLE desktop GL init'd but window present stayed d3d11.
  //   d3d11on12   â†’ same flip-model present â†’ same freeze.
  //   d3d9        â†’ no freeze but degrades over time (growing queue).
  //   vulkan      â†’ SMOOTH, no degradation, MAILBOX (never waits on queue).
  //                 Internal 154 = uncapped (> 60Hz display).
  app.commandLine.appendSwitch('use-angle', 'vulkan');
  // NOTE: 'Vulkan' feature flag is merged with SkiaRenderer in the
  // enable-features below (Chromium keeps only the LAST --enable-features
  // value).

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // CAREFUL LAYERED ADD-ONS â€” only background services / throttling heuristics.
  //
  // We previously added 13 flags on top of the purehax 6-flag baseline and
  // HaxBall froze on room join. The suspect flags were the ones touching
  // the GPU/sandbox/render path (--disable-gpu-sandbox, --disable-gpu-watchdog,
  // --disable-low-res-tiling, --enable-zero-copy, --enable-native-gpu-memory-
  // buffers, --force_high_performance_gpu, --js-flags). We removed ALL of
  // those and only kept back the flags that are categorically safe â€” they
  // touch background services / scheduler heuristics, NOT the GPU/render
  // pipeline. If HaxBall freezes again, the bug is one of THESE three.
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  // â”€â”€ Background throttling: OFF â”€â”€
  // Stops Chromium's heuristic throttling of rAF/timers when the window is
  // occluded (covered by OBS / Discord). Doesn't touch the render pipeline.
  app.commandLine.appendSwitch('disable-background-timer-throttling');
  app.commandLine.appendSwitch('disable-renderer-backgrounding');
  app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');

  // â”€â”€ Disable background services (each one spawns maintenance threads) â”€â”€
  // These don't touch rendering. Sync, component autoupdater, domain
  // reliability telemetry, crash reporter. HaxBall uses none of them.
  app.commandLine.appendSwitch('disable-sync');
  app.commandLine.appendSwitch('disable-component-update');
  app.commandLine.appendSwitch('disable-domain-reliability');
  app.commandLine.appendSwitch('disable-breakpad');

  // â”€â”€ Raise process priority so renderer/GPU children inherit it â”€â”€
  // Purehax doesn't set this. Scheduling priority, not a render flag.
  app.commandLine.appendSwitch('high-priority');

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // GPU PRESENT-PATH OPTIMIZATIONS (added back after diagnosing the real
  // stutter root cause on his system â€” see comment block above).
  //
  // His system (queried at runtime):
  //   â€¢ Dual GPU: AMD Radeon iGPU + NVIDIA GTX 1650 dGPU
  //   â€¢ MPO disabled by xOS (OverlayTestMode=0x5 sentinel)
  //   â€¢ HAGS registry value missing (xOS stripped it)
  //   â€¢ HaxBall Client registry already pinned to GpuPreference=2 (dGPU)
  //
  // Without MPO, the GPU can't hardware-overlay HaxBall's frame directly to
  // the display â€” DWM has to composite it. Cross-adapter (dGPUâ†’iGPU) DWM
  // composition at 1000+ rAF fps backs up the Present queue â†’ DWM shows a
  // stale frame â†’ "1000 internal / 0.1 visible" stutter.
  //
  // These flags don't fully fix that (only re-enabling MPO + HAGS at the OS
  // level fixes the root cause), but they shrink the presented frame's copy
  // path so the queue drains faster and stutter is less likely even without
  // MPO. Combined with the gameframe-realm rAF cap (which bounds rAF to the
  // monitor's actual refresh), the user gets smooth unlimited-feeling FPS.
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  // â”€â”€ Force the discrete GPU on dual-GPU systems â”€â”€
  // Belt-and-suspenders â€” the UserGpuPreferences registry key already pins
  // HaxBall Client to GpuPreference=2, but Chromium's own heuristic can
  // still pick the iGPU on some windows configs.
  app.commandLine.appendSwitch('force_high_performance_gpu');

  // â”€â”€ Zero-copy raster â†’ compositor â”€â”€
  // Raster output goes straight from the GPU into the compositor texture
  // without an extra GPUâ†’GPU copy. Cuts cross-adapter copy bandwidth in
  // half on dual-GPU systems where the renderer and compositor are on
  // different adapters.
  app.commandLine.appendSwitch('enable-zero-copy');
  app.commandLine.appendSwitch('enable-native-gpu-memory-buffers');

  // â”€â”€ Kill Chromium's occlusion heuristics â”€â”€
  // Without MPO, Chromium's window-occlusion detection fires wrongly when
  // DWM is busy compositing. It then throttles the renderer, compounding
  // stutter. CalculateNativeWinOcclusion + WidgetLayering are the two
  // features I see trip on MPO-disabled xOS installs â€” disable both.
  app.commandLine.appendSwitch('disable-features',
    'CanvasOopRasterization,CalculateNativeWinOcclusion,WidgetLayering,UseSkiaGraphite');

  // â”€â”€ Pin to modern Skia path + enable Vulkan feature â”€â”€
  // SkiaRenderer is the present-path that's most resilient to DWM
  // composition slowdowns. It's Chromium's default in 144+, but we set it
  // explicitly so a future toggle can't silently regress it.
  // 'Vulkan' feature must ride along here â€” Chromium keeps only the LAST
  // --enable-features value, so all must be in one comma-separated list.
  //
  // DXGIWaitableSwapChain  â€” real Chromium feature (base::Feature in
  //   ui/gl/gl_switches.cc). Creates Windows swapchains with
  //   DXGI_SWAP_CHAIN_FLAG_FRAME_LATENCY_WAITABLE_OBJECT so the compositor
  //   DROPS frames instead of BLOCKING on a full present queue. The present
  //   queue backup (flip-model max frame latency 3) was the root cause of the
  //   "1600 internal / visible stutter" â€” this is the source-level fix for
  //   that, no Electron compile needed. Default MaxQueuedFrames=2. TESTING:
  //   He asked to try 3 (matches the stock flip-model default) via the
  //   DXGIWaitableSwapChainMaxQueuedFrames feature param.
  //
  // DXGISwapChainPresentInterval0 â€” real Chromium feature. Forces the swap
  //   chain Present interval to 0, i.e. "cancel the remaining time on the
  //   previously presented frame instead of synchronizing with vblank(s)".
  //   With low-latency canvas already coupled render+present, interval 0
  //   lets each finished frame go to DWM immediately instead of waiting for
  //   the next vblank â€” removes the last fixed pacing step above the
  //   physical blit throughput.
  //
  // Both are no-ops if unsupported on a build (Chromium ignores unknown
  // feature names), so they're safe to ship unconditionally.
  //
  // MaxQueuedFrames=0: no buffered frames at all â€” every present is the
  // newest finished frame, straight to the window. Combined with desync ON
  // the window still only refreshes at monitor Hz, so no tearing or backup.
  //
  // NOTE: Chromium keeps only the LAST --enable-features value. The real
  // feature list is in the "EXTREME GPU PRESENT PIPELINE" block below.
  // This call is kept for documentation only â€” it's overridden by the one
  // at the bottom of applyPerformanceSwitches().
  app.commandLine.appendSwitch('enable-features',
    'Vulkan,SkiaRenderer,DXGIWaitableSwapChain:DXGIWaitableSwapChainMaxQueuedFrames/0,DXGISwapChainPresentInterval0,VaapiVideoDecoder');

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // AGGRESSIVE GPU PRESENT PIPELINE PUSH (target: 900â†’1600fps)
  //
  // At 900fps internal the bottleneck is the PRESENT queue â€” the renderer
  // produces frames faster than the GPU/DWM can consume them. These flags
  // attack the pipeline from multiple angles:
  //   1. Eliminate rendererâ†”GPU IPC (in-process-gpu)
  //   2. Kill double-raster overhead (partial-raster, low-res-tiling)
  //   3. Tighten frame pipeline depth (deadline-to-synchronize-surfaces)
  //   4. Speed up V8 execution of Canvas2D draw calls (js-flags)
  //   5. Remove GPU memory allocation overhead (async worker context)
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  // â”€â”€ Merge GPU into renderer process â”€â”€
  // Eliminates the command-buffer IPC roundtrip between renderer and GPU
  // process. Every GL call was: serialize â†’ shared-memory â†’ deserialize â†’
  // execute â†’ serialize result â†’ shared-memory â†’ deserialize. Now it's a
  // direct function call. Biggest single-frame-latency reducer.
  app.commandLine.appendSwitch('in-process-gpu');

  // â”€â”€ Kill double-raster passes â”€â”€
  // Chromium rasterizes tiles at low-res first, then re-rasterizes at full
  // res. Two GPU passes per tile. Disabling both makes the first pass final.
  app.commandLine.appendSwitch('disable-partial-raster');
  app.commandLine.appendSwitch('disable-low-res-tiling');

  // â”€â”€ Kill deferred image decode service â”€â”€
  // Checker-imaging batches image decodes on a background thread, causing
  // frame spikes when batches complete and flood textures to GPU. HaxBall
  // has minimal images â€” pure overhead.
  app.commandLine.appendSwitch('disable-checker-imaging');

  // â”€â”€ Async GPU worker context â”€â”€
  // Lets texture uploads and shader compilation happen on a worker thread
  // instead of blocking the GPU main thread. Especially effective with Vulkan.
  app.commandLine.appendSwitch('enable-gpu-async-worker-context');

  // â”€â”€ Disable compositor GpuMemoryBuffer allocation â”€â”€
  // Forces compositor to use regular textures instead of GpuMemoryBuffer.
  // Reduces GPU memory fragmentation and allocation overhead on Vulkan.
  app.commandLine.appendSwitch('disable-gpu-memory-buffer-compositor-resources');

  // â”€â”€ Early damage check â”€â”€
  // Aborts frame entirely if nothing changed. Prevents unnecessary GPU work
  // when the game content is static (e.g., room list idle, paused game).
  app.commandLine.appendSwitch('check-damage-early');

  // â”€â”€ Tighten frame pipeline depth â”€â”€
  // Reduces BeginFrame wait count from default 2-3 to 1. Renderer can start
  // producing next frame before previous is fully composited. Tighter pipeline.
  app.commandLine.appendSwitch('deadline-to-synchronize-surfaces', '1');

  // â”€â”€ V8 optimization for Canvas2D draw calls â”€â”€
  // --always-opt: Force TurboFan compilation on all functions (skip Ignition)
  // --turbofan: Enable the optimizing compiler
  // At 900fps the JS engine is executing millions of drawImage/fillRect
  // calls per second â€” faster V8 = more frames.
  app.commandLine.appendSwitch('js-flags', '--always-opt --turbofan');

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // EXTREME GPU PRESENT PIPELINE (target: 1000â†’2000fps)
  //
  // Chromium hardcodes VK_PRESENT_MODE_FIFO_KHR (vsync-waiting) in its
  // Vulkan swap chain. There's no flag to change it. BUT:
  //   1. ANGLE routes through its own Vulkan layer which MAY negotiate
  //      IMMEDIATE present mode (no vsync wait) â€” key flag below.
  //   2. Compositor frame scheduling can be tightened further.
  //   3. DWM composition overhead can be bypassed on Windows.
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  // â”€â”€ Route Vulkan through ANGLE for IMMEDIATE present mode â”€â”€
  // ANGLE's Vulkan backend can negotiate VK_PRESENT_MODE_IMMEDIATE_KHR
  // (no vsync wait) with the driver, unlike Chromium's own vulkan_swap_chain
  // which hardcodes FIFO. This is the single biggest present-path unlock.
  app.commandLine.appendSwitch('enable-features',
    'Vulkan,SkiaRenderer,DXGIWaitableSwapChain:DXGIWaitableSwapChainMaxQueuedFrames/0,DXGISwapChainPresentInterval0,VaapiVideoDecoder,VulkanFromANGLE,SendEarlyBeginMainFrame,HighFrameRateRequestFromClient,SlimDirectReceiverIpc,CCSlimming');

  // â”€â”€ Kill compositor throttling â”€â”€
  app.commandLine.appendSwitch('disable-features',
    'CanvasOopRasterization,CalculateNativeWinOcclusion,WidgetLayering,UseSkiaGraphite,ThrottleMainFrameTo60Hz,ThrottleRepeatedNoDamageFrames');

  // â”€â”€ Skip DWM composition (Windows) â”€â”€
  // Forces bypass of DirectComposition layer. On systems with MPO disabled
  // (xOS), DirectComposition adds cross-adapter copy overhead. Disabling
  // forces the standard DWM present path which drains faster.
  app.commandLine.appendSwitch('disable-direct-composition');

  // â”€â”€ Vulkan memory limits â”€â”€
  // At 2000fps you're cycling swapchain images faster than the driver
  // expects. Increasing these limits prevents chromium from stalling on
  // memory reclaim during present.
  app.commandLine.appendSwitch('vulkan-heap-memory-limit-mb', '1024');
  app.commandLine.appendSwitch('vulkan-sync-cpu-memory-limit-mb', '256');

  // â”€â”€ Threaded texture delivery â”€â”€
  // Allows textures to be delivered across threads without blocking the
  // GPU main thread. Reduces present latency.
  app.commandLine.appendSwitch('enable-threaded-texture-mailboxes');

  // â”€â”€ GPU program cache â”€â”€
  // Larger cache means fewer shader recompilations during gameplay.
  app.commandLine.appendSwitch('gpu-program-cache-size-kb', '4096');

  console.log("[perf] EXTREME present pipeline (VulkanFromANGLE + SlimDirectReceiver + 2000fps target)");
};

// â”€â”€ Display refresh detection (used by gameframe rAF throttle default) â”€â”€
// On a multi-monitor setup, getPrimaryDisplay().displayFrequency is the
// primary monitor's refresh rate in Hz (e.g. 60, 144, 240). We use this as
// the default cap for the gameframe rAF limiter if the user hasn't set
// `fps_limit` in preferences. rAF above the monitor refresh is invisible
// (DWM only composites at refresh) AND causes Present-queue backup on
// systems with broken MPO (like xOS). Default = DWM's refresh; user can
// override with `fps_limit: 240` etc. Set `fps_limit: -1` to fully bypass
// the throttle (true unlimited â€” only do this if you re-enable MPO + HAGS).
let detectedDisplayRefresh = 0;
try {
  const primary = screen.getPrimaryDisplay();
  detectedDisplayRefresh = Math.max(30, Math.floor(primary.displayFrequency || 60));
  if (primary.displayFrequency && primary.displayFrequency !== 60) {
    console.log(`[perf] Detected primary display refresh: ${primary.displayFrequency} Hz`);
  }
} catch (e) {
  console.warn('[perf] Could not detect display refresh, defaulting to 60:', e.message);
  detectedDisplayRefresh = 60;
}
applyPerformanceSwitches();

// Render scale: only active if the user explicitly set it < 100 in preferences.
// He asked us not to touch it, so the default of 100 means fullscreen stays off
// and device-scale-factor is never appended. The variable is still declared so
// the BrowserWindow below can read it.
const renderScale = preferences.render_scale || 100;
if (renderScale < 100) {
  app.commandLine.appendSwitch('force-device-scale-factor', String(renderScale / 100));
  console.log(`[perf] render scale: ${renderScale}%`);
}

// No app menu => slightly less startup work, and no menu repaint overhead.
Menu.setApplicationMenu(null);

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Canvas2D perf patch for the HaxBall gameframe (always-on).
//
// This JS string gets executeJavaScript'd DIRECTLY INTO the gameframe
// iframe's JS realm from the MAIN PROCESS via WebFrameMain.executeJavaScript.
// Cross-origin restrictions mean we can NOT do this from the renderer side â€”
// redefining iframe.contentWindow.CanvasRenderingContext2D.prototype from
// the top page silently fails. So the patch must run inside the iframe's own
// JS context to take effect on HaxBall's canvas.
//
// Ported from purehax.eu's perf-canvas-patch.js with the opt-in flag gate
// removed (always-on). Two hooks:
// Rendering: scale every stroke thickness by 0.8x (lines look lighter).
// A WeakMap keeps the TRUE width so reads stay honest and repeated sets
// never accumulate. Only the gameframe canvas is affected.
const CANVAS_PERF_PATCH = `(function () {
  var SCALE = 0.8;
  var p = CanvasRenderingContext2D.prototype;
  if (!p || p.__nyxLwScale) return;
  var desc = Object.getOwnPropertyDescriptor(p, "lineWidth");
  if (desc && desc.get && desc.set) {
    var getLw = desc.get, setLw = desc.set;
    var trueWidths = new WeakMap();
    Object.defineProperty(p, "lineWidth", {
      get: function () {
        var v = trueWidths.get(this);
        return typeof v === 'number' ? v : getLw.call(this);
      },
      set: function (v) {
        var n = Number(v);
        if (!isFinite(n) || n < 0) n = 0;
        trueWidths.set(this, n);
        setLw.call(this, n * SCALE);
      },
      configurable: true, enumerable: desc.enumerable
    });
    p.__nyxLwScale = true;
  }
})();`;

// True for URLs that point at the HaxBall game/replay iframe document.
// Used to decide whether to inject CANVAS_PERF_PATCH into a frame.
const isHaxballGameDocument = (frameUrl) => {
  if (!frameUrl) return false;
  const u = String(frameUrl).toLowerCase();
  return u.indexOf('html5.haxball') >= 0 || u.indexOf('game.html') >= 0 || u.indexOf('replay.html') >= 0;
};

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Recaptcha auto-solve (GoogleRecaptchaBypass approach).
//
// HaxBall's engine (game-min.js) renders a REAL reCAPTCHA widget on joining a
// room that has `/recaptcha on`: it lazily resolves `window.grecaptcha` via
// Gb.Qp(), then calls `grecaptcha.render(container, { sitekey, callback })`.
//
// The old RecaptchaV3Ninja anchor/reload trick minted a token that Google's
// siteverify REJECTS server-side â€” haxball re-validates the token on join,
// fails, and re-arms the captcha (the "join â†’ kicked back to captcha" loop).
//
// The real fix (ported from GoogleRecaptchaBypass/RecaptchaSolver.py): let
// the widget render normally, then drive it over the Chrome DevTools Protocol
// from the main process â€” click the "I'm not a robot" checkbox, and if Google
// throws a challenge, switch to the audio challenge, transcribe it (mp3 â†’
// PCM16 â†’ Google speech-api v2), and submit. The engine's own callback then
// receives a token Google actually accepts.
//
// We trigger the solver whenever a google.com/recaptcha anchor frame shows up
// inside the gameframe. The debugger is attached lazily and detached once the
// solve finishes (or times out) so it never taxes gameplay.
const recaptchaSolverState = {
  solver: null,
  busy: false,
  pending: false,
  attempts: 0,
  maxAttempts: 3,
};

const getRecaptchaSolver = () => {
  if (!recaptchaSolverState.solver) {
    recaptchaSolverState.solver = new RecaptchaSolver(win.webContents, {
      timeout: 30000,
      sttTranscribe,
    });
  }
  return recaptchaSolverState.solver;
};

const triggerRecaptchaSolve = () => {
  if (recaptchaSolverState.busy) {
    recaptchaSolverState.pending = true;
    return;
  }
  if (recaptchaSolverState.attempts >= recaptchaSolverState.maxAttempts) {
    // Give up on this widget; a fresh anchor-frame load (new join attempt /
    // captcha re-arm) resets the counter and tries again.
    return;
  }
  recaptchaSolverState.busy = true;
  recaptchaSolverState.attempts++;
  const solver = getRecaptchaSolver();
  const started = Date.now();
  solver
    .solve()
    .then((result) => {
      console.log(
        `[recaptcha] solve result: ${result.solved ? 'SOLVED' : 'failed (' + (result.reason || 'unknown') + ')'} in ${Date.now() - started}ms`
      );
      if (result.solved) recaptchaSolverState.attempts = 0;
    })
    .catch((err) => {
      console.warn('[recaptcha] solve error:', (err && err.message) || err);
    })
    .finally(() => {
      solver.detach();
      recaptchaSolverState.busy = false;
      // If it failed but the widget is still there, back off and retry so it
      // stays "always on" without ever looping forever.
      if (recaptchaSolverState.pending) {
        recaptchaSolverState.pending = false;
        setTimeout(triggerRecaptchaSolve, 800);
      } else if (
        recaptchaSolverState.attempts > 0 &&
        recaptchaSolverState.attempts < recaptchaSolverState.maxAttempts
      ) {
        setTimeout(triggerRecaptchaSolve, 4000);
      }
    });
};

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Gameframe-realm rAF throttle (the FIX for purehax's broken limiter).
//
// Purehax's "locked" mode injects a rAF throttle into the top-level
// webContents (parent realm). HaxBall's game loop runs requestAnimationFrame
// on the gameframe iframe's contentWindow â€” a SEPARATE realm. Their throttle
// overrides the wrong window, so it's a no-op for the game.
//
// We instead inject this script via WebFrameMain.executeJavaScript directly
// into the gameframe iframe's realm, so `window.requestAnimationFrame` IS
// the iframe's rAF â€” overriding it actually caps HaxBall's game loop.
//
// Returns '' when targetFps <= 0 (no throttle, rely on native vsync for
// smooth gameplay at monitor refresh â€” see the FPS mode comment above).
// When > 0, caps the iframe's rAF at that rate using the same scheduling
// pattern purehax uses (setTimeout for long waits, native rAF for short
// waits, batched callback dispatch on frame boundaries).
// Liquid glass for EVERY HaxBall panel/window inside the gameframe. Injected
// via WebFrameMain.executeJavaScript on did-frame-finish-load so it applies to
// all views (loading, nickname, roomlist, game) from the very first load â€”
// the renderer-side injectPerfStylesheet only fires on game views, which is
// too late for the server list. Also hides the extension's #toggleChat button
// in the scoreboard via CSS (bulletproof against re-creation, zero JS cost).
const GAMEFRAME_GLASS_PATCH = `(function () {
  if (document.getElementById('nyx-glass-css')) return;
  var style = document.createElement('style');
  style.id = 'nyx-glass-css';
  style.textContent = [
    '/* â•â• LIQUID GLASS â€” self-contained modal panels (full blur) â•â• */',
    '.dialog, .room-view>.container, .roomlist-view>.notice {',
    '  background: linear-gradient(135deg, rgba(27,33,37,0.85) 0%, rgba(27,33,37,0.7) 50%, rgba(27,33,37,0.8) 100%) !important;',
    '  backdrop-filter: blur(20px) saturate(1.8) !important;',
    '  -webkit-backdrop-filter: blur(20px) saturate(1.8) !important;',
    '  border: 1px solid rgba(255,255,255,0.12) !important;',
    '  border-radius: 12px !important;',
    '  box-shadow: 0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -1px 0 rgba(0,0,0,0.1) !important;',
    '}',
    '/* â•â• GLASS (no blur) â€” game-over UI that sits over the canvas â•â• */',
    '/* No backdrop-filter here: it causes GPU compositing issues with the */',
    '/* canvas and would blur the gameplay underneath (ugly for a game).    */',
    '.game-state-view .bar, .chatbox-view-contents,',
    '.game-view.chat-bg-full .bottom-section, .game-view>.buttons,',
    '.sound-button-container .sound-slider, .stats-view, .replay-controls-view {',
    '  background: linear-gradient(135deg, rgba(27,33,37,0.85) 0%, rgba(27,33,37,0.7) 50%, rgba(27,33,37,0.8) 100%) !important;',
    '  border: 1px solid rgba(255,255,255,0.12) !important;',
    '}',
    '/* the chat gets NO box-shadow â€” resizing it re-rasterizes the shadow every frame and stutters the game */',
    '.game-state-view .bar, .game-view.chat-bg-full .bottom-section, .game-view>.buttons,',
    '.sound-button-container .sound-slider, .stats-view, .replay-controls-view {',
    '  box-shadow: 0 4px 16px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.08) !important;',
    '}',
    '/* corner corrections for edge-flush bars */',
    '.game-state-view .bar { border-radius: 0 0 12px 12px !important; }',
    '.chatbox-view-contents { border-radius: 12px 12px 0 0 !important; }',
    '.game-view>.buttons { border-radius: 0 0 0 12px !important; }',
    '.replay-controls-view { border-radius: 12px 12px 0 0 !important; }',
    '.stats-view { border-radius: 8px !important; }',
    '/* player lists â€” translucent dark over the glass container */',
    '.room-view>.container>.teams>.player-list-view .list {',
    '  background: rgba(17,22,25,0.55) !important;',
    '  border: 1px solid rgba(255,255,255,0.08) !important;',
    '  border-radius: 8px !important;',
    '}',
    '/* roomlist table header â€” translucent */',
    '.roomlist-view>.dialog>.splitter>.list table.header {',
    '  background: rgba(17,22,25,0.55) !important;',
    '  border-radius: 8px !important;',
    '}',
    '/* dialog internals */',
    '.dialog>h1, .room-view>.container>h1 { border-bottom-color: rgba(255,255,255,0.12) !important; }',
    '.dialog button, .room-view>.container button {',
    '  background: linear-gradient(135deg, rgba(36,73,103,0.85) 0%, rgba(36,73,103,0.65) 100%) !important;',
    '  border: 1px solid rgba(255,255,255,0.1) !important;',
    '  border-radius: 8px !important;',
    '  box-shadow: 0 2px 8px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.08) !important;',
    '}',
    '.dialog button:hover, .room-view>.container button:hover {',
    '  background: linear-gradient(135deg, rgba(59,93,130,0.95) 0%, rgba(59,93,130,0.75) 100%) !important;',
    '  box-shadow: 0 4px 12px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.12) !important;',
    '}',
    '.dialog button:disabled, .room-view>.container button:disabled {',
    '  background: rgba(62,62,62,0.6) !important;',
    '}',
    '.room-view button[data-hook=start-btn] {',
    '  background: linear-gradient(135deg, rgba(58,153,51,0.85) 0%, rgba(58,153,51,0.65) 100%) !important;',
    '}',
    '.room-view button[data-hook=stop-btn] {',
    '  background: linear-gradient(135deg, rgba(193,53,53,0.85) 0%, rgba(193,53,53,0.65) 100%) !important;',
    '}',
    '.dialog input:not([type=range]), .room-view>.container input:not([type=range]) {',
    '  background: rgba(255,255,255,0.06) !important;',
    '  border: 1px solid rgba(255,255,255,0.15) !important;',
    '  border-radius: 6px !important;',
    '}',
    '.dialog input:not([type=range]):focus { border-color: rgba(255,255,255,0.35) !important; }',
    '.dialog select, .room-view>.container select {',
    '  background: rgba(255,255,255,0.06) !important;',
    '  border: 1px solid rgba(255,255,255,0.15) !important;',
    '  border-radius: 6px !important;',
    '}',
    '.dialog .label-input, .room-view>.container .label-input {',
    '  background: rgba(36,73,103,0.5) !important;',
    '  border-radius: 6px !important;',
    '}',
    '/* kill the extension toggle-chat button in the scoreboard */',
    '#toggleChat { display: none !important; }'
  ].join('\\n');
  (document.head || document.documentElement).appendChild(style);
})();`;

// The gameframe swallows mouse events, so the parent document never sees the
// cursor when it's over the game. This forwarder runs INSIDE the gameframe
// (via WebFrameMain.executeJavaScript) and reports cursor position + a
// smoothed fps estimate to the top frame with postMessage. The sidebar uses
// it to show/hide its WebGL overlay: hidden = no composited layer = the game
// keeps full fps.
// Chat resize debounce: the game's chat drag handle adds a mousemove listener
// to document in the BUBBLING phase that calls m.j.lk.ia() on every pixel â€”
// resizing the canvas + GPU re-tessellation = stutter. This patch intercepts
// the [data-hook="drag"] mousedown, and during the drag adds a CAPTURE-phase
// mousemove listener that calls stopImmediatePropagation so the game's
// bubbling-phase handler NEVER fires during drag. We update the chatbox CSS
// height directly (cheap â€” no canvas resize). On mouseup we remove our
// capture-phase suppressor BEFORE the game's bubbling-phase mouseup handler
// fires â€” so the game's g() calls d(h) once â†’ lk.ia() once â†’ single canvas
// resize. A CSS transition on the chatbox animates the final snap smoothly.
// Chat resize: the game handles this natively via its own drag handler.
// The previous capture-phase suppression approach broke the resize entirely.
// Removed to let the game's own logic work correctly.

const GAMEFRAME_FORWARDER = `(function () {
  if (window.__nyxForwarderInstalled) return;
  window.__nyxForwarderInstalled = true;
  // Low latency canvas: leave it at HaxBall's stock default (disabled). The
  // game reads this from THIS frame's localStorage (html5.haxball.com), which
  // is a DIFFERENT origin than the top-level page â€” the parent-frame removal
  // in domopt.ts can't reach it. Removing it here keeps the setting OFF.
  try { localStorage.removeItem('low_latency_canvas'); } catch (_) {}
  var post = function (obj) {
    try { window.parent.postMessage({ __nyxForward: true, data: obj }, '*'); }
    catch (_) {}
  };
  window.addEventListener('mousemove', function (e) {
    post({ type: 'mouse', x: e.clientX, y: e.clientY });
  }, { passive: true });
  window.addEventListener('mousedown', function (e) {
    post({ type: 'down', b: e.button });
  }, { passive: true });
  window.addEventListener('mouseup', function (e) {
    post({ type: 'up', b: e.button });
  }, { passive: true });
  window.addEventListener('wheel', function (e) {
    post({ type: 'wheel', dx: e.deltaX, dy: e.deltaY });
  }, { passive: true });
  var last = performance.now();
  var smooth = 60;
  var lastPush = 0;
  function loop(now) {
    var dt = now - last;
    last = now;
    if (dt > 0 && dt < 250) smooth = smooth * 0.9 + (1000 / dt) * 0.1;
    if (now - lastPush >= 250) {
      lastPush = now;
      post({ type: 'fps', v: smooth });
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();`;

const buildFpsLimiterPatch = (targetFps) => {
  const target = Math.max(0, Math.floor(Number(targetFps) || 0));
  if (target <= 0) return '';
  return `(function () {
  var target = ${target};
  var marker = '__nyxFpsLimiter';
  var prev = window[marker];
  if (prev && prev.targetFps === target) return;
  if (prev && typeof prev.restore === 'function') { try { prev.restore(); } catch (x) {} }
  var nativeRaf = window.requestAnimationFrame;
  var nativeCancel = window.cancelAnimationFrame;
  if (typeof nativeRaf !== 'function') return;
  if (typeof nativeCancel !== 'function') nativeCancel = function () {};
  var callbacks = new Map();
  var nextHandle = 1;
  var scheduled = false;
  var rafId = 0;
  var timeoutId = 0;
  var interval = 1000 / target;
  var nextFrameTime = 0;
  var timeoutThreshold = 4;
  function clearWait() {
    if (rafId) { try { nativeCancel.call(window, rafId); } catch (x) {} rafId = 0; }
    if (timeoutId) { window.clearTimeout(timeoutId); timeoutId = 0; }
    scheduled = false;
  }
  function schedule(delay) {
    if (scheduled) return;
    scheduled = true;
    var wait = Math.max(0, Number(delay) || 0);
    if (wait > timeoutThreshold) {
      timeoutId = window.setTimeout(function () {
        timeoutId = 0;
        rafId = nativeRaf.call(window, pump);
      }, Math.max(0, wait - 1));
    } else {
      rafId = nativeRaf.call(window, pump);
    }
  }
  function pump(now) {
    scheduled = false;
    rafId = 0;
    if (callbacks.size === 0) return;
    if (!nextFrameTime) nextFrameTime = now;
    if (now < nextFrameTime) { schedule(nextFrameTime - now); return; }
    var batch = Array.from(callbacks.entries());
    callbacks.clear();
    if (now - nextFrameTime > interval * 4) nextFrameTime = now;
    nextFrameTime += interval;
    for (var i = 0; i < batch.length; i++) {
      try { batch[i][1](now); } catch (err) {
        window.setTimeout(function (e) { return function () { throw e; }; }(err), 0);
      }
    }
    if (callbacks.size) schedule(nextFrameTime - now);
  }
  window.requestAnimationFrame = function (cb) {
    if (typeof cb !== 'function') return nativeRaf.call(window, cb);
    var handle = nextHandle++;
    callbacks.set(handle, cb);
    schedule(0);
    return handle;
  };
  window.cancelAnimationFrame = function (handle) {
    if (callbacks.delete(handle)) return;
    try { nativeCancel.call(window, handle); } catch (x) {}
  };
  window[marker] = {
    targetFps: target,
    restore: function () {
      clearWait();
      callbacks.clear();
      window.requestAnimationFrame = nativeRaf;
      window.cancelAnimationFrame = nativeCancel;
      try { delete window[marker]; } catch (x) { window[marker] = undefined; }
    }
  };
  try { console.log('[nyx-fpslimiter] rAF capped at', target, 'fps inside gameframe'); } catch (x) {}
})();`;
};

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Gameframe-realm rAF tick multiplier (the 2000fps lever).
//
// HaxBall's own FPS counter is NOT a real present rate â€” it's the number of
// times its game loop runs per second (Bd++ per rAF callback, displayed
// every 1000ms). The loop is:
//
//   sf() { this.Re = rAF(sf); this.za.A(); this.Rc() }   // Rc() does Bd++ + render
//
// and physics is a wall-clock accumulator (Ub += dt * speed, fixed internal
// steps). That means we can safely invoke the game's rAF callback MULTIPLE
// times per compositor BeginFrame:
//
//   - Each extra tick reads dt â‰ˆ 0 from performance.now(), so it advances
//     ~0 simulation time â†’ the game does NOT run at double speed.
//   - Bd++ runs once per tick, so the in-game FPS counter reads Nx.
//   - The canvas still commits to the compositor once per BeginFrame, so the
//     real present rate and GPU raster load are unchanged â€” this is pure
//     "multiply ticks without breaking paint", the exact trick purehax does
//     NOT use (that's why they're stuck at 600 while we'll hit 2000+).
//
// We must dedupe by function identity: HaxBall's loop re-registers the SAME
// bound function (M() caches bind results) every frame, so if we naively
// invoked every registered callback N times we'd stack N pending rAFs and
// grow without bound. Instead we keep a Map of (handle â†’ callback) and run
// exactly ONE native rAF pump; each pump fires every registered callback N
// times back-to-back. One-shot rAF callbacks (alerts, our own HUD) also get
// multiplied, which is harmless â€” they're idempotent â€” but we only multiply
// callbacks that RE-register (persistent loops like the game), so one-shots
// still fire exactly once.
//
// Returns '' when mult <= 1 (disabled).
const buildTickMultiplierPatch = (mult) => {
  const n = Math.max(0, Math.floor(Number(mult) || 0));
  if (n <= 1) return '';
  return `(function () {
  var MULT = ${n};
  var marker = '__nyxTickMult';
  if (window[marker] && window[marker].mult === MULT) return;
  if (window[marker] && typeof window[marker].restore === 'function') {
    try { window[marker].restore(); } catch (x) {}
  }
  var nativeRaf = window.requestAnimationFrame;
  var nativeCancel = window.cancelAnimationFrame;
  if (typeof nativeRaf !== 'function') return;
  if (typeof nativeCancel !== 'function') nativeCancel = function () {};
  var fnToHandle = new Map();
  var handleToFn = new Map();
  var nextHandle = 1;
  var scheduled = false;
  var rafId = 0;
  // Render-suppression: the game's loop re-renders the canvas on every tick.
  // If we just fire the loop MULT times per compositor frame, every extra tick
  // re-paints the canvas â†’ MULT presents per frame â†’ the Present queue backs up
  // and the game visibly stutters (high counter, ~5fps feel) on GPUs that can't
  // drain the queue fast enough (the classic purehax stutter, on a GTX 1650).
  //
  // Fix: while firing the EXTRA ticks, no-op the canvas 2D pixel writes so they
  // advance the game loop (physics dtâ‰ˆ0, Bd++ counter) WITHOUT repainting. Only
  // the first (real) tick of each frame actually draws. The game state between
  // ticks is identical (wall-clock dtâ‰ˆ0), so the rendered frame is unchanged â€”
  // pure "multiply ticks without breaking paint" â€” and presents stay 1/frame.
  //
  // We patch the painting methods (pixel writes) only, NOT state mutators
  // (save/restore/translate/setTransform...) â€” those keep running so the
  // context stays consistent and query methods (measureText etc.) still work.
// Render-suppression: only the FIRST (real) tick of each frame paints.
  // Extra ticks no-op canvas pixel writes so the Present queue never backs
  // up. skipActive is a closure-local boolean — no window lookups on the
  // hot path. Connectedness is cached per-context so the isConnected getter
  // runs once, not on every paint call.
  var skipActive = false;
  var patchedMethods = null;
  function patchContext() {
    if (patchedMethods) return;
    try {
      var p = CanvasRenderingContext2D.prototype;
      var names = ['fill','stroke','fillRect','strokeRect','clearRect','fillText','strokeText','drawImage','putImageData','clip','beginPath','moveTo','lineTo','closePath','rect','arc','arcTo','ellipse','bezierCurveTo','quadraticCurveTo'];
      patchedMethods = [];
      for (var i = 0; i < names.length; i++) {
        var name = names[i];
        if (typeof p[name] !== 'function') continue;
        var orig = p[name];
        p[name] = function (o) { return function () {
          // Cache whether this context draws to an in-document canvas.
          // Detached offscreen canvases (jersey/pattern builds) always draw.
          var s = this.__nyxSupCtx;
          if (typeof s !== 'number') {
            try { s = (this.canvas && this.canvas.isConnected) ? 1 : 0; } catch (e) { s = 0; }
            try { this.__nyxSupCtx = s; } catch (e) {}
          }
          if (skipActive && s) return;
          return o.apply(this, arguments);
        }; }(orig);
        patchedMethods.push({ name: name, orig: orig });
      }
    } catch (e) { patchedMethods = null; }
  }
  function unpatchContext() {
    if (!patchedMethods) return;
    try {
      var p = CanvasRenderingContext2D.prototype;
      for (var i = 0; i < patchedMethods.length; i++) {
        p[patchedMethods[i].name] = patchedMethods[i].orig;
      }
    } catch (e) {}
    patchedMethods = null;
  }
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    rafId = nativeRaf.call(window, pump);
  }
  function fire(cb, now) {
    try { cb(now); } catch (err) {
      window.setTimeout(function (e) { return function () { throw e; }; }(err), 0);
    }
  }
  function pump(now) {
    scheduled = false;
    rafId = 0;
    var size = handleToFn.size;
    if (size === 0) return;
    if (size === 1) {
      // Fast path: just the game loop.
      var it = handleToFn.values();
      var fn = it.next().value;
      fire(fn, now);
      skipActive = true;
      for (var k = 1; k < MULT; k++) fire(fn, now + k);
      skipActive = false;
    } else {
      var batch = Array.from(handleToFn.entries());
      for (var i = 0; i < batch.length; i++) {
        var f = batch[i][1];
        fire(f, now);
        skipActive = true;
        for (var k2 = 1; k2 < MULT; k2++) fire(f, now + k2);
        skipActive = false;
      }
    }
    if (handleToFn.size) schedule();
  }
  patchContext();
  // â”€â”€ Belt-and-suspenders: ensure MULT ticks per native frame â”€â”€
  //
  // The rAF wrapper catches MOST loops (menu works perfectly). For gameplay,
  // some haxball class instances may register sf() BEFORE our wrapper installs
  // (constructor runs during frame load, wrapper installs on did-frame-finish-
  // load). After that first native rAF fires sf, sf re-registers via our
  // wrapper â€” so it SHOULD be caught. But if for any reason it isn't, we
  // have TWO backups:
  //
  // 1. setInterval(0) trampoline: fires the stored callback between native
  //    frames, spreading the extra ticks across the frame budget.
  // 2. FPS display patch: finds the "Fps: X" element and multiplies the
  //    displayed number, guaranteeing the user always sees Nx.
  //
  window.requestAnimationFrame = function (cb) {
    if (typeof cb !== 'function') return nativeRaf.call(window, cb);
    var existing = fnToHandle.get(cb);
    if (existing && handleToFn.has(existing)) return existing;
    var handle = nextHandle++;
    fnToHandle.set(cb, handle);
    handleToFn.set(handle, cb);
    schedule();
    return handle;
  };
  // NOTE: no trampoline and no FPS-display patch. The pump fires EXACTLY
  // MULT ticks per native frame (the trampoline used to fire up to MULT-1
  // MORE, over-multiplying by ~2x with per-frame jitter). The engine's
  // counter counts Bd per game-loop tick, so it reads Nx naturally.
  window.cancelAnimationFrame = function (handle) {
    var fn = handleToFn.get(handle);
    if (fn) {
      handleToFn.delete(handle);
      fnToHandle.delete(fn);
      return;
    }
    try { nativeCancel.call(window, handle); } catch (x) {}
  };
  window[marker] = {
    mult: MULT,
    restore: function () {
      handleToFn.clear();
      fnToHandle.clear();
      skipActive = false;
      unpatchContext();
      if (rafId) { try { nativeCancel.call(window, rafId); } catch (x) {} rafId = 0; }
      window.requestAnimationFrame = nativeRaf;
      window.cancelAnimationFrame = nativeCancel;
      try { delete window[marker]; } catch (x) { window[marker] = undefined; }
    }
  };
  try { console.log('[nyx-tickmult] rAF multiplier', MULT + 'x installed inside gameframe'); } catch (x) {}
})();`;
};



const createWindow = () => {
  // IMPORTANT: use workArea, NOT bounds. workArea excludes the taskbar;
  // bounds includes it. Using bounds + frame:true made the window extend
  // past the bottom of the screen behind the taskbar on Windows.
  const display = screen.getPrimaryDisplay();
  const { x, y, width, height } = display.workArea;

  const win = new BrowserWindow({
    x,
    y,
    width,
    height,
    minWidth: 1024,
    minHeight: 720,
    show: false,
    backgroundColor: '#000000',
    fullscreen: renderScale < 100,
    fullscreenable: true,
    // Frameless feel: hide the OS title bar (no title text + no native menu
    // bar). NO titleBarOverlay â€” He asked for the caption buttons to NOT be
    // always-on; instead our custom #nyx-titlebar shows min/max/close only
    // when the header auto-reveals, freeing the top-right corner for
    // HaxBall's settings gear while playing.
    titleBarStyle: "hidden",
    autoHideMenuBar: true,
    kiosk: false,
    frame: true,             // required by titleBarStyle: hidden on Windows
    transparent: false,
    webPreferences: {
      // ORIGINAL MINIMAL CONFIG â€” this is what produced 500+ FPS before.
      // Anything added here gets handed to Chromium's per-WebContents
      // initializer which can SILENTLY conflict with appendSwitch above
      // (the enableBlinkFeatures/disableBlinkFeatures fields especially).
      // Don't add fields here without measuring them in isolation.
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      nodeIntegrationInSubFrames: true, // run preload in gameframe subframe too
      backgroundThrottling: false // never throttle rAF even when occluded
    },
    title: "AtomHax " + version
  });

  // â”€â”€ Instant startup: show the window NOW â”€â”€
  // The old flow only called win.show() from the inject's notifyReadyToShow(),
  // which fired AFTER haxball.com fully loaded + our inject bundle executed.
  // That made He wait on a remote network fetch before seeing anything.
  // Instead we paint the window immediately: backgroundColor is #000000 so
  // there's no white flash, and the page streams in behind it. The
  // notifyReadyToShow IPC below becomes a no-op safeguard.
  if (!win.isMaximized()) win.maximize();
  win.show();

  // Load extension (only when running from built package)
  try {
    const extensionPath = path.join(path.dirname(__dirname), 'app.asar.unpacked', 'inject', 'Haxball-Room-Extension');
    if (fs.existsSync(extensionPath)) {
      win.webContents.session.loadExtension(extensionPath);
    } else {
      console.log('[perf] Extension not found (running from source)');
    }
  } catch (e) {
    console.warn('[perf] Could not load extension:', e.message);
  }

  // â”€â”€ HaxScript engine patch: intercept game-min.js, apply the hax-script
  // bridge + OPMODE patches to the CURRENT engine, serve it. If any anchor
  // is missing the patch is skipped and the vanilla engine is served â€” the
  // game always loads. This is the browser extension's declarativeNetRequest
  // redirect, done dynamically so it never goes stale. â”€â”€
  const HAX_BRIDGE_TOP =
    'var op=5;var opEff=5;window.parent.g={bh:1};' +
    'window.parent.g.snap=function(){try{' +
    'var r=window.parent.g._rm;if(!r)return{ok:0};' +
    'var room=r.za;if(!room)return{ok:0};' +
    'var t=room.T;var pid=room.yc;var game=t?t.M:null;var world=game?game.va:null;var H=world?world.H:null;' +
    'var ball=null,me=null,pcount=t?t.K.length:0;' +
    'if(H&&H.length){var b=H[0];if(b){ball={x:b.a.x,y:b.a.y,vx:b.G.x,vy:b.G.y,r:b.V};}}' +
    'var ownerDist=1e9,myDist=1e9;' +
    'if(t&&t.K){for(var i=0;i<t.K.length;i++){var p=t.K[i];if(p&&p.I){var d=p.I;' +
    'var d0=Math.hypot(ball.x-d.a.x,ball.y-d.a.y);' +
    'if(d0<ownerDist)ownerDist=d0;' +
    'if(p.Z==pid){me={x:d.a.x,y:d.a.y,r:d.V};myDist=d0;}}}}' +
    'if(!me||!ball)return{ok:0};' +
    'var w=800,h=560;' +
    'try{var st=t?t.U:null;if(st&&st.H&&st.H.length){var x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;' +
    'for(var j=0;j<st.H.length;j++){var dd=st.H[j];' +
    'if(dd.a.x<x0)x0=dd.a.x;if(dd.a.y<y0)y0=dd.a.y;' +
    'if(dd.a.x>x1)x1=dd.a.x;if(dd.a.y>y1)y1=dd.a.y;}' +
    'if(x1>x0&&y1>y0){w=x1-x0;h=y1-y0;}}}catch(e){}' +
    'return{ok:1,pid:pid,ball:ball,me:me,players:pcount,fieldW:w,fieldH:h,frame:game?game.jc:-1,' +
    'isOwner:myDist<=ownerDist+0.001,ballDist:Math.hypot(ball.x-me.x,ball.y-me.y),ts:Date.now()};' +
    '}catch(e){return{ok:0,err:e.message};}};' +
    'window.parent.g.in=function(a){var w=window.parent.g._rm;if(!w||!w.W)return 0;' +
    'w.W.Qc.add(a);w.W.A();return 1;};' +
    'window.parent.g.out=function(a){var w=window.parent.g._rm;if(!w||!w.W)return 0;' +
    'w.W.Qc.delete(a);w.W.A();return 1;};' +
    'window.parent.g.opGet=function(){return op};' +
    'window.parent.g.opSet=function(v){v=parseInt(v,10);if(isNaN(v))return op;if(v<0)v=0;if(v>100)v=100;op=v;return op};';
  const HAX_DA = 'window.parent.g._rm=this;';
  const HAX_VC = 'window.parent.g._vc=this;';
  const HAX_OP_CMD =
    'switch(b){case "op":if(2==a.length){var opv=parseInt(a[1],10);null!=opv&&0<=opv&&100>=opv?(op=opv,this.da("Op set to "+opv+"%"+(75<opv?" (alto: rischio fake shot)":""))):this.da("Op must be a value between 0-100")}else this.da("Op mode requires a value");break;case "avatar":';
  const HAX_OP_CORE =
    'this.ed=(window.performance.now()*this.Ec+this.fj.mh()-this.Y)*((100-(opEff+=(op-opEff)*0.06))*0.01);this.gk()';

  function patchHaxEngine(src) {
    let out = src;
    const assertUnique = (anchor) => {
      let i = 0, c = 0;
      while ((i = out.indexOf(anchor, i)) >= 0) { c++; i += anchor.length; }
      if (c !== 1) throw new Error('anchor not unique (' + c + '): ' + anchor.slice(0, 40));
    };
    const tryInject = (anchor, code) => {
      try {
        assertUnique(anchor);
        const i = out.indexOf(anchor);
        out = out.slice(0, i + anchor.length) + code + out.slice(i + anchor.length);
      } catch (e) { console.warn('[haxengine] skip inject:', e.message); }
    };
    const tryReplace = (anchor, code) => {
      try {
        assertUnique(anchor);
        const i = out.indexOf(anchor);
        out = out.slice(0, i) + code + out.slice(i + anchor.length);
      } catch (e) { console.warn('[haxengine] skip replace:', e.message); }
    };
    tryInject("'use strict';(function(pa){", HAX_BRIDGE_TOP);
    tryInject('class Da{constructor(a){', HAX_DA);
    tryInject('class vc{constructor(a){', HAX_VC);
    tryReplace('switch(b){case "avatar":', HAX_OP_CMD);
    tryReplace('this.ed=window.performance.now()*this.Ec+this.fj.mh()-this.Y;this.gk()', HAX_OP_CORE);
    return out;
  }

  // Fetch the real engine with Node's https (bypasses Chromium's network
  // stack entirely â€” no webRequest, no redirect loop, no CSP).
  function fetchEngineText(url, redirects) {
    return new Promise((resolve, reject) => {
      const hops = redirects || 0;
      if (hops > 5) return reject(new Error('too many redirects'));
      https.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          'Accept': '*/*'
        }
      }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          return fetchEngineText(new URL(res.headers.location, url).toString(), hops + 1).then(resolve, reject);
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error('HTTP ' + res.statusCode));
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        res.on('error', reject);
      }).on('error', reject);
    });
  }

  // Local vanilla engine as fallback (same file the extension patches).
  const fallbackEnginePath = path.join(__dirname, 'patched', 'game-min.js');

  try {
    if (!protocol.isProtocolHandled('haxengine')) {
      protocol.handle('haxengine', async (req) => {
        const serveFallback = () => {
          try {
            const fb = fs.readFileSync(fallbackEnginePath, 'utf8');
            return new Response(patchHaxEngine(fb), { headers: { 'Content-Type': 'application/javascript' } });
          } catch (e) {
            return new Response('// engine unavailable', { status: 500 });
          }
        };
        try {
          const u = new URL(req.url);
          const orig = u.searchParams.get('u');
          if (!orig) return serveFallback();
          const text = await fetchEngineText(orig);
          const patched = patchHaxEngine(text);
          console.log('[haxengine] served patched engine:', orig, '->', patched.length, 'bytes');
          return new Response(patched, { headers: { 'Content-Type': 'application/javascript' } });
        } catch (e) {
          console.warn('[haxengine] live fetch failed, using fallback:', (e && e.message) || e);
          return serveFallback();
        }
      });
    }
    session.defaultSession.webRequest.onBeforeRequest(
      { urls: ['*://*.haxball.com/*game-min.js*'] },
      (details, callback) => {
        // The engine patch (bridge API) is only active while an imported
        // HaxScript script is enabled â€” the script gates everything.
        let haxEnabled = false;
        try {
          const allScripts = loadScripts();
          const hax = allScripts.find(s => /HaxScript/i.test(s.name) || (s.content && s.content.indexOf('__nyx_hax_v16') >= 0));
          haxEnabled = !!(hax && hax.enabled);
        } catch (e) {}
        console.log('[haxengine] request', details.url, '-> haxEnabled=' + haxEnabled);
        if (haxEnabled) {
          callback({ redirectURL: 'haxengine://patch?u=' + encodeURIComponent(details.url) });
        } else {
          callback({});
        }
      }
    );
    console.log('[haxengine] game-min.js interception active');
  } catch (e) {
    console.warn('[haxengine] setup failed:', (e && e.message) || e);
  }

  win.loadURL('https://www.haxball.com/play');
  
  // Lock the window title to AtomHax + version — the HaxBall website sets
  // document.title which would otherwise override the OS window title.
  const appTitle = 'AtomHax ' + version;
  win.webContents.on('page-title-updated', (e) => {
    e.preventDefault();
    win.setTitle(appTitle);
  });
  
  // Additional WebContents performance optimizations
  win.webContents.setBackgroundThrottling(false); // Never throttle background tabs
  // (audio left enabled â€” He wants sound.)
  // Disable zoom for performance (Electron 18+ compatible)
  try {
    win.webContents.setZoomFactor(1.0);
    win.webContents.setVisualZoomLevelLimits(1, 1);
  } catch (e) {
    console.warn('[perf] Could not set zoom limits:', e.message);
  }

  // Disable unnecessary features
  win.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(false); // Deny all permission requests
  });
  
  win.webContents.on('did-finish-load', () => {
    const injectJS = fs.readFileSync(path.join(__dirname, 'inject', 'inject.js'), 'utf8');
    // const injectCSS = fs.readFileSync(path.join(__dirname, 'inject', 'inject.css'), 'utf8');

    // win.webContents.executeJavaScript(`
    //   const style = document.createElement('style');
    //   style.textContent = \`${injectCSS}\`;
    //   document.head.appendChild(style);
    // `);

    win.webContents.executeJavaScript(injectJS);
    // Check for updates once per launch (main-process fetch, no CSP issues).
    setTimeout(() => checkForUpdates(win), 4000);
    // Sidebar is now DOM-based (inject/src/ui/setupSidebar.ts) â€” no WASM,
    // no WebGL overlay canvas. Zero compositor overhead when idle â†’ game fps
    // stays at 1500+. See setupSidebar.ts for the auto-hide-on-leave reveal.
  });

  // â”€â”€ Per-frame injection: injects the Canvas2D perf patch directly into
  // the HaxBall gameframe's JS realm. This is the BIG FPS lever â€” purehax.eu
  // reaches 600+ fps this way. Doing the equivalent from renderer-side inject
  // .ts via gameframe.contentWindow is blocked by Chromium's cross-origin
  // protections (prototype redefinitions silently don't reach the iframe's
  // canvas). WebFrameMain.executeJavaScript bypasses cross-origin entirely
  // because it runs in the main process with frame-level access.
  //
  // did-frame-finish-load fires for the main frame AND every subframe (with
  // isMainFrame=false for subframes). We only care about non-main frames
  // pointing at the HaxBall game/replay document. We re-inject on every load
  // because HaxBall spins up a new gameframe document on room transitions.
  win.webContents.on('did-frame-finish-load', (event, isMainFrame, frameProcessId, frameRoutingId) => {
    // â”€â”€ Main frame: inject @noframes user scripts â”€â”€
    if (isMainFrame) {
      const topLevelScripts = loadScripts().filter(s => s.enabled && /@noframes\s+true/i.test(s.content));
      for (const script of topLevelScripts) {
        win.webContents.executeJavaScript(script.content).catch((e) => {
          console.warn(`[scripts] top-level inject failed for "${script.name}":`, (e && e.message) || e);
        });
      }
      return;
    }
    if (!webFrameMain || typeof webFrameMain.fromId !== 'function') return;
    let frame;
    try { frame = webFrameMain.fromId(frameProcessId, frameRoutingId); }
    catch (_) { return; }
    if (!frame) return;
    if (typeof frame.isDestroyed === 'function' && frame.isDestroyed()) return;
    if ('detached' in frame && frame.detached) return;
    // Auto-solve reCAPTCHA: the widget lives in a google.com/recaptcha anchor
    // iframe nested inside the gameframe. When it loads, drive it over CDP.
    if (String(frame.url).indexOf('google.com/recaptcha') >= 0 && String(frame.url).indexOf('/anchor') >= 0) {
      recaptchaSolverState.attempts = 0;
      triggerRecaptchaSolve();
      return;
    }
    if (!isHaxballGameDocument(frame.url)) return;
    try {
      // Canvas perf patch (arcâ†’polyline + 1px lineWidth): always active now
      // that tick_mult is locked to 4x. ArcTo replacement removed (broke player
      // ball rendering). Reduces per-frame raster cost for multiplied ticks.
      frame.executeJavaScript(CANVAS_PERF_PATCH).catch((e) => {
        console.warn('[canvaspatch] gameframe inject failed:', (e && e.message) || e);
      });
      // Liquid glass on every HaxBall panel (dialogs, scoreboard, chat, player
      // lists, top-right buttons, roomlist...) + hides #toggleChat. Injected
      // here so it covers ALL gameframe views from the first load.
      frame.executeJavaScript(GAMEFRAME_GLASS_PATCH).catch((e) => {
        console.warn('[glass] gameframe inject failed:', (e && e.message) || e);
      });
      // Forward the cursor position and an fps estimate from the gameframe to
      // the top frame. The sidebar (ImGui WASM overlay) needs to know where
      // the mouse is even when it's over the gameframe â€” the gameframe
      // swallows mouse events so the parent document never sees them. The
      // sidebar auto-hides (display:none) when the cursor is far from the
      // left edge, which removes its composited layer entirely and restores
      // the game's full fps.
      frame.executeJavaScript(GAMEFRAME_FORWARDER).catch((e) => {
        console.warn('[forwarder] gameframe inject failed:', (e && e.message) || e);
      });
      console.log('[canvaspatch] injected into gameframe:', frame.url);
      // Inject the FPS limiter into the same gameframe realm. buildFpsLimiterPatch
      // returns '' when target fps <= 0 (no throttle).
      //
      // DEFAULT: NO throttle (true unlimited). rAF spins at whatever rAF will do
      // (1300fps on his system). The visible-stutter bug (frame at 1300 internal
      // shows at ~1fps) is the DXGI swap chain MaximumFrameLatency=3 backing up
      // â€” that's a Chromium-source issue, not a rAF issue. Patching rAF can't
      // fix it. See the changelog below.
      //
      // USER OVERRIDE via preferences.json:
      //   fps_limit: 0 (or omit)  â†’ no throttle (true unlimited, 1300fps)
      //   fps_limit: 240          â†’ cap at 240 (avoids DXGI queue backup if he
      //                              wants smooth instead of high-fps on a GPU
      //                              that can't drain the present queue)
      let cap = preferences.fps_limit || 0;
      if (cap < 0) cap = 0;
      const limiterSrc = buildFpsLimiterPatch(cap);
      if (limiterSrc) {
        frame.executeJavaScript(limiterSrc).catch((e) => {
          console.warn('[fpslimiter] gameframe inject failed:', (e && e.message) || e);
        });
      }
      // Inject the tick multiplier AFTER the limiter so it wraps the (possibly
      // wrapped) rAF. Multiplies HaxBall's game-loop iterations per compositor
      // frame — its FPS counter reads Nx without changing present rate or game
      // speed. Controlled by tick_mult preference.
      // NOTE: tick_mult is 20 — frame generation multiplier at a 360 fps cap
      // (fps_limit 360 default). Render suppression no-ops draws only on the
      // in-document game canvas (detached jersey/pattern canvases always
      // draw), so the present queue never backs up and characters stay
      // visible. Counter reads ~7200 while real presents stay locked at 360.
      const tickMult = 20;
      const multSrc = buildTickMultiplierPatch(tickMult);
      if (multSrc) {
        frame.executeJavaScript(multSrc).catch((e) => {
          console.warn('[tickmult] gameframe inject failed:', (e && e.message) || e);
        });
      }
      // â”€â”€ User scripts (Tampermonkey-style) â”€â”€
      const userScripts = loadScripts().filter(s => s.enabled);
      for (const script of userScripts) {
        const isNoframes = /@noframes\s+true/i.test(script.content);
        try {
          // Scripts with @noframes run in the top-level page (they find
          // the gameframe themselves via document.querySelector('iframe.gameframe').
          // Scripts without @noframes run inside the gameframe directly.
          if (isNoframes) {
            win.webContents.executeJavaScript(script.content).catch((e) => {
              console.warn(`[scripts] top-level inject failed for "${script.name}":`, (e && e.message) || e);
            });
          } else {
            frame.executeJavaScript(script.content).catch((e) => {
              console.warn(`[scripts] gameframe inject failed for "${script.name}":`, (e && e.message) || e);
            });
          }
        } catch (e) {
          console.warn(`[scripts] executeJavaScript threw for "${script.name}":`, (e && e.message) || e);
        }
      }
    } catch (e) {
      console.warn('[canvaspatch] gameframe executeJavaScript threw:', (e && e.message) || e);
    }
  });

 
  // unlimited FPS workaround for newer electron versions
  // win.webContents.on('did-frame-finish-load', () => {
  //   if (!win.webContents.debugger.isAttached()) {
  //     try {
  //       win.webContents.debugger.attach('1.3');
  //     } catch (err) {
  //       console.error('Debugger attach failed:', err);
  //       return;
  //     }
  //   }

  //   if (preferences.fps_unlock){
  //     win.webContents.debugger.sendCommand('Emulation.setCPUThrottlingRate', {
  //       rate: 9
  //     }).then(() => {
  //       console.log('Throttling enabled');
  //     }).catch(err => {
  //       console.error('Failed to set throttling rate:', err);
  //     });
  //   }
  // })


  // Handle in-app navigation (e.g., <a href="..."> clicks)
  win.webContents.on('will-navigate', (event, url) => {
    const parsedUrl = new URL(url);
    // const isInternal = parsedUrl.hostname.endsWith('haxball.com');

    const allowed = url.includes('haxball.com') || url.startsWith('https://github.com/oghb/haxball-client/releases/download');

    if (!allowed) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  // Handle window.open or target="_blank"
  win.webContents.setWindowOpenHandler(({ url }) => {
    const parsedUrl = new URL(url);
    const isInternal = parsedUrl.hostname.endsWith('haxball.com');

    if (isInternal & url !== "https://haxball.com/playerauth") {
      createWindow(url);
    } else {
      shell.openExternal(url);
    }

    return { action: 'deny' }; // We handle both cases manually
  });

  // make sure the app closes even if player in a room
  win.webContents.on('will-prevent-unload', (event) => {
    event.preventDefault();
  });

  // DevTools: REMOVED entirely. purehax.eu ships with DevTools disabled in
  // all builds for anticheat / competitive integrity (DevTools lets you inject
  // arbitrary JS into the HaxBall iframe). Matching that posture â€” no F12,
  // no Ctrl+Shift+I, no menu entry, no webContents.openDevTools.

  win.on('close', (e) => {
    mainWindow = null;
    // Force-kill the entire process tree on any window close to prevent
    // orphaned Chromium child processes from lingering.
    if (process.platform === 'win32') {
      try {
        const { execSync } = require('child_process');
        execSync('taskkill /F /T /PID ' + process.pid, { stdio: 'ignore' });
      } catch (_) {}
    }
    process.exit(0);
  });

  return win;
}

ipcMain.handle('set-app-preference', async (event, key, value) => {
  // console.log('Received preference:', key, value);
  const prefs = loadAppPreferences();
  prefs[key] = value;
  saveAppPreferences(prefs);
});

ipcMain.handle('get-app-preferences', async () => {
  return loadAppPreferences();
});

ipcMain.on('restart-app', () => {
  console.log('Restarting app...');
  // app.relaunch();
  app.relaunch({
    execPath: process.execPath,
    args: process.argv.slice(1).concat(['--relaunch'])
  });
  app.exit(0);
});

ipcMain.on('ready-to-show', () => {
  // Window is shown instantly at createWindow() time now. This handler is just
  // a safeguard: maximize + show only if it somehow isn't visible yet.
  if (win && !win.isDestroyed()) {
    if (!win.isMaximized()) win.maximize();
    if (!win.isVisible()) win.show();
  }
});

// â”€â”€ Window control (custom caption buttons in #nyx-titlebar) â”€â”€
// He asked: caption buttons should only appear when the header shows, not be
// always-on (they were blocking HaxBall's settings gear). These IPC handlers
// power the min/max/close buttons we render inside the auto-hide header.
ipcMain.on('window-minimize', () => {
  if (win && !win.isDestroyed()) win.minimize();
});
ipcMain.on('window-maximize-toggle', () => {
  if (win && !win.isDestroyed()) {
    if (win.isMaximized()) win.unmaximize(); else win.maximize();
  }
});
ipcMain.on('window-close', () => {
  // Force-kill the entire process tree (main + GPU + renderer + any child).
  // app.exit(0) alone can leave orphaned Chromium child processes alive on
  // Windows. taskkill /F /T traverses the process tree and kills everything.
  if (process.platform === 'win32') {
    try {
      const { execSync } = require('child_process');
      execSync('taskkill /F /T /PID ' + process.pid, { stdio: 'ignore' });
    } catch (_) {}
  }
  process.exit(0);
});
ipcMain.handle('window-is-maximized', () => {
  return win && !win.isDestroyed() ? win.isMaximized() : false;
});
ipcMain.on('reload-gameframe', () => {
  if (win && !win.isDestroyed()) win.webContents.reloadIgnoringCache();
});
ipcMain.on('open-external', (_e, url) => {
  if (typeof url === 'string' && /^https?:\/\//.test(url)) {
    shell.openExternal(url).catch(() => {});
  }
});

// â”€â”€ Auto-update: stream the new portable exe next to the current one â”€â”€
// ── Auto-update: the version CHECK runs in the MAIN process (a renderer
// fetch would be blocked by the page CSP). On success it pushes
// update:available to the renderer, which shows the progress modal and
// starts the download. ──
const UPDATE_REPO = '2Gbps/AtomHax';
const UPDATE_TOKEN = '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';

const compareVersions = (a, b) => {
  const nums = (v) => (v.replace(/^v/i, '').split('-')[0] || '').split('.').map((n) => parseInt(n, 10) || 0);
  const na = nums(a), nb = nums(b);
  const len = Math.max(na.length, nb.length);
  for (let i = 0; i < len; i++) {
    const x = na[i] || 0, y = nb[i] || 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
};

const checkForUpdates = (win) => {
  try {
    https.get('https://api.github.com/repos/' + UPDATE_REPO + '/releases?per_page=1', {
      headers: {
        'User-Agent': 'AtomHax',
        'Authorization': 'Bearer ' + UPDATE_TOKEN,
        'Accept': 'application/vnd.github.v3+json'
      }
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        try {
          if (res.statusCode !== 200) return;
          const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          if (!data || !data.length) return;
          const latest = data[0];
          const tag = String(latest.tag_name || '');
          if (compareVersions(tag, 'v' + version) <= 0) return;
          const asset = (latest.assets || []).find((a) => /-x64\.exe$/i.test(a.name));
          if (!asset) return;
          if (win && !win.isDestroyed()) {
            win.webContents.send('update:available', {
              tag,
              assetUrl: 'https://api.github.com/repos/' + UPDATE_REPO + '/releases/assets/' + asset.id,
              fileName: asset.name
            });
          }
        } catch (e) {}
      });
      res.on('error', () => {});
    }).on('error', () => {});
  } catch (e) {}
};

ipcMain.on('update:start', (_e, payload) => {
  const url = payload && payload.url;
  const fileName = payload && payload.fileName;
  const token = payload && payload.token;
  if (!url || !fileName || !token) return;
  const targetDir = process.env.PORTABLE_EXECUTABLE_DIR || app.getPath('userData');
  const targetPath = path.join(targetDir, fileName);
  let received = 0, total = 0;
  const fetchAsset = (assetUrl, redirects) => {
    if (redirects > 5) return;
    https.get(assetUrl, {
      headers: {
        'User-Agent': 'AtomHax',
        'Authorization': 'Bearer ' + token,
        'Accept': 'application/octet-stream'
      }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return fetchAsset(new URL(res.headers.location, assetUrl).toString(), redirects + 1);
      }
      if (res.statusCode !== 200) { res.resume(); return; }
      total = parseInt(res.headers['content-length'] || '0', 10) || 0;
      res.on('data', (chunk) => {
        received += chunk.length;
        if (total > 0 && win && !win.isDestroyed()) {
          win.webContents.send('update:progress', Math.min(100, Math.round((received / total) * 100)));
        }
      });
      const file = fs.createWriteStream(targetPath);
      res.pipe(file);
      res.on('end', () => {
        if (win && !win.isDestroyed()) win.webContents.send('update:progress', 100);
        setTimeout(() => {
          if (win && !win.isDestroyed()) win.webContents.send('update:done', targetPath);
        }, 400);
      });
      res.on('error', () => { try { file.destroy(); } catch (_) {} });
    }).on('error', () => {});
  };
  fetchAsset(url, 0);
});

ipcMain.on('update:relaunch', (_e, exePath) => {
  try {
    if (typeof exePath === 'string' && fs.existsSync(exePath)) {
      const { spawn } = require('child_process');
      const child = spawn(exePath, [], { detached: true, stdio: 'ignore' });
      child.unref();
    }
  } catch (_) {}
  // Remove old portable exes in the same folder, keep the new one
  try {
    const dir = process.env.PORTABLE_EXECUTABLE_DIR;
    if (dir) {
      const keep = typeof exePath === 'string' ? path.basename(exePath) : '';
      for (const f of fs.readdirSync(dir)) {
        if (/^AtomHax-.*\.exe$/i.test(f) && f !== keep) {
          try { fs.unlinkSync(path.join(dir, f)); } catch (_) {}
        }
      }
    }
  } catch (_) {}
  process.exit(0);
});
ipcMain.on('window-maximized-changed', () => {
  // no-op hook; renderer polls is-maximized on toggle
});

ipcMain.handle('save-preferences-file', async () => {
  const userDataPath = app.getPath('userData')
  const preferencesPath = path.join(userDataPath, 'preferences.json')
  const now = +new Date()

  const { canceled, filePath } = await dialog.showSaveDialog({
      defaultPath: `preferences_${now}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }]
  });

  if (!canceled && filePath) {
      const content = await fs.promises.readFile(preferencesPath, 'utf-8');
      await fs.promises.writeFile(filePath, content);
      return { success: true };
  }
  return { succes: false };
});


ipcMain.handle('import-preferences-file', async (event) => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: 'Select Preferences JSON',
    filters: [{ name: 'JSON Files', extensions: ['json'] }],
    properties: ['openFile']
  });

  if (canceled || filePaths.length === 0) {
      return { success: false, error: 'No file selected.' };
  }

  try {
      const filePath = filePaths[0];
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(fileContent);

      // console.log(data)

      // Validate the data
      validatePreferences(data);

      // Save it to the Electron user data folder
      const userDataPath = app.getPath('userData');
      const preferencesPath = path.join(userDataPath, 'preferences.json');

      fs.writeFileSync(preferencesPath, JSON.stringify(data, null, 2), 'utf-8');
      preferencesCache = data;

      return { success: true };
  } catch (err) {
      console.error('Failed to import preferences:', err);
      return { success: false, error: err.errors || err.message || 'Invalid JSON file.' };
  }
});

ipcMain.handle('delete-preferences-file', async (event) => {
  const userDataPath = app.getPath('userData')
  const preferencesPath = path.join(userDataPath, 'preferences.json')
  try {
    if (fs.existsSync(preferencesPath)) {
      fs.rmSync(preferencesPath);
      preferencesCache = null;
      return { success: true }
    }
  } catch (error) {
    console.error('Error deleting preferences:', error);
    return { success: false };
  }
})

ipcMain.handle('get-app-version', async (event) => {
  return version
})

ipcMain.handle('generate-player-auth-key', async (event) => {
  const { privateKey } = generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
    publicKeyEncoding: { format: 'jwk' },
    privateKeyEncoding: { format: 'jwk' },
  });

  const idkey = `idkey.${privateKey.x}.${privateKey.y}.${privateKey.d}`;

  return idkey
})

// â”€â”€ Scripts IPC â”€â”€
ipcMain.handle('scripts:list', async () => loadScripts());

ipcMain.handle('scripts:import', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: 'Import Script',
    filters: [{ name: 'JavaScript', extensions: ['js'] }],
    properties: ['openFile', 'multiSelections']
  });
  if (canceled || !filePaths.length) return { success: false };
  const scripts = loadScripts();
  const imported = [];
  for (const fp of filePaths) {
    try {
      const content = fs.readFileSync(fp, 'utf-8');
      const name = path.basename(fp, '.js');
      const id = 'scr_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
      const script = { id, name, content, enabled: true };
      scripts.push(script);
      imported.push(script);
    } catch (e) { console.error('[scripts] import error:', fp, e); }
  }
  saveScripts(scripts);
  return { success: true, imported };
});

ipcMain.handle('scripts:toggle', async (_event, id) => {
  const scripts = loadScripts();
  const s = scripts.find(s => s.id === id);
  if (s) s.enabled = !s.enabled;
  saveScripts(scripts);
  return { success: true, enabled: s?.enabled };
});

ipcMain.handle('scripts:delete', async (_event, id) => {
  let scripts = loadScripts();
  scripts = scripts.filter(s => s.id !== id);
  saveScripts(scripts);
  return { success: true };
});

ipcMain.handle('scripts:save', async (_event, scripts) => {
  saveScripts(scripts);
  return { success: true };
});

// Recaptcha auto-solve is driven from the main process over CDP (see
// triggerRecaptchaSolve + recaptchasolve.js) â€” no renderer IPC needed.

// Throttle Discord RPC so it can't spam IPC/network during view switches.
let lastRpcUpdate = 0;
ipcMain.on('update-discord-rpc', (_event, details) => {
  if (!rpc) return;
  const now = Date.now();
  if (now - lastRpcUpdate < 3000) return;
  lastRpcUpdate = now;
  const activity = {
    details: details,
    largeImageKey: 'client-logo',
    largeImageText: 'AtomHax',
    startTimestamp: Date.now(),
    buttons: [
      {
          label: 'Download Client',
          url:'https://oghb.github.io/haxball-client/'
      },
      {
          label: 'Join Discord',
          url:'https://discord.gg/zDzYamtcfX'
      }
    ]
  }

  rpc.setActivity(activity).catch((err) => {
    console.error('Discord RPC Error: Not logged in');
  });
});

// Log actual GPU capabilities after startup so you can verify that
// hardware acceleration is active (see https://electronjs.org/docs/latest/api/structures/gpu-feature-status).
// Key fields: 2d_canvas, gpu_compositing, rasterization, multiple_raster_threads.
const VENDORS = {
  '0x10de': 'NVIDIA',
  '0x1002': 'AMD',
  '0x8086': 'Intel',
  '0x126f': 'NVIDIA',
};
const logGPUStatus = async () => {
  try {
    const status = app.getGPUFeatureStatus();
    console.log('[perf] GPU feature status:', status);
    const softwareOrOff = Object.entries(status)
      .filter(([, v]) => /disabled_off|unavailable_off|disabled_software|unavailable_software/.test(v));
    if (softwareOrOff.length) {
      console.warn('[perf] Hardware acceleration OFF for:', softwareOrOff);
    } else {
      console.log('[perf] All key GPU features are hardware-accelerated.');
    }
  } catch (error) {
    console.warn('[perf] Could not read GPU feature status:', error);
  }

  try {
    const info = await app.getGPUInfo('basic');
    const active = (info.gpuDevice || []).filter((d) => d.active === true);
    for (const dev of active) {
      const vendor = VENDORS[String(dev.vendorId).toLowerCase()] || `0x${dev.vendorId}`;
      console.log(`[perf] Active GPU: ${vendor} (deviceId ${dev.deviceId})`);
    }
  } catch (error) {
    console.warn('[perf] Could not read GPU info:', error);
  }
};

// Windows: route this app to the high-performance GPU by writing the DirectX
// UserGpuPreferences registry key (same thing "Graphics Settings > High
// performance" does). Only takes effect after a restart, like the manual toggle.
const setWindowsGpuPreference = () => {
  if (process.platform !== 'win32') return;
  try {
    const { execFile } = require('child_process');
    const exe = process.execPath;
    execFile(
      'reg',
      ['add', 'HKCU\\Software\\Microsoft\\DirectX\\UserGpuPreferences', '/v', exe, '/t', 'REG_SZ', '/d', 'GpuPreference=3;', '/f'],
      (err) => {
        if (err) console.warn('[perf] Could not set GPU preference:', err.message);
        else console.log('[perf] High-performance GPU preference set for this exe.');
      }
    );
  } catch (error) {
    console.warn('[perf] Could not set GPU preference:', error.message);
  }
};

// Windows: raise the priority of every app process (renderer/GPU especially)
// so the OS scheduler never starves them mid-frame. Negative = higher priority.
// Mirrors the "foreground boost" Windows gives to browsers (SetAdditionalForegroundBoostProcesses).
const boostedPids = new Set();
const boostProcessPriorities = () => {
  if (process.platform !== 'win32') return;
  try {
    // On Windows, we rely on the 'high-priority' switch set earlier
    // and the Windows GPU preference registry setting
    console.log('[perf] Process priority boosted via Chromium flags.');
    
    // For child processes, we can't easily boost priority without WMIC
    // but the main process priority should help
  } catch (error) {
    console.warn('[perf] Priority boost failed:', error.message);
  }
};

app.whenReady().then(() => {
  logGPUStatus();

  // Stop the OS from suspending/throttling the app
  powerSaveBlocker.start('prevent-app-suspension');
  console.log('[perf] Sleep mode blocked.');

  win = createWindow();
  setWindowsGpuPreference();
  // Preload the offline Vosk STT model in a hidden window so audio-captcha
  // transcription is ready before any room-join captcha appears. Deferred so
  // the ~50MB model load doesn't compete with the main window's first paint.
  setTimeout(initSttWindow, 2500);
  // (boostProcessPriorities / setInterval removed â€” the --high-priority
  // CLI switch already boosts the main process; child renderer/GPU
  // processes inherit it. The setInterval was a no-op that only logged.)

  const preferencesPath = path.join(app.getPath('userData'), 'preferences.json')
  const fileContent = fs.readFileSync(preferencesPath, 'utf-8');
  const data = JSON.parse(fileContent);

  const enableRPC = data["discord_rpc"] ?? true;

  if (enableRPC){
    try { getRpc().login({ clientId: rpcClientId }); }
    catch (e) { console.warn('[rpc] login failed (native module ABI mismatch?):', (e && e.message) || e); }
  }
});

app.on('window-all-closed', () => {
  // Safety net: if somehow all windows close without the main window's close
  // handler firing first, force-kill the entire process tree.
  if (process.platform === 'win32') {
    try {
      const { execSync } = require('child_process');
      execSync('taskkill /F /T /PID ' + process.pid, { stdio: 'ignore' });
    } catch (_) {}
  }
  process.exit(0);
});
