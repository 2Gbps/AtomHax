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
    webPreferences: { offscreen: false }
  });

  win.webContents.on('console-message', (e, level, message, line, sourceId) => {
    console.log(`[renderer:${level}] ${message}`);
  });

  win.webContents.on('preload-error', (e, p, err) => {
    console.log('[preload-error]', p, err.message);
  });

  await win.loadURL('about:blank');

  try {
    const glTest = await win.webContents.executeJavaScript(`
      (function () {
        const c = document.createElement('canvas');
        c.width = 64; c.height = 64;
        document.body.appendChild(c);
        const gl = c.getContext('webgl2', { alpha: true, premultipliedAlpha: true });
        if (!gl) return JSON.stringify({ ok: false, err: 'no webgl2 context' });
        const vs = gl.createShader(gl.VERTEX_SHADER);
        gl.shaderSource(vs, '#version 300 es\\n' + 'precision highp float;\\nlayout (location = 0) in vec2 Position;\\nuniform mat4 ProjMtx;\\nout vec2 Frag_UV;\\nout vec4 Frag_Color;\\nvoid main(){ Frag_UV = vec2(0); Frag_Color = vec4(1); gl_Position = ProjMtx * vec4(Position, 0, 1); }');
        gl.compileShader(vs);
        const status = gl.getShaderParameter(vs, gl.COMPILE_STATUS);
        const log = gl.getShaderInfoLog(vs);
        return JSON.stringify({ ok: !!status, version: gl.getParameter(gl.VERSION), renderer: gl.getParameter(gl.RENDERER), log: log });
      })()
    `);
    console.log('[main] raw webgl2 test:', glTest);
  } catch (e) {
    console.log('[main] raw webgl2 test threw:', e && e.message);
  }

  const glue = fs.readFileSync(gluePath, 'utf8');
  const bridge = fs.readFileSync(bridgePath, 'utf8');

  try {
    const result = await win.webContents.executeJavaScript(
      `${glue}\n;${bridge}\n;'__BOOT_DONE__'`
    );
    console.log('[main] executeJavaScript resolved:', result);
  } catch (e) {
    console.log('[main] executeJavaScript rejected:', e && e.message);
  }

  setTimeout(async () => {
    try {
      const state = await win.webContents.executeJavaScript(
        `JSON.stringify((function(){
          var out = {};
          try {
            var c = document.getElementById('nyx-coolbar-canvas');
            var gl = c.getContext('webgl2');
            if (!gl) { out.err = 'no ctx'; return JSON.stringify(out); }
            var vs = gl.createShader(gl.VERTEX_SHADER);
            var body = 'precision highp float;\\n' +
              'layout (location = 0) in vec2 Position;\\n' +
              'layout (location = 1) in vec2 UV;\\n' +
              'layout (location = 2) in vec4 Color;\\n' +
              'uniform mat4 ProjMtx;\\n' +
              'out vec2 Frag_UV;\\n' +
              'out vec4 Frag_Color;\\n' +
              'void main() { Frag_UV = UV; Frag_Color = Color; gl_Position = ProjMtx * vec4(Position.xy,0,1); }';
            gl.shaderSource(vs, ['#version 300 es\\n', body]);
            gl.compileShader(vs);
            out.vertOkArr = !!gl.getShaderParameter(vs, gl.COMPILE_STATUS);
            out.vertLogArr = gl.getShaderInfoLog(vs);
            var vs2 = gl.createShader(gl.VERTEX_SHADER);
            gl.shaderSource(vs2, '#version 300 es\\n' + body);
            gl.compileShader(vs2);
            out.vertOkStr = !!gl.getShaderParameter(vs2, gl.COMPILE_STATUS);
            out.vertLogStr = gl.getShaderInfoLog(vs2);
            var fs = gl.createShader(gl.FRAGMENT_SHADER);
            var fbody = 'precision mediump float;\\n' +
              'uniform sampler2D Texture;\\n' +
              'in vec2 Frag_UV;\\n' +
              'in vec4 Frag_Color;\\n' +
              'layout (location = 0) out vec4 Out_Color;\\n' +
              'void main() { Out_Color = Frag_Color * texture(Texture, Frag_UV.st); }';
            gl.shaderSource(fs, ['#version 300 es\\n', fbody]);
            gl.compileShader(fs);
            out.fragOkArr = !!gl.getShaderParameter(fs, gl.COMPILE_STATUS);
            out.fragLogArr = gl.getShaderInfoLog(fs);
            var fs2 = gl.createShader(gl.FRAGMENT_SHADER);
            gl.shaderSource(fs2, '#version 300 es\\n' + fbody);
            gl.compileShader(fs2);
            out.fragOkStr = !!gl.getShaderParameter(fs2, gl.COMPILE_STATUS);
            out.fragLogStr = gl.getShaderInfoLog(fs2);
            out.errcode = gl.getError();
            out.isLost = gl.isContextLost();
          } catch(e) { out.cxerr = String(e); }
          return JSON.stringify(out);
        })())`
      );
      console.log('[main] shader-probe:', state);
    } catch (e) {
      console.log('[main] state query failed:', e && e.message);
    }
    // Force the sidebar visible and give it a frame, then read pixels back.
    try {
      await win.webContents.executeJavaScript(`
        (function () {
          var c = document.getElementById('nyx-coolbar-canvas');
          if (c) { c.style.display = 'block'; } // keep whatever width the bridge set
          var mod = window.__nyxCoolbarMod;
          if (mod && mod.resumeMainLoop) mod.resumeMainLoop();
          return 'forced';
        })()
      `);
      await new Promise(r => setTimeout(r, 1500));
    } catch (e) {
      console.log('[main] force-show failed:', e && e.message);
    }
    try {
      const px = await win.webContents.executeJavaScript(`
        JSON.stringify((function(){
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
            for (var sx = 0; sx < w; sx += Math.max(1, Math.floor(w/6))) {
              var idx = (Math.floor(h/2) * w + sx) * 4;
              samples.push([sx, buf[idx], buf[idx+1], buf[idx+2], buf[idx+3]]);
            }
            out.samples = samples;
          } catch(e) { out.pxerr = String(e); }
          return JSON.stringify(out);
        })())
      `);
      console.log('[main] pixels:', px);
    } catch (e) {
      console.log('[main] pixel probe failed:', e && e.message);
    }
    app.exit(0);
  }, 3000);
});