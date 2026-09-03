// selftest6 — dump ImGui internal state while driving input, to find why
// clicks don't register. Feeds direct to module exports and reads nyxDebugState.
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
    width: 800, height: 600, show: true,
    webPreferences: { contextIsolation: true, sandbox: true, webSecurity: true }
  });
  win.webContents.on('console-message', (e, level, message) => {
    if (String(message).indexOf('nyxcoolbar') >= 0)
      console.log(`[renderer:${level}] ${message}`);
  });

  await win.loadURL('about:blank');
  await win.webContents.executeJavaScript(`
    window.electronAPI = { windowMinimize: () => { window.__acted = (window.__acted||[]).concat(['minimize']); },
      windowMaximizeToggle: () => { window.__acted = (window.__acted||[]).concat(['maximize']); },
      windowClose: () => { window.__acted = (window.__acted||[]).concat(['close']); },
      windowIsMaximized: () => Promise.resolve(false) };
    window.__nyxApp = { profileManage: () => { window.__acted = (window.__acted||[]).concat(['profile']); },
      openSettingsAlert: () => { window.__acted = (window.__acted||[]).concat(['settings']); },
      aboutAlert: () => { window.__acted = (window.__acted||[]).concat(['about']); },
      helpAlert: () => { window.__acted = (window.__acted||[]).concat(['help']); },
      profileName: 'Tester' };
    '__STUBS_READY__'
  `);

  const glue = fs.readFileSync(gluePath, 'utf8');
  const bridge = fs.readFileSync(bridgePath, 'utf8');
  await win.webContents.executeJavaScript(`${glue}\n;${bridge}\n;'__BOOT_DONE__'`);
  await new Promise(r => setTimeout(r, 1500));

  await win.webContents.executeJavaScript(`window.__acted = []; window.nyxCoolbarBridge = (id, arg) => window.__acted.push([id, arg]); '__R__'`);

  const readState = () => win.webContents.executeJavaScript(
    `(function(){ var mod = window.__nyxCoolbarMod; if(!mod) return 'NO_MOD'; var p = mod._nyxDebugState(); var s = mod.UTF8ToString ? mod.UTF8ToString(p) : 'NO_UTF8'; return s; })()`);

  console.log('[main] baseline state:', await readState());

  // feed a hover + click at the first icon
  console.log('[main] feeding hover+click at (22,95)...');
  await win.webContents.executeJavaScript(`
    var mod = window.__nyxCoolbarMod;
    mod._nyxFeedMouse(22, 95);
    mod._nyxFeedButton(0, 1);
    '__FED1__'
  `);
  await new Promise(r => setTimeout(r, 120));
  console.log('[main] after DOWN:', await readState());
  console.log('[main] acted so far:', await win.webContents.executeJavaScript(`JSON.stringify(window.__acted)`));
  await win.webContents.executeJavaScript(`window.__nyxCoolbarMod._nyxFeedButton(0, 0); '__UP__'`);
  await new Promise(r => setTimeout(r, 120));
  console.log('[main] after UP:', await readState());
  console.log('[main] acted after UP:', await win.webContents.executeJavaScript(`JSON.stringify(window.__acted)`));

  // Also test at several y positions in case the dock is elsewhere vertically
  for (const y of [120, 160, 200, 240, 280, 320]) {
    await win.webContents.executeJavaScript(`
      window.__acted = [];
      var mod = window.__nyxCoolbarMod;
      mod._nyxFeedMouse(22, ${y});
      mod._nyxFeedButton(0, 1);
      mod._nyxFeedButton(0, 0);
      '__F2__'
    `);
    await new Promise(r => setTimeout(r, 150));
    const a = await win.webContents.executeJavaScript(`JSON.stringify(window.__acted)`);
    if (a !== '[]') console.log(`[main] CLICK FIRED at y=${y}:`, a);
  }
  console.log('[main] final state:', await readState());
  app.exit(0);
});