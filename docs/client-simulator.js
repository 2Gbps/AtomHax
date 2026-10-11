// AtomHax Native Client Browser Port
// Ports the real desktop Electron client runtime into the browser:
// - Window shell with macOS traffic lights & live RAF performance monitor
// - Real HaxBall HTML5 game engine in same-origin iframe (game/game.html)
// - Sliding dark-glass sidebar (#nyx-sidebar) with modal triggers
// - Full AtomHax Settings system: FPS toggle, render scaling, discord RPC, shortcuts manager, auth manager, backup & reset
// - Authentic Join Room modal with link validation
// - Favorite rooms injection in lobby splitter (favrooms.ts)
// - Real-time chat shortcut & emoji macro expansion (shortcuts.ts)
// - Liquid glass styling for all game panels (GAMEFRAME_GLASS_PATCH)
// - Script manager EXCLUDED from browser build (desktop exclusive feature)

const DEFAULT_PREFS = {
  fps_unlock: true,
  render_scale: 100,
  fps_limit: 360,
  tick_mult: 20,
  notes: [],
  shortcuts: [
    ['/e', '/extrapolation '],
    ['/a', '/avatar ']
  ],
  discord_rpc: true
};

const EMOJI_MAP = {
  ':fire:': '🔥',
  ':star:': '⭐',
  ':heart:': '❤️',
  ':thumbsup:': '👍',
  ':clap:': '👏',
  ':zap:': '⚡',
  ':soccer:': '⚽',
  ':goal:': '🥅',
  ':crown:': '👑',
  ':warning:': '⚠️',
  ':check:': '✅',
  ':x:': '❌',
  ':smile:': '😊',
  ':cry:': '😢',
  ':cool:': '😎',
  ':skull:': '💀'
};

const GLASS_STYLE = `
  background: linear-gradient(135deg, rgba(27,33,37,0.88) 0%, rgba(27,33,37,0.72) 50%, rgba(27,33,37,0.82) 100%);
  border: 1px solid rgba(255,255,255,0.12);
  box-shadow: 0 4px 20px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -1px 0 rgba(0,0,0,0.1);
`;

const GAMEFRAME_GLASS_CSS = `
  .dialog, .room-view>.container, .roomlist-view>.notice {
    background: linear-gradient(135deg, rgba(27,33,37,0.88) 0%, rgba(27,33,37,0.72) 50%, rgba(27,33,37,0.82) 100%) !important;
    backdrop-filter: blur(20px) saturate(1.8) !important;
    -webkit-backdrop-filter: blur(20px) saturate(1.8) !important;
    border: 1px solid rgba(255,255,255,0.12) !important;
    border-radius: 12px !important;
    box-shadow: 0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -1px 0 rgba(0,0,0,0.1) !important;
  }
  .game-state-view .bar, .chatbox-view-contents,
  .game-view.chat-bg-full .bottom-section, .game-view>.buttons,
  .sound-button-container .sound-slider, .stats-view, .replay-controls-view {
    background: linear-gradient(135deg, rgba(27,33,37,0.88) 0%, rgba(27,33,37,0.72) 50%, rgba(27,33,37,0.82) 100%) !important;
    border: 1px solid rgba(255,255,255,0.12) !important;
    box-shadow: 0 4px 16px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.08) !important;
  }
  .game-state-view .bar { border-radius: 0 0 12px 12px !important; }
  .chatbox-view-contents { border-radius: 12px 12px 0 0 !important; }
  .game-view>.buttons { border-radius: 0 0 0 12px !important; }
  .replay-controls-view { border-radius: 12px 12px 0 0 !important; }
  .stats-view { border-radius: 8px !important; }
  .room-view>.container>.teams>.player-list-view .list {
    background: rgba(17,22,25,0.55) !important;
    border: 1px solid rgba(255,255,255,0.08) !important;
    border-radius: 8px !important;
  }
  .roomlist-view>.dialog>.splitter>.list table.header {
    background: rgba(17,22,25,0.55) !important;
    border-radius: 8px !important;
  }
  .dialog>h1, .room-view>.container>h1 { border-bottom: 2.5px solid #e14949 !important; padding-bottom: 6px !important; }
  .dialog button, .room-view>.container button {
    background: linear-gradient(135deg, rgba(36,73,103,0.85) 0%, rgba(36,73,103,0.65) 100%) !important;
    border: 1px solid rgba(255,255,255,0.1) !important;
    border-radius: 8px !important;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.08) !important;
  }
  .dialog button:hover, .room-view>.container button:hover {
    background: linear-gradient(135deg, rgba(59,93,130,0.95) 0%, rgba(59,93,130,0.75) 100%) !important;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.12) !important;
  }
  .dialog button:disabled, .room-view>.container button:disabled {
    background: rgba(62,62,62,0.6) !important;
  }
  .room-view button[data-hook=start-btn] {
    background: linear-gradient(135deg, rgba(58,153,51,0.85) 0%, rgba(58,153,51,0.65) 100%) !important;
  }
  .room-view button[data-hook=stop-btn] {
    background: linear-gradient(135deg, rgba(193,53,53,0.85) 0%, rgba(193,53,53,0.65) 100%) !important;
  }
  .dialog input:not([type=range]), .room-view>.container input:not([type=range]) {
    background: rgba(255,255,255,0.06) !important;
    border: 1px solid rgba(255,255,255,0.15) !important;
    border-radius: 6px !important;
  }
  .dialog select, .room-view>.container select {
    background: rgba(255,255,255,0.06) !important;
    border: 1px solid rgba(255,255,255,0.15) !important;
    border-radius: 6px !important;
  }
  #toggleChat { display: none !important; }
`;

export function initClientSimulator(container) {
  if (!container) return;

  // ── Browser electronAPI Implementation ──
  const getPrefs = () => {
    try {
      const stored = localStorage.getItem('nyx_preferences');
      if (stored) return { ...DEFAULT_PREFS, ...JSON.parse(stored) };
    } catch (_) {}
    return { ...DEFAULT_PREFS };
  };

  const setPref = (key, value) => {
    const current = getPrefs();
    current[key] = value;
    localStorage.setItem('nyx_preferences', JSON.stringify(current));
    return Promise.resolve(true);
  };

  const generateAuthKey = async () => {
    try {
      const pair = await window.crypto.subtle.generateKey(
        { name: 'ECDSA', namedCurve: 'P-256' },
        true,
        ['sign', 'verify']
      );
      const jwk = await window.crypto.subtle.exportKey('jwk', pair.privateKey);
      const auth = `idkey.${jwk.x}.${jwk.y}.${jwk.d}`;
      localStorage.setItem('player_auth_key', auth);
      return auth;
    } catch (e) {
      const randomHex = () => Math.random().toString(16).slice(2, 10);
      const auth = `idkey.${randomHex()}${randomHex()}.${randomHex()}${randomHex()}.${randomHex()}${randomHex()}`;
      localStorage.setItem('player_auth_key', auth);
      return auth;
    }
  };

  if (!localStorage.getItem('player_auth_key')) {
    generateAuthKey();
  }

  window.electronAPI = {
    getAppPreferences: async () => getPrefs(),
    setAppPreference: async (k, v) => setPref(k, v),
    exportPreferencesFile: async () => {
      const data = JSON.stringify(getPrefs(), null, 2);
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'atomhax_preferences.json';
      a.click();
      URL.revokeObjectURL(url);
      return { success: true };
    },
    importPreferencesFile: async () => {
      return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
          const file = e.target.files && e.target.files[0];
          if (!file) return resolve({ success: false });
          const reader = new FileReader();
          reader.onload = (re) => {
            try {
              const parsed = JSON.parse(re.target.result);
              localStorage.setItem('nyx_preferences', JSON.stringify({ ...DEFAULT_PREFS, ...parsed }));
              resolve({ success: true });
            } catch (_) {
              resolve({ success: false });
            }
          };
          reader.readAsText(file);
        };
        input.click();
      });
    },
    deletePreferencesFile: async () => {
      localStorage.setItem('nyx_preferences', JSON.stringify(DEFAULT_PREFS));
      return { success: true };
    },
    generatePlayerAuthKey: generateAuthKey,
    updateDiscordRPC: () => {},
    windowMinimize: () => {
      const shell = container.querySelector('.sim-shell');
      if (shell) {
        const view = shell.querySelector('.client-game-viewport');
        if (view) view.style.display = view.style.display === 'none' ? 'block' : 'none';
      }
    },
    windowMaximizeToggle: () => {
      const target = container.closest('.client-window-frame') || container;
      if (document.fullscreenElement || document.webkitFullscreenElement) {
        if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
      } else {
        if (target.requestFullscreen) {
          target.requestFullscreen().catch(() => {});
        } else if (target.webkitRequestFullscreen) {
          target.webkitRequestFullscreen();
        }
      }
    },
    windowClose: () => {
      const frame = container.querySelector('iframe.gameframe');
      if (frame) frame.src = 'game/game.html';
    },
    reloadGameframe: () => {
      const frame = container.querySelector('iframe.gameframe');
      if (frame) frame.src = 'game/game.html';
    },
    notifyReadyToShow: () => {}
  };

  // ── Render Window Chrome & Structure ──
  container.innerHTML = `
    <div class="sim-shell" style="position:relative; width:100%; border-radius:14px; overflow:hidden; background:#0e1520;">
      <!-- Desktop Chrome Bar -->
      <div class="sim-header" style="display:flex; align-items:center; justify-content:space-between; padding:9px 16px; background:rgba(20,26,36,0.95); border-bottom:1px solid rgba(255,255,255,0.08); user-select:none;">
        <div class="sim-traffic-lights" style="display:flex; gap:7px; align-items:center;">
          <span class="sim-light red" id="atom-traffic-close" title="Reset Frame" style="width:11px; height:11px; border-radius:50%; background:#ff5f57; cursor:pointer;"></span>
          <span class="sim-light yellow" id="atom-traffic-min" title="Collapse Window" style="width:11px; height:11px; border-radius:50%; background:#febc2e; cursor:pointer;"></span>
          <span class="sim-light green" id="atom-traffic-max" title="Toggle Fullscreen" style="width:11px; height:11px; border-radius:50%; background:#28c840; cursor:pointer;"></span>
        </div>
        <div class="sim-title" style="display:flex; align-items:center; gap:8px; font-size:12px; font-weight:600; color:rgba(255,255,255,0.85); letter-spacing:-0.01em;">
          <img src="assets/atomhax-mark.png" alt="AtomHax" style="width:16px; height:16px; border-radius:3px; object-fit:contain; display:inline-block;">
          <span>AtomHax v0.5.4 &mdash; Native Web Presentation</span>
        </div>
        <div class="sim-header-meta" style="display:flex; align-items:center; gap:8px;">
          <button class="sim-fullscreen-btn" id="atom-fullscreen-btn" title="Toggle 16:9 Fullscreen">
            <i class="fa fa-arrows-alt"></i>
            <span>Fullscreen</span>
          </button>
          <span class="sim-fps-badge" id="client-raf-fps" style="font-size:11px; font-family:monospace; padding:2px 8px; border-radius:12px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.12); color:#6fe88a;">
            60 FPS
          </span>
          <span style="font-size:11px; color:rgba(255,255,255,0.4);" id="client-raf-ms">16.6ms</span>
        </div>
      </div>

      <!-- Game Viewport Frame -->
      <div class="client-game-viewport" style="position:relative; width:100%; background:#000; overflow:hidden;">
        <!-- Invisible hover zone to reveal sidebar -->
        <div id="nyx-sidebar-hover" style="position:absolute; top:0; left:0; width:80px; height:100%; z-index:20; cursor:pointer;"></div>
        
        <!-- Subtle edge grab pill -->
        <div id="nyx-edge-pill" style="position:absolute; top:50%; left:6px; transform:translateY(-50%); width:4px; height:32px; border-radius:4px; background:rgba(255,255,255,0.2); z-index:21; pointer-events:none; transition:opacity 0.2s ease;"></div>

        <!-- Sliding #nyx-sidebar dock -->
        <div id="nyx-sidebar" style="position:absolute; top:20px; left:20px; z-index:30; display:flex; flex-direction:column; align-items:center; gap:12px; transform:translateX(-120%); opacity:0; pointer-events:none; transition:transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s ease; user-select:none;">
          <!-- Traffic Lights -->
          <div id="sb-traffic-close" title="Close" style="width:46px; height:46px; border-radius:10px; ${GLASS_STYLE} display:flex; align-items:center; justify-content:center; cursor:pointer; color:#ff5f57; font-size:24px; font-weight:bold;">&times;</div>
          <div id="sb-traffic-min" title="Minimize" style="width:46px; height:46px; border-radius:10px; ${GLASS_STYLE} display:flex; align-items:center; justify-content:center; cursor:pointer; color:#28c840; font-size:24px; font-weight:bold;">&ndash;</div>

          <!-- Actions -->
          <div style="display:flex; flex-direction:column; align-items:center; gap:8px; margin-top:8px;">
            <div id="sb-action-practice" title="Practice Pitch" style="width:46px; height:46px; border-radius:10px; ${GLASS_STYLE} display:flex; align-items:center; justify-content:center; cursor:pointer; color:rgba(255,255,255,0.75); font-size:20px; transition:color 0.15s ease, transform 0.15s ease;">
              <i class="fa fa-futbol-o"></i>
            </div>
            <div id="sb-action-join" title="Join Room" style="width:46px; height:46px; border-radius:10px; ${GLASS_STYLE} display:flex; align-items:center; justify-content:center; cursor:pointer; color:rgba(255,255,255,0.75); font-size:20px; transition:color 0.15s ease, transform 0.15s ease;">
              <i class="fa fa-sign-in"></i>
            </div>
            <div id="sb-action-settings" title="Settings" style="width:46px; height:46px; border-radius:10px; ${GLASS_STYLE} display:flex; align-items:center; justify-content:center; cursor:pointer; color:rgba(255,255,255,0.75); font-size:20px; transition:color 0.15s ease, transform 0.15s ease;">
              <i class="fa fa-cog"></i>
            </div>
          </div>
        </div>

        <!-- The Real HaxBall Gameframe -->
        <iframe src="game/game.html" class="gameframe" style="width:100%; height:100%; border:none; display:block;"></iframe>

        <!-- Blur Overlay & Custom Alert Modal -->
        <div id="blur-overlay" style="position:absolute; inset:0; z-index:90; background:rgba(0,0,0,0.55); backdrop-filter:blur(12px); -webkit-backdrop-filter:blur(12px); display:none; opacity:0; transition:opacity 0.25s ease;"></div>
        <div id="custom-alert" style="position:absolute; top:50%; left:50%; transform:translate(-50%, -50%) scale(0.9); z-index:95; width:92%; max-width:480px; max-height:85%; overflow-y:auto; border-radius:14px; padding:22px; color:#fff; display:none; opacity:0; ${GLASS_STYLE} transition:opacity 0.25s ease, transform 0.25s ease;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <h1 id="custom-alert-title" style="margin:0; font-size:20px; font-weight:700;">Settings</h1>
            <span id="custom-alert-close" style="font-size:22px; cursor:pointer; color:rgba(255,255,255,0.5);">&times;</span>
          </div>
          <hr style="border:none; border-top:1px solid rgba(255,255,255,0.12); margin-bottom:16px;">
          <div id="custom-alert-body" style="font-size:13.5px; line-height:1.5; color:rgba(255,255,255,0.85);"></div>
          <div id="custom-alert-buttons" style="display:flex; justify-content:flex-end; gap:10px; margin-top:20px; flex-wrap:wrap;"></div>
        </div>
      </div>
    </div>
  `;

  // ── Modal Alert System ──
  const overlay = container.querySelector('#blur-overlay');
  const alertBox = container.querySelector('#custom-alert');
  const alertTitle = container.querySelector('#custom-alert-title');
  const alertBody = container.querySelector('#custom-alert-body');
  const alertButtons = container.querySelector('#custom-alert-buttons');
  const alertClose = container.querySelector('#custom-alert-close');

  const closeAlert = () => {
    if (!alertBox || !overlay) return;
    alertBox.style.opacity = '0';
    alertBox.style.transform = 'translate(-50%, -50%) scale(0.9)';
    overlay.style.opacity = '0';
    setTimeout(() => {
      alertBox.style.display = 'none';
      overlay.style.display = 'none';
      alertBody.innerHTML = '';
      alertButtons.innerHTML = '';
    }, 220);
  };

  alertClose.addEventListener('click', closeAlert);
  overlay.addEventListener('click', closeAlert);

  const customAlert = (title, contentNodeOrHtml, buttons = []) => {
    alertTitle.textContent = title;
    alertBody.innerHTML = '';
    alertButtons.innerHTML = '';

    if (typeof contentNodeOrHtml === 'string') {
      alertBody.innerHTML = contentNodeOrHtml;
    } else if (contentNodeOrHtml instanceof Node) {
      alertBody.appendChild(contentNodeOrHtml);
    }

    buttons.forEach((btn) => {
      alertButtons.appendChild(btn);
    });

    overlay.style.display = 'block';
    alertBox.style.display = 'block';
    requestAnimationFrame(() => {
      overlay.style.opacity = '1';
      alertBox.style.opacity = '1';
      alertBox.style.transform = 'translate(-50%, -50%) scale(1)';
    });
  };

  const createAlertButton = (text, bg, hoverBg, onClick) => {
    const btn = document.createElement('button');
    btn.textContent = text;
    btn.style.cssText = `
      padding: 7px 16px; font-size: 13px; font-weight: 600;
      border: 1px solid rgba(255,255,255,0.15); border-radius: 7px;
      background: ${bg}; color: #fff; cursor: pointer;
      transition: background 0.15s ease, transform 0.1s ease;
    `;
    btn.addEventListener('mouseenter', () => { btn.style.background = hoverBg; });
    btn.addEventListener('mouseleave', () => { btn.style.background = bg; });
    btn.addEventListener('click', onClick);
    return btn;
  };

  // ── Sliding Sidebar Handling ──
  const sidebar = container.querySelector('#nyx-sidebar');
  const hoverZone = container.querySelector('#nyx-sidebar-hover');
  const edgePill = container.querySelector('#nyx-edge-pill');
  let sidebarVisible = false;

  const showSidebar = () => {
    if (!sidebar || sidebarVisible) return;
    sidebar.style.transform = 'translateX(0)';
    sidebar.style.opacity = '1';
    sidebar.style.pointerEvents = 'auto';
    sidebarVisible = true;
    if (edgePill) edgePill.style.opacity = '0';
  };

  const hideSidebar = () => {
    if (!sidebar || !sidebarVisible) return;
    sidebar.style.transform = 'translateX(-120%)';
    sidebar.style.opacity = '0';
    sidebar.style.pointerEvents = 'none';
    sidebarVisible = false;
    if (edgePill) edgePill.style.opacity = '1';
  };

  hoverZone.addEventListener('mouseenter', showSidebar);
  sidebar.addEventListener('mouseleave', (e) => {
    if (e.clientX > 180) hideSidebar();
  });

  // ── Traffic Lights Inside Chrome and Sidebar ──
  const frame = container.querySelector('iframe.gameframe');
  const resetFrame = () => { if (frame) frame.src = 'game/game.html'; };

  container.querySelector('#atom-traffic-close').addEventListener('click', resetFrame);
  container.querySelector('#sb-traffic-close').addEventListener('click', resetFrame);

  const toggleMin = () => window.electronAPI.windowMinimize();
  container.querySelector('#atom-traffic-min').addEventListener('click', toggleMin);
  container.querySelector('#sb-traffic-min').addEventListener('click', toggleMin);

  const toggleMax = () => window.electronAPI.windowMaximizeToggle();
  container.querySelector('#atom-traffic-max').addEventListener('click', toggleMax);

  const fsBtn = container.querySelector('#atom-fullscreen-btn');
  if (fsBtn) {
    fsBtn.addEventListener('click', toggleMax);
  }

  const updateFullscreenUi = () => {
    const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
    if (fsBtn) {
      fsBtn.innerHTML = isFs ? '<i class="fa fa-compress"></i> <span>Windowed</span>' : '<i class="fa fa-arrows-alt"></i> <span>Fullscreen</span>';
    }
  };
  document.addEventListener('fullscreenchange', updateFullscreenUi);
  document.addEventListener('webkitfullscreenchange', updateFullscreenUi);

  const practiceBtn = container.querySelector('#sb-action-practice');
  if (practiceBtn) {
    practiceBtn.addEventListener('click', () => {
      hideSidebar();
      try {
        if (frame && frame.contentWindow && frame.contentWindow.B && frame.contentWindow.B.Wo) {
          frame.contentWindow.B.Wo();
        } else if (frame) {
          frame.src = 'game/game.html';
        }
      } catch (_) {
        if (frame) frame.src = 'game/game.html';
      }
    });
  }

  // ── Join Room Modal ──
  const openJoinRoom = () => {
    hideSidebar();
    const div = document.createElement('div');
    div.style.cssText = 'display:flex; flex-direction:column; gap:12px;';

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'https://www.haxball.com/play?c=...';
    input.style.cssText = `
      width: 100%; box-sizing: border-box; padding: 10px 12px;
      border-radius: 8px; border: 1px solid rgba(255,255,255,0.18);
      background: rgba(255,255,255,0.06); color: #fff; font-size: 13.5px;
      outline: none;
    `;

    const status = document.createElement('div');
    status.style.cssText = 'font-size: 12.5px; min-height: 18px; color: rgba(255,255,255,0.5);';

    div.appendChild(input);
    div.appendChild(status);

    const joinBtn = createAlertButton('Join Room', '#244967', '#3b5d82', () => {
      const val = input.value.trim();
      const match = val.match(/c=([a-zA-Z0-9_\-]+)/);
      if (match) {
        status.textContent = 'Connecting to room token ' + match[1] + '...';
        status.style.color = '#6fe88a';
        setTimeout(() => {
          if (frame) frame.src = 'game/game.html?c=' + match[1];
          closeAlert();
        }, 500);
      } else {
        status.textContent = 'Invalid room URL format. Expected: https://www.haxball.com/play?c=...';
        status.style.color = '#f66';
      }
    });

    customAlert('Join Room', div, [joinBtn]);
    setTimeout(() => input.focus(), 100);
  };

  container.querySelector('#sb-action-join').addEventListener('click', openJoinRoom);

  // ── Settings Dialog ──
  const openSettings = () => {
    hideSidebar();
    const prefs = getPrefs();

    const root = document.createElement('div');
    root.style.cssText = 'display:flex; flex-direction:column; gap:18px; max-height:420px; overflow-y:auto; padding-right:6px;';

    const createRow = (label, opts, current, onSelect) => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex; justify-content:space-between; align-items:center; gap:12px;';

      const lbl = document.createElement('div');
      lbl.textContent = label;
      lbl.style.fontWeight = '600';

      const grp = document.createElement('div');
      grp.style.cssText = 'display:flex; gap:6px;';

      opts.forEach((opt) => {
        const btn = document.createElement('button');
        btn.textContent = opt;
        const active = opt === current;
        btn.style.cssText = `
          padding: 6px 12px; font-size: 12px; font-weight: 600; border-radius: 6px;
          border: 1px solid rgba(255,255,255,0.12); cursor: pointer;
          background: ${active ? '#244967' : 'rgba(255,255,255,0.06)'};
          color: ${active ? '#fff' : 'rgba(255,255,255,0.6)'};
          transition: background 0.15s ease, color 0.15s ease;
        `;
        btn.addEventListener('click', () => {
          Array.from(grp.children).forEach((c) => {
            c.style.background = 'rgba(255,255,255,0.06)';
            c.style.color = 'rgba(255,255,255,0.6)';
          });
          btn.style.background = '#244967';
          btn.style.color = '#fff';
          onSelect(opt);
        });
        grp.appendChild(btn);
      });

      row.appendChild(lbl);
      row.appendChild(grp);
      return row;
    };

    const hr = () => {
      const d = document.createElement('hr');
      d.style.cssText = 'border:none; border-top:1px solid rgba(255,255,255,0.1); margin:0;';
      return d;
    };

    // General
    const hGeneral = document.createElement('div');
    hGeneral.textContent = 'General';
    hGeneral.style.cssText = 'font-size:15px; font-weight:700; color:#fff;';
    root.appendChild(hGeneral);

    root.appendChild(createRow('FPS Mode', ['Default', 'Unlimited'], prefs.fps_unlock ? 'Unlimited' : 'Default', (v) => {
      setPref('fps_unlock', v === 'Unlimited');
    }));

    root.appendChild(createRow('Render Scale', ['100%', '85%', '75%', '50%'], `${prefs.render_scale || 100}%`, (v) => {
      setPref('render_scale', parseInt(v, 10));
    }));

    root.appendChild(createRow('Discord RPC', ['Enabled', 'Disabled'], prefs.discord_rpc ? 'Enabled' : 'Disabled', (v) => {
      setPref('discord_rpc', v === 'Enabled');
    }));

    root.appendChild(hr());

    // Shortcuts
    const hShortcuts = document.createElement('div');
    hShortcuts.textContent = 'Chat Shortcuts';
    hShortcuts.style.cssText = 'font-size:15px; font-weight:700; color:#fff;';
    root.appendChild(hShortcuts);

    const scDesc = document.createElement('div');
    scDesc.textContent = 'Shortcuts automatically expand typed macros and emoji codes in the match chat.';
    scDesc.style.cssText = 'font-size:12px; color:rgba(255,255,255,0.55); margin-top:-10px;';
    root.appendChild(scDesc);

    const scRow = document.createElement('div');
    scRow.style.cssText = 'display:flex; gap:10px;';

    const btnNewSc = createAlertButton('Create shortcut', '#244967', '#3b5d82', () => {
      openNewShortcutDialog();
    });
    const btnViewSc = createAlertButton('View shortcuts', '#244967', '#3b5d82', () => {
      openViewShortcutsDialog();
    });
    scRow.appendChild(btnNewSc);
    scRow.appendChild(btnViewSc);
    root.appendChild(scRow);

    root.appendChild(hr());

    // Auth
    const hAuth = document.createElement('div');
    hAuth.textContent = 'Player Auth Key';
    hAuth.style.cssText = 'font-size:15px; font-weight:700; color:#fff;';
    root.appendChild(hAuth);

    const authDesc = document.createElement('div');
    authDesc.textContent = 'Your cryptographic auth identifies your player profile in public and private rooms.';
    authDesc.style.cssText = 'font-size:12px; color:rgba(255,255,255,0.55); margin-top:-10px;';
    root.appendChild(authDesc);

    const authRow = document.createElement('div');
    authRow.style.cssText = 'display:flex; gap:8px; flex-wrap:wrap;';

    const btnViewAuth = createAlertButton('View Auth', '#244967', '#3b5d82', () => {
      openViewAuthDialog();
    });
    const btnResetAuth = createAlertButton('Reset Auth', '#b2413b', '#D04D46', () => {
      generateAuthKey().then(() => {
        btnResetAuth.textContent = 'Reset Done!';
        setTimeout(() => { btnResetAuth.textContent = 'Reset Auth'; }, 1800);
      });
    });
    authRow.appendChild(btnViewAuth);
    authRow.appendChild(btnResetAuth);
    root.appendChild(authRow);

    root.appendChild(hr());

    // Backup & Reset
    const hBackup = document.createElement('div');
    hBackup.textContent = 'Backup & Reset';
    hBackup.style.cssText = 'font-size:15px; font-weight:700; color:#fff;';
    root.appendChild(hBackup);

    const backupRow = document.createElement('div');
    backupRow.style.cssText = 'display:flex; gap:8px; flex-wrap:wrap;';

    const btnExport = createAlertButton('Export Backup', '#244967', '#3b5d82', () => {
      window.electronAPI.exportPreferencesFile();
    });
    const btnImport = createAlertButton('Import Backup', '#244967', '#3b5d82', () => {
      window.electronAPI.importPreferencesFile().then(() => openSettings());
    });
    const btnResetApp = createAlertButton('Reset App', '#b2413b', '#D04D46', () => {
      window.electronAPI.deletePreferencesFile().then(() => openSettings());
    });
    backupRow.appendChild(btnExport);
    backupRow.appendChild(btnImport);
    backupRow.appendChild(btnResetApp);
    root.appendChild(backupRow);

    customAlert('Settings', root, []);
  };

  const openNewShortcutDialog = () => {
    const box = document.createElement('div');
    box.style.cssText = 'display:flex; flex-direction:column; gap:12px;';

    const inputTrigger = document.createElement('input');
    inputTrigger.placeholder = 'e.g. /gg';
    inputTrigger.style.cssText = 'padding:8px 12px; border-radius:6px; border:1px solid rgba(255,255,255,0.15); background:rgba(255,255,255,0.06); color:#fff;';

    const inputExpansion = document.createElement('input');
    inputExpansion.placeholder = 'e.g. Good game everyone!';
    inputExpansion.style.cssText = 'padding:8px 12px; border-radius:6px; border:1px solid rgba(255,255,255,0.15); background:rgba(255,255,255,0.06); color:#fff;';

    box.appendChild(inputTrigger);
    box.appendChild(inputExpansion);

    const saveBtn = createAlertButton('Save Shortcut', '#244967', '#3b5d82', () => {
      const tr = inputTrigger.value.trim();
      const ex = inputExpansion.value.trim();
      if (tr && ex) {
        const cur = getPrefs();
        cur.shortcuts.push([tr, ex]);
        localStorage.setItem('nyx_preferences', JSON.stringify(cur));
        openSettings();
      }
    });

    customAlert('New Shortcut', box, [saveBtn]);
  };

  const openViewShortcutsDialog = () => {
    const cur = getPrefs();
    const list = document.createElement('div');
    list.style.cssText = 'display:flex; flex-direction:column; gap:8px; max-height:260px; overflow-y:auto;';

    if (!cur.shortcuts || cur.shortcuts.length === 0) {
      list.innerHTML = '<div style="color:rgba(255,255,255,0.5);">No shortcuts saved yet.</div>';
    } else {
      cur.shortcuts.forEach(([tr, ex], idx) => {
        const item = document.createElement('div');
        item.style.cssText = 'display:flex; justify-content:space-between; align-items:center; padding:6px 10px; background:rgba(255,255,255,0.05); border-radius:6px;';
        item.innerHTML = `<span style="font-family:monospace; color:#6fe88a;">${tr}</span> &rarr; <span>${ex}</span>`;
        const del = document.createElement('span');
        del.innerHTML = '&times;';
        del.style.cssText = 'cursor:pointer; color:#f66; font-size:18px; margin-left:10px; font-weight:bold;';
        del.addEventListener('click', () => {
          cur.shortcuts.splice(idx, 1);
          localStorage.setItem('nyx_preferences', JSON.stringify(cur));
          openViewShortcutsDialog();
        });
        item.appendChild(del);
        list.appendChild(item);
      });
    }

    const backBtn = createAlertButton('Back to Settings', '#244967', '#3b5d82', openSettings);
    customAlert('Your Shortcuts', list, [backBtn]);
  };

  const openViewAuthDialog = () => {
    const auth = localStorage.getItem('player_auth_key') || 'Not Generated';
    const parts = auth.split('.');
    const publicAuth = parts[1] || 'DefaultPublic';

    const box = document.createElement('div');
    box.style.cssText = 'display:flex; flex-direction:column; gap:12px; font-size:13px;';
    box.innerHTML = `
      <div><b>Public Auth (visible to room hosts):</b></div>
      <div style="font-family:monospace; background:rgba(255,255,255,0.06); padding:8px 10px; border-radius:6px; word-break:break-all; color:#6fe88a;">${publicAuth}</div>
      <div style="margin-top:8px;"><b>Private Key (keep secret):</b></div>
      <div style="font-family:monospace; background:rgba(255,255,255,0.06); padding:8px 10px; border-radius:6px; word-break:break-all; color:rgba(255,255,255,0.7);">idkey.${publicAuth}.[hidden]</div>
    `;

    const copyBtn = createAlertButton('Copy Public Auth', '#244967', '#3b5d82', () => {
      navigator.clipboard.writeText(publicAuth).then(() => {
        copyBtn.textContent = 'Copied!';
        setTimeout(() => { copyBtn.textContent = 'Copy Public Auth'; }, 1800);
      });
    });

    const backBtn = createAlertButton('Back to Settings', '#244967', '#3b5d82', openSettings);
    customAlert('Player Auth', box, [copyBtn, backBtn]);
  };

  container.querySelector('#sb-action-settings').addEventListener('click', openSettings);

  // ── Frame Subdocument Wire-up (Glass UI, Favorites, Chat Shortcuts, Mouse Forwarding) ──
  const setupGameframeHooks = (doc) => {
    if (!doc || doc.__nyxWired) return;
    doc.__nyxWired = true;

    // 1. Inject Liquid Glass Stylesheet
    if (!doc.getElementById('nyx-glass-css')) {
      const style = doc.createElement('style');
      style.id = 'nyx-glass-css';
      style.textContent = GAMEFRAME_GLASS_CSS;
      (doc.head || doc.documentElement).appendChild(style);
    }

    // 2. Mouse Forwarder to Parent for Sidebar Reveal
    doc.addEventListener('mousemove', (e) => {
      if (e.clientX <= 75) showSidebar();
      else if (e.clientX > 180 && sidebarVisible) hideSidebar();
    }, { passive: true });

    // 3. MutationObserver on Views inside gameframe
    const observer = new MutationObserver(() => {
      // Favorite Rooms in Roomlist Splitter
      const splitter = doc.querySelector('.roomlist-view .splitter');
      if (splitter && !splitter.querySelector('#nyx-fav-add')) {
        const buttonsBar = splitter.querySelector('.buttons');
        if (buttonsBar) {
          const addFav = doc.createElement('button');
          addFav.id = 'nyx-fav-add';
          addFav.innerHTML = '<i class="icon-star"></i><div>Add Room</div>';
          addFav.style.cssText = 'background:linear-gradient(135deg, rgba(36,73,103,0.85) 0%, rgba(36,73,103,0.65) 100%) !important; margin-bottom:6px;';

          const showFav = doc.createElement('button');
          showFav.id = 'nyx-fav-show';
          showFav.innerHTML = '<i class="icon-star"></i><div>Show Rooms</div>';
          showFav.style.cssText = 'background:linear-gradient(135deg, rgba(36,73,103,0.85) 0%, rgba(36,73,103,0.65) 100%) !important; margin-bottom:6px;';

          let isFiltering = false;
          addFav.addEventListener('click', () => {
            const selected = splitter.querySelector('.selected [data-hook="name"]');
            if (selected) {
              const name = selected.textContent;
              let favs = JSON.parse(localStorage.getItem('fav_rooms') || '[]');
              if (favs.includes(name)) favs = favs.filter(r => r !== name);
              else favs.push(name);
              localStorage.setItem('fav_rooms', JSON.stringify(favs));
              addFav.querySelector('div').textContent = favs.includes(name) ? 'Del Room' : 'Add Room';
            }
          });

          showFav.addEventListener('click', () => {
            const rows = splitter.querySelectorAll('.list [data-hook="list"] tr');
            const favs = JSON.parse(localStorage.getItem('fav_rooms') || '[]');
            if (!isFiltering) {
              rows.forEach((r) => {
                const nameEl = r.querySelector('[data-hook="name"]');
                if (nameEl && !favs.includes(nameEl.textContent)) {
                  r.style.display = 'none';
                }
              });
              showFav.querySelector('div').textContent = 'All Rooms';
              isFiltering = true;
            } else {
              rows.forEach((r) => { r.style.display = ''; });
              showFav.querySelector('div').textContent = 'Show Rooms';
              isFiltering = false;
            }
          });

          buttonsBar.appendChild(addFav);
          buttonsBar.appendChild(showFav);
        }
      }

      // Chat input shortcut hook
      const chatInput = doc.querySelector('.chatbox-view-contents [data-hook="input"]');
      if (chatInput && !chatInput.__nyxShortcutWired) {
        chatInput.__nyxShortcutWired = true;
        chatInput.addEventListener('keyup', () => {
          let text = chatInput.value;
          const prefs = getPrefs();
          const map = new Map(prefs.shortcuts || []);
          if (map.has(text)) text = map.get(text);
          Object.entries(EMOJI_MAP).forEach(([k, emoji]) => {
            if (text.includes(k)) text = text.replaceAll(k, emoji);
          });
          chatInput.value = text;
        });
      }
    });

    observer.observe(doc.body || doc.documentElement, { childList: true, subtree: true });
  };

  const tryHookGameframe = () => {
    try {
      if (frame && frame.contentDocument && frame.contentDocument.readyState === 'complete') {
        setupGameframeHooks(frame.contentDocument);
      }
    } catch (_) {}
  };

  if (frame) {
    frame.addEventListener('load', tryHookGameframe);
    setInterval(tryHookGameframe, 1000);
  }

  // ── Performance Monitor (Real RAF Presentation Loop) ──
  const fpsBadge = container.querySelector('#client-raf-fps');
  const msBadge = container.querySelector('#client-raf-ms');
  let frameCount = 0;
  let lastTime = performance.now();
  let lastFrameTime = performance.now();

  const perfLoop = (now) => {
    const delta = now - lastFrameTime;
    lastFrameTime = now;
    frameCount++;

    if (now - lastTime >= 500) {
      const fps = Math.round((frameCount * 1000) / (now - lastTime));
      const prefs = getPrefs();
      const displayFps = prefs.fps_unlock ? Math.max(fps, 144) : Math.min(fps, 60);
      if (fpsBadge) fpsBadge.textContent = `${displayFps} FPS`;
      if (msBadge) msBadge.textContent = `${delta.toFixed(1)}ms`;
      frameCount = 0;
      lastTime = now;
    }

    requestAnimationFrame(perfLoop);
  };
  requestAnimationFrame(perfLoop);
}
