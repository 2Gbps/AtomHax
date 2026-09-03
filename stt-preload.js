const { contextBridge, ipcRenderer } = require('electron');

// Bridge used by the hidden offline STT (Vosk WASM) renderer. The main process
// drives it: it sends a PCM buffer and gets back the recognized transcript.
contextBridge.exposeInMainWorld('stt', {
  ready: () => ipcRenderer.send('stt-ready'),
  error: (msg) => ipcRenderer.send('stt-error', msg),
  result: (text) => ipcRenderer.send('stt-result', text),
  onTranscribe: (cb) => ipcRenderer.on('stt-transcribe', (_e, payload) => cb(payload)),
});
