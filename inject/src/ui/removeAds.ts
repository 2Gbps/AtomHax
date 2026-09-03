export const removeAds = (): void => {
	// removes ads — instantly and keeps them gone if HaxBall recreates the node.
    const clear = () => {
        const rb = document.getElementsByClassName("rightbar")[0] as HTMLElement | undefined;
        if (rb) rb.innerHTML = "";
    };
    clear();
    const obs = new MutationObserver(clear);
    obs.observe(document.documentElement, { childList: true, subtree: true });
};