import { closeCustomAlert, customAlert } from "./alerts";
import { URL } from "./constants";

let registered = false;

// The version check runs in the MAIN process (no page CSP); the renderer
// just listens for update:available and runs the download+relaunch flow.
export function autoUpdater(): void {
    if (registered) return;
    registered = true;

    window.electronAPI.onUpdateAvailable((info: { tag: string; assetUrl: string; fileName: string }) => {
        const tag = info.tag;

        const container = document.createElement('div');
        container.style.cssText = 'text-align:center;font-size:13px;color:rgba(255,255,255,0.85);min-width:260px;';

        const label = document.createElement('div');
        label.textContent = `Updating to ${tag}...`;

        const bar = document.createElement('div');
        bar.style.cssText = 'height:8px;background:rgba(255,255,255,0.1);border-radius:4px;margin-top:12px;overflow:hidden;';

        const fill = document.createElement('div');
        fill.style.cssText = 'height:100%;width:0%;background:#4a9eff;border-radius:4px;transition:width .2s;';
        bar.appendChild(fill);

        const pctText = document.createElement('div');
        pctText.style.cssText = 'margin-top:6px;font-size:11px;color:rgba(255,255,255,0.5);';

        container.appendChild(label);
        container.appendChild(bar);
        container.appendChild(pctText);

        customAlert('Update', container, []);

        window.electronAPI.onUpdateProgress((pct: number) => {
            fill.style.width = pct + '%';
            pctText.textContent = pct + '%';
        });
        window.electronAPI.onUpdateDone((exePath: string) => {
            closeCustomAlert();
            window.electronAPI.relaunchUpdate(exePath);
        });

        window.electronAPI.startUpdate({ url: info.assetUrl, fileName: info.fileName, token: URL.release_token, tag });
    });
}