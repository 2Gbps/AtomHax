// selftest4 — does the sidebar actually register clicks?
// Boots glue+bridge on about:blank, then simulates REAL OS-level input events
// (sendInputEvent) at a known icon position and checks whether the bridge's
// nyxCoolbarBridge stub fires. If this passes, the click path works and the
// "not interactable" report is environment-specific (gameframe/in-game).
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
    webPreferences: { contextIsolation: true, sandbox: true, webSecurity: true }
  });

  win.webContents.on('console-message', (e, level, message) => {
    if (String(message).indexOf('nyxcoolbar') >= 0)
      console.log(`[renderer:${level}] ${message}`);
  });

  await win.loadURL('about:blank');

  // Provide the API surface the bridge expects (stub, records calls).
  await win.webContents.executeJavaScript(`
    window.electronAPI = {
      windowMinimize: () => { window.__acted = (window.__acted||[]) && window.__acted.concat(['minimize']); },
      windowMaximizeToggle: () => { window.__acted = (window.__acted||[]) && window.__acted.concat(['maximize']); },
      windowClose: () => { window.__acted = (window.__acted||[]) && window.__acted.concat(['close']); },
      windowIsMaximized: () => Promise.resolve(false)
    };
    window.__nyxApp = { profileManage: () => { window.__acted = (window.__acted||[]) && window.__acted.concat(['profile']); },
      openSettingsAlert: () => { window.__acted = (window.__acted||[]) && window.__acted.concat(['settings']); },
      aboutAlert: () => { window.__acted = (window.__acted||[]) && window.__acted.concat(['about']); },
      helpAlert: () => { window.__acted = (window.__acted||[]) && window.__acted.concat(['help']); },
      profileName: 'Tester' };
    '__STUBS_READY__'
  `);

  try {
    const glue = fs.readFileSync(gluePath, 'utf8');
    const bridge = fs.readFileSync(bridgePath, 'utf8');
    await win.webContents.executeJavaScript(`${glue}\n;${bridge}\n;'__BOOT_DONE__'`);
    console.log('[main] glue+bridge boot resolved');
  } catch (e) {
    console.log('[main] boot rejected:', e && e.message);
    app.exit(1);
    return;
  }

  // record all bridge actions dispatched from the WASM module
  await win.webContents.executeJavaScript(`
    window.__acted = [];
    window.nyxCoolbarBridge = (id, arg) => { window.__acted.push([id, arg]); };
    '__RECORDER_READY__'
  `);

  await new Promise(r => setTimeout(r, 1500));

  // Estimate icon positions: dock is vertically centered, 10 rows (8 icons +
  // 2 dummies) ~ 42-53px each, anchored left edge. First icon center ~ y=80-120.
  const positions = [
    { x: 22, y: 95, label: 'minimize' },
    { x: 22, y: 140, label: 'maximize' },
    { x: 22, y: 185, label: 'close' }
  ];

  for (const p of positions) {
    win.webContents.sendInputEvent({ type: 'mouseMove', x: p.x, y: p.y });
    await new Promise(r => setTimeout(r, 600));
    win.webContents.sendInputEvent({ type: 'mouseDown', x: p.x, y: p.y, button: 'left', clickCount: 1 });
    await new Promise(r => setTimeout(r, 120));
    win.webContents.sendInputEvent({ type: 'mouseUp', x: p.x, y: p.y, button: 'left', clickCount: 1 });
    await new Promise(r => setTimeout(r, 400));
    const acted = await win.webContents.executeJavaScript(`JSON.stringify(window.__acted)`);
    console.log(`[main] after click at (${p.x},${p.y}) [${p.label}]:`, acted);
  }

  const state = await win.webContents.executeJavaScript(
    `JSON.stringify({mod: !!window.__nyxCoolbarMod, canvas: !!document.getElementById('nyx-coolbar-canvas'), acted: window.__acted})`
  );
  console.log('[main] final:', state);
  app.exit(0);
});