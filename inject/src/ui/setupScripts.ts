import { customAlert } from "../alerts";
import { listScripts, importScripts, toggleScript, deleteScript, reloadGame, NyxScript } from "../scripts";
import { animate } from "animejs";

const TOGGLE_CSS = `
    width: 38px; height: 20px; border-radius: 10px; cursor: pointer;
    background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.15);
    position: relative; transition: background 0.25s ease, border-color 0.25s ease;
    flex-shrink: 0;
`;
const TOGGLE_ON_CSS = `
    background: rgba(100,200,100,0.45) !important;
    border-color: rgba(100,200,100,0.5) !important;
`;
const TOGGLE_KNOB_CSS = `
    width: 14px; height: 14px; border-radius: 50%; position: absolute; top: 2px; left: 2px;
    background: rgba(255,255,255,0.7); transition: transform 0.25s ease, background 0.25s ease;
    box-shadow: 0 1px 3px rgba(0,0,0,0.3);
`;
const TOGGLE_KNOB_ON_CSS = `
    transform: translateX(18px); background: rgba(180,255,180,0.95);
`;

const renderList = async (container: HTMLElement, listEl: HTMLElement) => {
    const scripts = await listScripts();
    listEl.innerHTML = '';
    if (!scripts.length) {
        listEl.innerHTML = `<div style="color:rgba(255,255,255,0.35);font-size:13px;text-align:center;padding:20px 0;">No scripts imported yet</div>`;
        return;
    }
    for (const script of scripts) {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.06);';

        // Toggle
        const toggle = document.createElement('div');
        toggle.style.cssText = TOGGLE_CSS + (script.enabled ? TOGGLE_ON_CSS : '');
        const knob = document.createElement('div');
        knob.style.cssText = TOGGLE_KNOB_CSS + (script.enabled ? TOGGLE_KNOB_ON_CSS : '');
        toggle.appendChild(knob);
        toggle.addEventListener('click', async (e) => {
            e.stopPropagation();
            await toggleScript(script.id);
            script.enabled = !script.enabled;
            toggle.style.cssText = TOGGLE_CSS + (script.enabled ? TOGGLE_ON_CSS : '');
            knob.style.cssText = TOGGLE_KNOB_CSS + (script.enabled ? TOGGLE_KNOB_ON_CSS : '');
            reloadGame();
        });

        // Name
        const name = document.createElement('div');
        name.style.cssText = 'flex:1;font-size:14px;color:rgba(255,255,255,0.85);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
        name.textContent = script.name;
        name.title = script.name;

        // Delete
        const del = document.createElement('div');
        del.style.cssText = 'color:rgba(255,100,100,0.6);cursor:pointer;font-size:13px;padding:2px 6px;border-radius:4px;transition:color 0.15s ease,background 0.15s ease;flex-shrink:0;';
        del.textContent = '\u00d7';
        del.addEventListener('mouseenter', () => { del.style.color = '#f66'; del.style.background = 'rgba(255,60,60,0.12)'; });
        del.addEventListener('mouseleave', () => { del.style.color = 'rgba(255,100,100,0.6)'; del.style.background = 'transparent'; });
        del.addEventListener('click', async (e) => {
            e.stopPropagation();
            await deleteScript(script.id);
            renderList(container, listEl);
            reloadGame();
        });

        row.appendChild(toggle);
        row.appendChild(name);
        row.appendChild(del);
        listEl.appendChild(row);
    }
};

export const scriptsModal = async (): Promise<void> => {
    const container = document.createElement('div');
    container.style.cssText = 'display:flex;flex-direction:column;width:100%;max-height:400px;';

    const listEl = document.createElement('div');
    listEl.style.cssText = 'flex:1;overflow-y:auto;min-height:0;padding-right:4px;';
    listEl.style.cssText += 'scrollbar-width:thin;scrollbar-color:rgba(255,255,255,0.15) transparent;';
    container.appendChild(listEl);

    // Import button
    const importBtn = document.createElement('button');
    importBtn.textContent = 'Import Script';
    importBtn.style.cssText = `
        margin-top: 14px; padding: 10px 16px; font-size: 14px; font-weight: bold;
        border: 1px solid rgba(255,255,255,0.1); border-radius: 8px;
        background: linear-gradient(135deg, rgba(59,93,130,0.85) 0%, rgba(59,93,130,0.65) 100%);
        color: white; cursor: pointer; transition: background 0.2s ease, transform 0.15s ease;
    `;
    importBtn.addEventListener('mouseenter', () => {
        importBtn.style.background = 'linear-gradient(135deg, rgba(79,113,150,0.95) 0%, rgba(79,113,150,0.75) 100%)';
    });
    importBtn.addEventListener('mouseleave', () => {
        importBtn.style.background = 'linear-gradient(135deg, rgba(59,93,130,0.85) 0%, rgba(59,93,130,0.65) 100%)';
    });
    importBtn.addEventListener('click', async () => {
        const result = await importScripts();
        if (result.success && result.imported?.length) {
            renderList(container, listEl);
            reloadGame();
        }
    });
    container.appendChild(importBtn);

    await renderList(container, listEl);

    customAlert('Scripts', container, []);
};
