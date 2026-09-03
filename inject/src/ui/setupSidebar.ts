import { openSettingsAlert } from "../settings";
import { scriptsModal } from "./setupScripts";
import { animate, stagger } from "animejs";
import { customAlert } from "../alerts";

const REVEAL_MARGIN = 176;
const BTN_SIZE = 28;
const GAP = 15;
const SLIDE_MS = 0.25;

let sidebarEl: HTMLDivElement | null = null;
let hoverZone: HTMLDivElement | null = null;
let sidebarVisible = false;
let modalOpen = false;
let gameframeObserver: MutationObserver | null = null;

const show = () => {
    if (!sidebarEl || sidebarVisible || modalOpen) return;
    sidebarEl.style.transform = 'translateX(0)';
    sidebarEl.style.opacity = '1';
    sidebarEl.style.pointerEvents = 'auto';
    sidebarVisible = true;
    animateSidebarChildrenIn();
};

const hide = () => {
    if (!sidebarEl || !sidebarVisible) return;
    sidebarEl.style.transform = 'translateX(-110%)';
    sidebarEl.style.opacity = '0';
    sidebarEl.style.pointerEvents = 'none';
    sidebarVisible = false;
};

const forceHideSidebar = () => {
    if (!sidebarEl) return;
    sidebarEl.style.transform = 'translateX(-110%)';
    sidebarEl.style.opacity = '0';
    sidebarEl.style.pointerEvents = 'none';
    sidebarVisible = false;
};

const animateSidebarChildrenIn = () => {
    if (!sidebarEl) return;
    const children = Array.from(sidebarEl.children).filter(
        (c) => c instanceof HTMLElement
    ) as HTMLElement[];
    animate(children, {
        translateY: ['-8px', '0px'],
        opacity: [0, 1],
        duration: 400,
        delay: stagger(40, { start: 50 }),
        ease: 'outElastic(1, .6)',
    });
};

const handleMouseMove = (clientX: number) => {
    if (clientX <= REVEAL_MARGIN) {
        if (!sidebarVisible) show();
    } else {
        if (sidebarVisible) hide();
    }
};

let rafHandle: number | null = null;
let pendingMouseX = -1;
const throttledHandleMouseMove = (clientX: number) => {
    pendingMouseX = clientX;
    if (rafHandle != null) return;
    rafHandle = requestAnimationFrame(() => {
        rafHandle = null;
        handleMouseMove(pendingMouseX);
    });
};

const attachGameframeMouseForwarder = (gameframe: HTMLIFrameElement) => {
    try {
        const doc = gameframe.contentDocument;
        if (!doc || (doc as any).__nyxSidebarMouseFwd) return;
        (doc as any).__nyxSidebarMouseFwd = true;
        doc.addEventListener('mousemove', (e: MouseEvent) => {
            const offset = gameframe.getBoundingClientRect().left;
            handleMouseMove(e.clientX + offset);
        });
    } catch (_) {}
};

const wireGameframes = () => {
    const frames = document.querySelectorAll<HTMLIFrameElement>('iframe.gameframe');
    for (let i = 0; i < frames.length; i++) {
        const frame = frames[i];
        attachGameframeMouseForwarder(frame);
        if (!(frame as any).__nyxLoadWired) {
            (frame as any).__nyxLoadWired = true;
            frame.addEventListener('load', () => attachGameframeMouseForwarder(frame));
        }
    }
};

export const toggleSidebar = () => {
    if (sidebarVisible) hide(); else show();
};

// ── Join Room modal (centered dialog, auto-validates link) ──
const joinRoomModal = (): void => {
    const container = document.createElement('div');
    container.style.cssText = 'display:flex;flex-direction:column;align-items:center;width:100%;';

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Paste room link...';
    input.style.cssText = `
        width: 100%; color: #fff;
        border: 1px solid rgba(255,255,255,0.2); border-radius: 8px;
        padding: 12px 14px; font-size: 15px; font-family: inherit; outline: none;
        box-sizing: border-box; text-align: center;
        background: rgba(255,255,255,0.06);
        transition: border-color 0.3s ease, box-shadow 0.3s ease;
    `;
    container.appendChild(input);

    const status = document.createElement('div');
    status.style.cssText = `
        margin-top: 10px; font-size: 13px; color: rgba(255,255,255,0.5);
        min-height: 18px; transition: color 0.3s ease;
    `;
    container.appendChild(status);

    const validate = () => {
        const url = input.value.trim();
        if (!url) {
            status.textContent = '';
            status.style.color = 'rgba(255,255,255,0.5)';
            input.style.borderColor = 'rgba(255,255,255,0.2)';
            return;
        }
        if (/^https:\/\/www\.haxball\.com\/play\?c=.{11}$/.test(url)) {
            status.textContent = 'Joining...';
            status.style.color = '#6f6';
            input.style.borderColor = 'rgba(100,255,100,0.5)';
            setTimeout(() => { window.location.href = url; }, 300);
        } else {
            status.textContent = 'Please Retry';
            status.style.color = '#f66';
            input.style.borderColor = 'rgba(255,80,80,0.5)';
            animate(input, {
                translateX: [-5, 5, -3, 3, -1, 0],
                duration: 400,
                ease: 'outElastic(1, .3)',
            });
            setTimeout(() => {
                input.value = '';
                status.textContent = '';
                status.style.color = 'rgba(255,255,255,0.5)';
                input.style.borderColor = 'rgba(255,255,255,0.2)';
            }, 1500);
        }
    };

    input.addEventListener('input', validate);
    input.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') {
            e.preventDefault();
            validate();
        }
    });

    customAlert('Join Room', container, []);
    setTimeout(() => { input.focus(); }, 100);
};

const GLASS_STYLE = `
    backdrop-filter: blur(12px) saturate(1.6);
    -webkit-backdrop-filter: blur(12px) saturate(1.6);
    background: linear-gradient(
        135deg,
        rgba(255,255,255,0.12) 0%,
        rgba(255,255,255,0.04) 50%,
        rgba(255,255,255,0.08) 100%
    );
    border: 1px solid rgba(255,255,255,0.15);
    box-shadow:
        0 2px 8px rgba(0,0,0,0.12),
        inset 0 1px 0 rgba(255,255,255,0.1),
        inset 0 -1px 0 rgba(0,0,0,0.05);
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
`;

const DARK_GLASS = `
    background: linear-gradient(135deg, rgba(27,33,37,0.85) 0%, rgba(27,33,37,0.6) 50%, rgba(27,33,37,0.75) 100%);
    border: 1px solid rgba(255,255,255,0.12);
    box-shadow: 0 2px 8px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -1px 0 rgba(0,0,0,0.1);
`;

type TrafficColor = '#ff5f57' | '#28c840';
const mkTrafficLight = (color: TrafficColor, symbol: string, title: string, onClick: () => void) => {
    const btn = document.createElement('div');
    btn.title = title;
    btn.style.cssText = `
        width: 51px; height: 51px;
        border-radius: 10px;
        ${DARK_GLASS}
        display: flex; align-items: center; justify-content: center;
        cursor: pointer;
        position: relative;
        -webkit-app-region: no-drag;
        user-select: none;
        opacity: 0.85;
        will-change: transform;
        image-rendering: -webkit-optimize-contrast;
    `;
    const glyph = document.createElement('span');
    glyph.textContent = symbol;
    glyph.style.cssText = `
        font-size: 26px; font-weight: 700; color: ${color};
        line-height: 1; pointer-events: none;
        font-family: -apple-system, "Segoe UI", sans-serif;
        margin-top: -0.5px;
        will-change: transform;
        transition: color 0.15s ease, text-shadow 0.15s ease;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
        text-shadow: 0 1px 2px rgba(0,0,0,0.3);
    `;
    btn.appendChild(glyph);

    btn.addEventListener('mouseenter', () => {
        animate(btn, { scale: 1.35, duration: 500, ease: 'outElastic(1, .5)' });
        animate(glyph, { scale: [0.7, 1.1, 1], duration: 350, ease: 'outExpo' });
        glyph.style.textShadow = `0 0 10px ${color}aa, 0 1px 3px rgba(0,0,0,0.3)`;
        btn.style.boxShadow = `0 0 12px 2px ${color}44, 0 2px 8px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.08)`;
    });
    btn.addEventListener('mouseleave', () => {
        animate(btn, { scale: 1, duration: 600, ease: 'outElastic(1, .4)' });
        animate(glyph, { scale: 1, duration: 300, ease: 'outExpo' });
        glyph.style.textShadow = '0 1px 2px rgba(0,0,0,0.3)';
        btn.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -1px 0 rgba(0,0,0,0.1)';
    });
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        animate(btn, { scale: [1.35, 0.85, 1.15, 1], duration: 500, ease: 'outElastic(1, .3)' });
        onClick();
    });
    return btn;
};

const mkIconButton = (iconClass: string, title: string, onClick: () => void) => {
    const btn = document.createElement('div');
    btn.title = title;
    btn.style.cssText = `
        width: 51px; height: 51px;
        display: flex; align-items: center; justify-content: center;
        cursor: pointer; color: rgba(255,255,255,0.55);
        font-size: 26px;
        border-radius: 10px;
        ${DARK_GLASS}
        user-select: none;
        -webkit-app-region: no-drag;
        will-change: transform;
        opacity: 0.8;
        transition: color 0.15s ease;
        image-rendering: -webkit-optimize-contrast;
    `;
    const icon = document.createElement('i');
    icon.className = `fa ${iconClass}`;
    icon.setAttribute('aria-hidden', 'true');
    icon.style.cssText = 'pointer-events: none; will-change: transform; -webkit-font-smoothing: antialiased;';
    btn.appendChild(icon);

    btn.addEventListener('mouseenter', () => {
        animate(btn, { scale: 1.18, opacity: 1, duration: 500, ease: 'outElastic(1, .5)' });
        animate(icon, { scale: [0.7, 1.15, 1], rotate: ['0deg', '-8deg', '4deg', '0deg'], duration: 600, ease: 'outElastic(1, .4)' });
        btn.style.color = 'rgba(255,255,255,0.95)';
        btn.style.boxShadow = '0 4px 16px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.12), inset 0 -1px 0 rgba(0,0,0,0.1)';
        btn.style.borderColor = 'rgba(255,255,255,0.2)';
    });
    btn.addEventListener('mouseleave', () => {
        animate(btn, { scale: 1, opacity: 0.8, duration: 600, ease: 'outElastic(1, .4)' });
        animate(icon, { scale: 1, rotate: '0deg', duration: 400, ease: 'outExpo' });
        btn.style.color = 'rgba(255,255,255,0.55)';
        btn.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -1px 0 rgba(0,0,0,0.1)';
        btn.style.borderColor = 'rgba(255,255,255,0.12)';
    });
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        animate(btn, { scale: [1.18, 0.88, 1.05, 1], duration: 500, ease: 'outElastic(1, .3)' });
        animate(icon, { rotate: ['0deg', '360deg'], duration: 500, ease: 'outExpo' });
        onClick();
    });
    return btn;
};

export const setupSidebar = async (): Promise<void> => {
    if (!document.getElementById('font-awesome-4')) {
        const fa = document.createElement('link');
        fa.id = 'font-awesome-4';
        fa.rel = 'stylesheet';
        fa.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/css/font-awesome.min.css';
        document.head.appendChild(fa);
    }

    if (!document.getElementById('nyx-sidebar')) {
        // ── Hover zone: invisible strip on the left edge, ALWAYS in the DOM,
        // ALWAYS interactive (pointer-events: auto), sits above the #blur-overlay
        // (z-index: 9999) so it can detect hover even when a modal is open. ──
        hoverZone = document.createElement('div');
        hoverZone.id = 'nyx-sidebar-hover';
        hoverZone.style.cssText = `
            position: fixed;
            top: 0; left: 0;
            width: ${REVEAL_MARGIN}px;
            height: 100%;
            z-index: 2147483646;
            pointer-events: auto;
            cursor: default;
        `;
        document.body.appendChild(hoverZone);

        // ── Sidebar panel: the actual buttons, always in the DOM, uses
        // opacity + transform for show/hide (no display:none). ──
        sidebarEl = document.createElement('div');
        sidebarEl.id = 'nyx-sidebar';
        sidebarEl.style.cssText = `
            position: fixed;
            top: 23px; left: 23px;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: ${GAP}px;
            z-index: 2147483647;
            opacity: 0;
            pointer-events: none;
            transform: translateX(-110%);
            transition: transform ${SLIDE_MS}s cubic-bezier(0.4, 0, 0.2, 1),
                        opacity ${SLIDE_MS}s ease;
            user-select: none;
            -webkit-app-region: drag;
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
        `;
        document.body.appendChild(sidebarEl);
    } else {
        sidebarEl = document.getElementById('nyx-sidebar') as HTMLDivElement;
        hoverZone = document.getElementById('nyx-sidebar-hover') as HTMLDivElement;
    }

    sidebarEl.innerHTML = '';

    const btnClose = mkTrafficLight('#ff5f57', '\u00d7', 'Close', () => window.electronAPI.windowClose());
    const btnMin = mkTrafficLight('#28c840', '\u2013', 'Minimize', () => window.electronAPI.windowMinimize());

    sidebarEl.appendChild(btnClose);
    sidebarEl.appendChild(btnMin);

    const actions = document.createElement('div');
    actions.style.cssText = `
        display: flex; flex-direction: column; align-items: center;
        gap: 7px; margin-top: 15px;
    `;
    actions.appendChild(mkIconButton('fa-sign-in', 'Join Room', () => joinRoomModal()));
    actions.appendChild(mkIconButton('fa-code', 'Scripts', () => scriptsModal()));
    actions.appendChild(mkIconButton('fa-cog', 'Settings', () => openSettingsAlert()));
    sidebarEl.appendChild(actions);

    // ── Hover detection on the invisible strip (only attach once) ──
    if (hoverZone && !(hoverZone as any).__nyxEventsWired) {
        (hoverZone as any).__nyxEventsWired = true;
        hoverZone.addEventListener('mouseenter', () => { if (!sidebarVisible) show(); });
        hoverZone.addEventListener('mousemove', (e: MouseEvent) => { throttledHandleMouseMove(e.clientX); });
    }

    // Also detect mouse leaving the sidebar area (back into the game)
    if (sidebarEl && !(sidebarEl as any).__nyxEventsWired) {
        (sidebarEl as any).__nyxEventsWired = true;
        sidebarEl.addEventListener('mouseleave', (e: MouseEvent) => {
            // Only hide if the mouse went RIGHT (away from left edge)
            if (e.clientX > REVEAL_MARGIN + 60) hide();
        });
    }

    wireGameframes();
    if (!gameframeObserver) {
        gameframeObserver = new MutationObserver(() => wireGameframes());
        gameframeObserver.observe(document.documentElement, { childList: true, subtree: true });
    }

    document.addEventListener('nyx:modal-open', () => {
        modalOpen = true;
        forceHideSidebar();
    });
    document.addEventListener('nyx:modal-close', () => {
        modalOpen = false;
    });
};
