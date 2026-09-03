import { customAlert } from "../alerts";
import { URL } from "../constants";

export const aboutAlert = (): void => {
    customAlert(
        "About",
        `This app was developed by <b>@og9525</b> to improve the HaxBall experience, while keeping it faithful to the original.

        Unlike similar projects, it is open source and downloadable without any registration.

        Thank you for checking it out!

        Make sure you only download this app from the official website:
        <a target="_blank" href=${URL.website}>${URL.website}</a>

        Join the official Discord server:
        <a target="_blank" href=${URL.discord}/>${URL.discord}</a>

        <b>Credits</b>
        - <a target="_blank" href=https://github.com/electron/electron>Electron</a>, for making this app's creation easy
        - <a target="_blank" href=https://github.com/xenonsb/Haxball-Room-Extension>All-in-one Tool</a>, for improving HaxBall and open sourcing their code`,
        []
    );
}

export const helpAlert = (): void => {
    const officialWebsiteButton = document.createElement('button');
    officialWebsiteButton.innerText = 'Website';
    officialWebsiteButton.onclick = () => {
        window.open(URL.website, "_blank");
    };

    const discordButton = document.createElement('button');
    discordButton.innerText = 'Discord';
    discordButton.onclick = () => {
        window.open(URL.discord, "_blank");
    };

    customAlert(
        "Help",
        `Visit the official website or our Discord server.
        `,
        [officialWebsiteButton, discordButton]
    )
}


// ============================================================================
// HEADER REMOVAL (once and for all)
// ============================================================================
//
// He asked to remove the header entirely. There were TWO headers:
//   1. HaxBall's in-page .header (room buttons at the top of the page).
//   2. Our #nyx-titlebar overlay (the auto-hide top bar with caption buttons).
//
// Both are now gone. HaxBall's .header is hidden (display:none) and we NO
// LONGER build the #nyx-titlebar overlay -- the left-edge sidebar
// (setupSidebar.ts) carries all the actions (min/max/close, profile, join,
// settings, about, help, fps). The window controls that used to live in the
// titlebar are on the sidebar. The game owns 100% of the viewport.

const TITLEBAR_HEIGHT = 0;
let titlebarEl: HTMLDivElement | null = null;
let headerIsCurrentlyVisible = false;
let autoHideTimeout: number | null = null;
let isAutoHideEnabled = true;

const showTitlebar = () => { headerIsCurrentlyVisible = true; };
const hideTitlebar = () => { headerIsCurrentlyVisible = false; };

const handleMouseMove = (_clientY: number) => {};

const attachGameframeMouseForwarder = (_gameframe: HTMLIFrameElement) => {};

const setupAutoHide = () => {};

export const toggleHeaderVisibility = (): void => {
    if (headerIsCurrentlyVisible) hideTitlebar(); else showTitlebar();
};

export const adjustGameAreaForHeader = (_headerVisible: boolean) => {
    // No-op: there is no header anymore. The gameframe always owns 100% of the
    // viewport. Kept as an export because handleview.ts still calls it.
};

export const setupCustomHeader = (): void => {
    // The .header is hidden via a <style> injected at document_start (preload.js)
    // so it never flashes. This function is a belt-and-suspenders backup that
    // hides it immediately (no waiting) and keeps hiding it if HaxBall
    // (re)creates it — e.g. on a gameframe reload for script injection.

    // Load Font Awesome once (the sidebar icons need it).
    if (!document.getElementById('font-awesome-4')) {
        const fa = document.createElement('link');
        fa.id = 'font-awesome-4';
        fa.rel = 'stylesheet';
        fa.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/css/font-awesome.min.css';
        document.head.appendChild(fa);
    }

    const hideHeader = () => {
        const haxballHeader = document.getElementsByClassName("header")[0] as HTMLElement | undefined;
        if (haxballHeader) {
            haxballHeader.style.display = 'none';
            haxballHeader.style.height = '0px';
            haxballHeader.style.overflow = 'hidden';
        }
    };
    hideHeader();
    // Belt-and-suspenders: if the header is created after this runs (e.g. on a
    // script-triggered reload), keep it hidden the moment it appears.
    const obs = new MutationObserver(hideHeader);
    obs.observe(document.documentElement, { childList: true, subtree: true });
};

export const setupWindowResizeHandler = () => {
    window.addEventListener('resize', () => {
        // Overlay is position: fixed; nothing to re-layout on resize.
    });
};
