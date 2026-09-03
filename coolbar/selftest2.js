const { app, BrowserWindow, WebFrameMain } = require('electron');
const fs = require('fs');
const path = require('path');

const gluePath = path.join(__dirname, 'nyxcoolbar.js');
const bridgePath = path.join(__dirname, 'bridge.js');
const injectPath = path.join(__dirname, '..', 'inject', 'inject.js');

app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('use-angle', 'vulkan');
app.commandLine.appendSwitch('enable-features', 'Vulkan,SkiaRenderer');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    show: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });

  win.webContents.on('console-message', (e, level, message, line, sourceId) => {
    console.log(`[renderer:${level}] ${message}`);
  });

  try {
    await win.loadURL('https://www.haxball.com/play');
    console.log('[main] page loaded:', win.webContents.getURL());
  } catch (e) {
    console.log('[main] page load failed:', e && e.message);
    app.exit(1);
    return;
  }

  try {
    const injectJS = fs.readFileSync(injectPath, 'utf8');
    win.webContents.executeJavaScript(injectJS).catch((e) => {
      console.log('[main] inject.js rejected:', e && e.message);
    });
  } catch (e) {
    console.log('[main] inject.js read failed:', e.message);
  }

  await new Promise(r => setTimeout(r, 2500));

  try {
    const glue = fs.readFileSync(gluePath, 'utf8');
    const bridge = fs.readFileSync(bridgePath, 'utf8');
    const res = await win.webContents.executeJavaScript(`${glue}\n;${bridge}\n;'__BOOT_DONE__'`);
    console.log('[main] glue+bridge resolved:', res);
  } catch (e) {
    console.log('[main] glue+bridge rejected:', e && e.message);
  }

  await new Promise(r => setTimeout(r, 4000));

  let state;
  try {
    state = await win.webContents.executeJavaScript(
      `JSON.stringify((function(){
        var out = {};
        var c = document.getElementById('nyx-coolbar-canvas');
        out.canvas = !!c;
        out.display = c ? c.style.display : null;
        out.mod = !!window.__nyxCoolbarMod;
        out.booted = !!window.__nyxCoolbarBooted;
        out.bridge = typeof window.nyxCoolbarBridge;
        out.electronAPI = typeof window.electronAPI;
        out.nyxApp = typeof window.__nyxApp;
        return JSON.stringify(out);
      })())`
    );
    console.log('[main] state:', state);
  } catch (e) {
    console.log('[main] state failed:', e && e.message);
  }

  try {
    await win.webContents.executeJavaScript(
      `(function(){
        var c = document.getElementById('nyx-coolbar-canvas');
        if (c) { c.style.display = 'block'; c.style.zIndex = '2147483000'; }
        var mod = window.__nyxCoolbarMod;
        if (mod && mod.resumeMainLoop) mod.resumeMainLoop();
        return 'shown';
      })()`
    );
    console.log('[main] forced visible');
  } catch (e) {
    console.log('[main] force-show failed:', e && e.message);
  }
  await new Promise(r => setTimeout(r, 1500));

  try {
    const px = await win.webContents.executeJavaScript(
      `JSON.stringify((function(){
        var out = {};
        try {
          var c = document.getElementById('nyx-coolbar-canvas');
          var gl = c.getContext('webgl2');
          var w = c.width, h = c.height;
          var buf = new Uint8Array(w * h * 4);
          gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
          var nonZero = 0, alphaNonZero = 0;
          for (var i = 0; i < buf.length; i += 4) {
            if (buf[i] > 4 || buf[i+1] > 4 || buf[i+2] > 4) nonZero++;
            if (buf[i+3] > 4) alphaNonZero++;
          }
          out.w = w; out.h = h;
          out.nonZero = nonZero;
          out.alphaNonZero = alphaNonZero;
          var samples = [];
          for (var sx = 8; sx < w; sx += Math.max(1, Math.floor(w/5))) {
            var idx = (Math.floor(h/2) * w + sx) * 4;
            samples.push([sx, buf[idx], buf[idx+1], buf[idx+2], buf[idx+3]]);
          }
          out.samples = samples;
        } catch(e) { out.pxerr = String(e); }
        return JSON.stringify(out);
      })())`
    );
    console.log('[main] pixels:', px);
  } catch (e) {
    console.log('[main] pixel probe failed:', e && e.message);
  }

  try {
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(__dirname, 'sidebar-shot.png'), img.toPNG());
    console.log('[main] screenshot saved');
  } catch (e) {
    console.log('[main] screenshot failed:', e && e.message);
  }
  } catch (e) {
    console.log('[main] state failed:', e && e.message);
  }

  // also report gameframe localStorage low_latency_canvas
  try {
    const frames = win.webContents.mainFrame.frames;
    console.log('[main] frames:', frames.map(f => f.url));
  } catch (e) {
    console.log('[main] frames query failed:', e && e.message);
  }

  app.exit(0);
});