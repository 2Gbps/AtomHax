// selftest5 — isolate WHERE the click path breaks.
// Phase A: drive window.nyxCoolbarBridge action stub via REAL OS input (already
//          failed in selftest4 → feeding or ImGui processing).
// Phase B: call the module's exported _nyxFeedMouse/_nyxFeedButton DIRECTLY from
//          JS at a known icon position, then check if the action fires.
// Phase C: report ImGui input state by pushing a probe into the module.
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
  console.log('[main] phase A: real OS input (as selftest4)');
  win.webContents.sendInputEvent({ type: 'mouseMove', x: 22, y: 95 });
  await new Promise(r => setTimeout(r, 500));
  win.webContents.sendInputEvent({ type: 'mouseDown', x: 22, y: 95, button: 'left', clickCount: 1 });
  await new Promise(r => setTimeout(r, 150));
  win.webContents.sendInputEvent({ type: 'mouseUp', x: 22, y: 95, button: 'left', clickCount: 1 });
  await new Promise(r => setTimeout(r, 500));
  console.log('[main]   acted after OS click:', await win.webContents.executeJavaScript(`JSON.stringify(window.__acted)`));

  console.log('[main] phase B: direct module feed');
  await win.webContents.executeJavaScript(`window.__acted = []; '__R__'`);
  // move mouse to first icon center, press, release — all via the module's own exports
  const res = await win.webContents.executeJavaScript(`(function(){
    var mod = window.__nyxCoolbarMod;
    if (!mod) return 'NO_MOD';
    mod._nyxFeedMouse(22, 95);
    mod._nyxFeedButton(0, 1);
    mod._nyxFeedButton(0, 0);
    return 'FED';
  })()`);
  console.log('[main]   direct feed:', res);
  await new Promise(r => setTimeout(r, 800));
  console.log('[main]   acted after direct feed:', await win.webContents.executeJavaScript(`JSON.stringify(window.__acted)`));

  console.log('[main] phase C: verify feeds reach module io');
  // expose a probe from C++? no rebuild yet — instead check button down state visually
  const state = await win.webContents.executeJavaScript(`JSON.stringify({mod: !!window.__nyxCoolbarMod, canvas: !!document.getElementById('nyx-coolbar-canvas'), acted: window.__acted})`);
  console.log('[main] final:', state);
  app.exit(0);
});