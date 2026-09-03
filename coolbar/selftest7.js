// selftest7 — is the MainLoop alive? Poll s_loopTicks over several seconds.
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
  const glue = fs.readFileSync(gluePath, 'utf8');
  const bridge = fs.readFileSync(bridgePath, 'utf8');
  await win.webContents.executeJavaScript(`${glue}\n;${bridge}\n;'__BOOT_DONE__'`);
  console.log('[main] booted, polling ticks every 500ms...');
  const readTicks = () => win.webContents.executeJavaScript(
    `(function(){ var mod = window.__nyxCoolbarMod; if(!mod) return 'NO_MOD'; var p = mod._nyxDebugState(); return mod.UTF8ToString ? mod.UTF8ToString(p) : 'NO_UTF8'; })()`);
  for (let i = 0; i < 8; i++) {
    await new Promise(r => setTimeout(r, 500));
    console.log(`[main] t+${(i+1)*0.5}s:`, await readTicks());
  }
  app.exit(0);
});