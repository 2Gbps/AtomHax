const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const gluePath = path.join(__dirname, 'nyxcoolbar.js');
const bridgePath = path.join(__dirname, 'bridge.js');

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
    if (String(message).indexOf('nyxcoolbar') >= 0 || String(message).indexOf('domopt') >= 0)
      console.log(`[renderer:${level}] ${message}`);
  });

  const loadPromise = win.loadURL('https://www.haxball.com/play');
  loadPromise.catch((e) => console.log('[main] load (background) rejected:', e && e.message));
  await new Promise(r => setTimeout(r, 10000));
  console.log('[main] current url:', win.webContents.getURL());

  try {
    const glue = fs.readFileSync(gluePath, 'utf8');
    const bridge = fs.readFileSync(bridgePath, 'utf8');
    const res = await win.webContents.executeJavaScript(`${glue}\n;${bridge}\n;'__BOOT_DONE__'`);
    console.log('[main] glue+bridge resolved:', res);
  } catch (e) {
    console.log('[main] glue+bridge rejected:', e && e.message);
  }

  await new Promise(r => setTimeout(r, 2500));

  // simulate mouse near left edge
  win.webContents.sendInputEvent({ type: 'mouseMove', x: 120, y: 300 });
  await new Promise(r => setTimeout(r, 800));
  win.webContents.sendInputEvent({ type: 'mouseMove', x: 80, y: 200 });
  await new Promise(r => setTimeout(r, 800));

  try {
    const state = await win.webContents.executeJavaScript(
      `JSON.stringify((function(){
        var out = {};
        var c = document.getElementById('nyx-coolbar-canvas');
        out.canvas = !!c;
        out.display = c ? c.style.display : null;
        out.mod = !!window.__nyxCoolbarMod;
        out.booted = !!window.__nyxCoolbarBooted;
        var gl = c && c.getContext('webgl2');
        out.isLost = gl ? gl.isContextLost() : null;
        return JSON.stringify(out);
      })())`
    );
    console.log('[main] state after mouse:', state);
  } catch (e) {
    console.log('[main] state failed:', e && e.message);
  }

  app.exit(0);
});