const { contextBridge, ipcRenderer } = require('electron');

if (process.isMainFrame) {
  // Hide HaxBall's in-page chrome (.header) from the VERY FIRST paint so there
  // is no flash/stutter when our inject hides it late. Runs at document_start,
  // before HaxBall's own scripts build the .header element — the style is in
  // the document before the element exists, so it's hidden on first render.
  try {
    const s = document.createElement('style');
    s.id = 'nyx-chrome-hide';
    s.textContent = '.header{display:none!important;height:0!important;overflow:hidden!important}.rightbar{display:none!important}';
    (document.head || document.documentElement).appendChild(s);
  } catch (_) {}

  contextBridge.exposeInMainWorld('electronAPI', {
    setAppPreference: (key, value) => ipcRenderer.invoke('set-app-preference', key, value),
    getAppPreferences: () => ipcRenderer.invoke('get-app-preferences'),
    restartApp: () => ipcRenderer.send('restart-app'),
    notifyReadyToShow: () => ipcRenderer.send('ready-to-show'),
    exportPreferencesFile: () => ipcRenderer.invoke('save-preferences-file'),
    importPreferencesFile: () => ipcRenderer.invoke('import-preferences-file'),
    deletePreferencesFile: () => ipcRenderer.invoke('delete-preferences-file'),
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    generatePlayerAuthKey: () => ipcRenderer.invoke('generate-player-auth-key'),
    updateDiscordRPC: (details) => ipcRenderer.send('update-discord-rpc', details),
    windowMinimize: () => ipcRenderer.send('window-minimize'),
    windowMaximizeToggle: () => ipcRenderer.send('window-maximize-toggle'),
    windowClose: () => ipcRenderer.send('window-close'),
    windowIsMaximized: () => ipcRenderer.invoke('window-is-maximized'),
    // Scripts
    scriptsList: () => ipcRenderer.invoke('scripts:list'),
    scriptsImport: () => ipcRenderer.invoke('scripts:import'),
    scriptsToggle: (id) => ipcRenderer.invoke('scripts:toggle', id),
    scriptsDelete: (id) => ipcRenderer.invoke('scripts:delete', id),
    scriptsSave: (scripts) => ipcRenderer.invoke('scripts:save', scripts),
    reloadGameframe: () => ipcRenderer.send('reload-gameframe'),
    openExternal: (url) => ipcRenderer.send('open-external', url),
    // Auto-update
    startUpdate: (payload) => ipcRenderer.send('update:start', payload),
    relaunchUpdate: (exePath) => ipcRenderer.send('update:relaunch', exePath),
    onUpdateProgress: (cb) => ipcRenderer.on('update:progress', (_e, pct) => cb(pct)),
    onUpdateDone: (cb) => ipcRenderer.on('update:done', (_e, exePath) => cb(exePath)),
    onUpdateAvailable: (cb) => ipcRenderer.on('update:available', (_e, info) => cb(info))
  });
} else {
  // ── SUBFRAME HOOK: gameframe (HaxBall game/replay iframe) ──
  // Runs in the isolated world of EVERY subframe, BEFORE page scripts. The
  // DOM prototype objects are shared across worlds, so this patch is visible
  // to the page's main world.
  //
  // desynchronized: true is the literal answer to "don't wait for the queue
  // before rendering new stuff". It tells Chromium the canvas's compositor
  // layer may bypass the usual BeginFrame/present queue and present the
  // buffer as soon as it's drawn. RTSS showed 15fps (= 60/4, one present per
  // 4 vblanks) during movement because the canvas was presenting into a
  // stale slot of the swapchain; desync presents the newest buffer directly.
  //
  // NO ipcRenderer/contextBridge exposure here — the remote gameframe page
  // never gets Node/IPC access; only the prototype patch.
  try {
    // Block HaxBall's "Low latency canvas" from setting desynchronized on any
    // canvas. HaxBall builds player jerseys as a small offscreen canvas and
    // fills players with ctx.createPattern(thatCanvas, ...) — a known Chromium
    // bug makes createPattern() from desynchronized canvases render nothing
    // (players show outlines but no fill color).
    try { localStorage.removeItem('low_latency_canvas'); } catch (_) {}
    const origGetContext = HTMLCanvasElement.prototype.getContext;
    if (typeof origGetContext === 'function' && !HTMLCanvasElement.prototype.__nyxDesync) {
      HTMLCanvasElement.prototype.getContext = function (type, attrs) {
        if (this.id === 'nyx-coolbar-canvas') {
          return origGetContext.call(this, type, attrs);
        }
        attrs = attrs || {};
        if (attrs.desynchronized) {
          this.__nyxDesynced = true;
          delete attrs.desynchronized;
        }
        return origGetContext.call(this, type, attrs);
      };
      HTMLCanvasElement.prototype.__nyxDesync = true;
    }

    // Workaround: if any canvas somehow still ends up desynchronized (e.g. game
    // re-applies it after our patch), draw it onto a normal temp canvas before
    // creating the pattern. This handles the Chromium createPattern bug.
    try {
      const origCreatePattern = CanvasRenderingContext2D.prototype.createPattern;
      if (typeof origCreatePattern === 'function' && !CanvasRenderingContext2D.prototype.__nyxPatched) {
        CanvasRenderingContext2D.prototype.createPattern = function (image, repetition) {
          if (image && image instanceof HTMLCanvasElement && image.__nyxDesynced && typeof image.width === 'number' && image.width > 0) {
            const tmp = document.createElement('canvas');
            tmp.width = image.width;
            tmp.height = image.height;
            const tctx = tmp.getContext('2d');
            if (tctx) {
              try { tctx.drawImage(image, 0, 0); } catch (_) {}
              return origCreatePattern.call(this, tmp, repetition);
            }
          }
          return origCreatePattern.call(this, image, repetition);
        };
        CanvasRenderingContext2D.prototype.__nyxPatched = true;
      }
    } catch (_) {}
  } catch (_) {}
}
