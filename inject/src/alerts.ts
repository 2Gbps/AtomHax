export const ensureAlertStyles = (): void => {
    if (document.getElementById('custom-alert-style')) return;
    const style = document.createElement('style');
    style.id = 'custom-alert-style';
    style.innerHTML = `
            #custom-alert {
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%) scale(0.8);
                display: none;
                z-index: 2147483645;
                background: linear-gradient(
                    135deg,
                    rgba(27, 33, 37, 0.85) 0%,
                    rgba(27, 33, 37, 0.7) 50%,
                    rgba(27, 33, 37, 0.8) 100%
                );
                backdrop-filter: blur(20px) saturate(1.8);
                -webkit-backdrop-filter: blur(20px) saturate(1.8);
                border: 1px solid rgba(255,255,255,0.12);
                border-radius: 14px;
                padding: 24px 24px 32px 24px;
                box-shadow:
                    0 8px 32px rgba(0,0,0,0.4),
                    inset 0 1px 0 rgba(255,255,255,0.08),
                    inset 0 -1px 0 rgba(0,0,0,0.1),
                    0 0 60px rgba(0,0,0,0.15);
                color: white;
                max-width: 500px;
                width: 90%;
                text-align: center;
                transition: opacity 0.3s ease, transform 0.3s ease;
                opacity: 0;
                -webkit-font-smoothing: antialiased;
            }
            #custom-alert h1 {
                margin: 0 0 10px 0;
                font-size: 24px;
                font-weight: bold;
                text-align: left;
                text-shadow: 0 1px 2px rgba(0,0,0,0.3);
            }
            #custom-alert hr {
                border: none;
                border-top: 1px solid rgba(255,255,255,0.1);
                margin: 0 0 20px 0;
            }
            #custom-alert-message {
                font-size: 15px;
                margin-bottom: 20px;
                text-align: left;
            }
            #custom-alert-message a {
                color: #ffe7cc;
            }
            #custom-alert-message b, #custom-alert-message strong {
                font-weight: bold;
            }
            #custom-alert-message i {
                font-style: italic;
            }
            #custom-alert-message a:hover {
                color: #ffe7cc;
                text-decoration: underline;
                transition: text-decoration 0.2s ease;
            }
            #custom-alert-buttons {
                display: flex;
                justify-content: center;
                gap: 10px;
                flex-wrap: wrap;
            }
            #custom-alert-buttons button {
                padding: 8px 16px;
                font-size: 15px;
                font-weight: bold;
                border: 1px solid rgba(255,255,255,0.1);
                border-radius: 8px;
                background: linear-gradient(135deg, rgba(36,73,103,0.8) 0%, rgba(36,73,103,0.6) 100%);
                backdrop-filter: blur(8px);
                -webkit-backdrop-filter: blur(8px);
                color: white;
                cursor: pointer;
                transition: background 0.2s ease, transform 0.15s ease, box-shadow 0.2s ease;
                box-shadow: 0 2px 8px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.08);
            }
            #custom-alert-buttons button:hover {
                background: linear-gradient(135deg, rgba(59,93,130,0.9) 0%, rgba(59,93,130,0.7) 100%);
                box-shadow: 0 4px 12px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.1);
                transform: translateY(-1px);
            }
            #blur-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.45);
                backdrop-filter: blur(12px);
                -webkit-backdrop-filter: blur(12px);
                z-index: 2147483644;
                display: none;
                opacity: 0;
                transition: opacity 0.3s ease;
                cursor: pointer;
            }
            #custom-alert-close {
                position: absolute;
                top: 10px;
                right: 15px;
                background: none;
                border: none;
                color: rgba(255,255,255,0.6);
                font-size: 20px;
                cursor: pointer;
                font-weight: bold;
                transition: color 0.15s ease, transform 0.15s ease;
            }
            #custom-alert-close:hover {
                color: #fff;
                transform: scale(1.2);
            }
        `;
    document.head.appendChild(style);
};

export const customAlert = (title: string, message: string | HTMLElement, buttons: Array<HTMLButtonElement> = []): void => {
    ensureAlertStyles();

    let blurOverlay = document.getElementById('blur-overlay');
    if (!blurOverlay) {
        blurOverlay = document.createElement('div');
        blurOverlay.id = 'blur-overlay';
        document.body.appendChild(blurOverlay);
    }

    blurOverlay.onclick = () => {
        closeCustomAlert();
    };

    let existing = document.getElementById('custom-alert');
    if (existing) {
        existing.remove();
    }

    const container = document.createElement('div');
    container.id = 'custom-alert';
    container.innerHTML = `
            <button id="custom-alert-close">&times;</button>
            <h1>${title}</h1>
            <hr>
            <div id="custom-alert-message"></div>
            <div id="custom-alert-buttons"></div>
        `;
    const messageContainer = container.querySelector('#custom-alert-message');
    if (typeof message === "string") {
        messageContainer.innerHTML = message.replace(/\n/g, "<br>");
    } else {
        messageContainer.innerHTML = "";
        messageContainer.appendChild(message);
    }
    document.body.appendChild(container);

    const buttonContainer = container.querySelector('#custom-alert-buttons');
    buttons.forEach(btn => buttonContainer!.appendChild(btn));

    blurOverlay.style.display = 'block';
    container.style.display = 'block';
    requestAnimationFrame(() => {
        blurOverlay.style.opacity = '1';
        container.style.opacity = '1';
        container.style.transform = 'translate(-50%, -50%) scale(1)';
    });
    document.body.style.overflow = 'hidden';

    blurGameframe();

    const closeButton = container.querySelector('#custom-alert-close');
    closeButton!.onclick = () => {
        closeCustomAlert();
    };

    const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            e.stopPropagation();
            closeCustomAlert();
        }
    };
    document.addEventListener('keydown', onKey, true);
    (container as any)._onEsc = onKey;

    document.dispatchEvent(new CustomEvent('nyx:modal-open'));
};

export const closeCustomAlert = (): void => {
    const container = document.getElementById('custom-alert') as HTMLDivElement;
    const blurOverlay = document.getElementById('blur-overlay');
    if (!container) return;

    if (blurOverlay) {
        blurOverlay.style.opacity = '0';
        setTimeout(() => {
            blurOverlay.style.display = 'none';
        }, 300);
    }

    clearGameframeBlur();

    container.style.opacity = '0';
    container.style.transform = 'translate(-50%, -50%) scale(0.8)';

    setTimeout(() => {
        if (container._onEsc) document.removeEventListener('keydown', container._onEsc, true);
        container.remove();
        document.body.style.overflow = '';
    }, 300);

    document.dispatchEvent(new CustomEvent('nyx:modal-close'));
};

const blurGameframe = (): void => {
    const frames = document.querySelectorAll<HTMLElement>('iframe.gameframe, iframe');
    for (let i = 0; i < frames.length; i++) {
        frames[i].classList.add('nyx-modal-blur');
    }
};

const clearGameframeBlur = (): void => {
    const frames = document.querySelectorAll<HTMLElement>('iframe.gameframe, iframe');
    for (let i = 0; i < frames.length; i++) {
        frames[i].classList.remove('nyx-modal-blur');
    }
};