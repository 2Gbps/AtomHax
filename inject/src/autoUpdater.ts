import { closeCustomAlert, customAlert } from "./alerts";
import { URL } from "./constants";

// Compare "0.1.1-ea" style versions numerically; prerelease suffix ignored.
const compareVersions = (a: string, b: string): number => {
    const nums = (v: string) => (v.replace(/^v/i, '').split('-')[0] || '').split('.').map((n) => parseInt(n, 10) || 0);
    const na = nums(a), nb = nums(b);
    const len = Math.max(na.length, nb.length);
    for (let i = 0; i < len; i++) {
        const x = na[i] || 0, y = nb[i] || 0;
        if (x > y) return 1;
        if (x < y) return -1;
    }
    return 0;
};

let checkDone = false;

export async function autoUpdater(): Promise<void> {
    // Only check once per app launch, on the first room-list view.
    if (checkDone) return;
    checkDone = true;
    try {
        const res = await fetch(URL.releases + '?per_page=1', {
            method: "GET",
            headers: {
                Authorization: 'Bearer ' + URL.release_token,
                Accept: "application/vnd.github.v3+json",
            },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!data || !data.length) return;
        const latest = data[0];
        const tag = String(latest.tag_name || '');
        const current = `v${await window.electronAPI.getAppVersion()}`;
        if (compareVersions(tag, current) <= 0) return;

        const asset = (latest.assets || []).find((a: any) => /-x64\.exe$/i.test(a.name));
        if (!asset) return;

        // ── Fully automatic: download the new exe, then relaunch into it ──
        const assetUrl = `https://api.github.com/repos/2Gbps/AtomHax/releases/assets/${asset.id}`;

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

        window.electronAPI.startUpdate({ url: assetUrl, fileName: asset.name, token: URL.release_token, tag });
    } catch (e) {
        // Silent — offline or API error shouldn't disturb the game.
    }
}