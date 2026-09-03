// inject.ts
import { waitForElement } from "./waitForElement";
import { setupUIElements } from "./ui/setupUIElements"
import { handleGameView } from "./handleview";
import { forceLowLatencyCanvasOff, injectTopLevelPerfStylesheet } from "./domopt";

async function init() {
    forceLowLatencyCanvasOff();
    injectTopLevelPerfStylesheet();
    await setupUIElements();

    // finally show window to user
    window.electronAPI.notifyReadyToShow();

    try {
        const targetElement = await waitForElement("div[class$='view']");

        const viewObserver = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (node instanceof Element && /^(dropdown|roomlist-view|room-view|game-view)/.test(node.className)) {
                        handleGameView(node.className);
                        return;
                    }
                }
            }
        });

        viewObserver.observe(targetElement.parentElement!, {
            characterData: false,
            childList: true,
            attributes: false,
            subtree: true
        });
        console.log("View observer started!");
    } catch (error) {
        console.error("Failed to initialize observer:", error);
    }
}

init();
