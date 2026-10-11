// AtomHax Native Client Interactive In-Browser Runtime
// Provides full in-browser client shell: Nickname -> Loading -> Lobby -> Room Creation -> Connecting -> Playable Match Arena
// Includes authentic HaxBall visual design, sliding dark-glass sidebar, modals, AI sparring bot, audio, and userscripts.

export function initClientSimulator(container) {
  if (!container) return;

  // Web Audio Context for synthesized sound effects
  let audioCtx = null;
  const initAudio = () => {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) audioCtx = new AudioContextClass();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  };

  const playSound = (type) => {
    try {
      if (!audioCtx) return;
      const now = audioCtx.currentTime;
      if (type === 'kick') {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(140, now);
        osc.frequency.exponentialRampToValueAtTime(35, now + 0.08);
        gain.gain.setValueAtTime(0.35, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.08);
      } else if (type === 'bounce') {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.exponentialRampToValueAtTime(80, now + 0.06);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.06);
      } else if (type === 'goal') {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.setValueAtTime(554.37, now + 0.1);
        osc.frequency.setValueAtTime(659.25, now + 0.2);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.45);
      }
    } catch (_) {}
  };

  const state = {
    view: 'nick', // 'nick' | 'loading' | 'lobby' | 'create' | 'connecting' | 'arena'
    nick: 'AtomHax',
    roomName: 'AtomHax Practice Arena',
    scoreRed: 0,
    scoreBlue: 0,
    matchSeconds: 0,
    matchPaused: false,
    hudVisible: true,
    fpsLimit: 240,
    fps: 240,
    renderScale: '1.0x',
    discordRpc: true,
    shortcuts: [
      { key: '!p', val: '/pause' },
      { key: '!bb', val: 'Good game everyone!' },
      { key: '!op', val: '⚡ AtomHax Uncapped Engine Active' },
    ],
    scripts: {
      blockHelper: true,
      opMode: false,
      haxScript: true,
    },
    userInteracted: false,
  };

  container.innerHTML = `
    <div class="sim-shell" id="sim-shell">
      <!-- Window Chrome Header -->
      <div class="sim-header">
        <div class="sim-traffic-lights">
          <span class="sim-light red" id="win-btn-close" title="Close"></span>
          <span class="sim-light yellow" id="win-btn-min" title="Minimize"></span>
          <span class="sim-light green" id="win-btn-max" title="Focus Mode (H)"></span>
        </div>
        <div class="sim-title-wrap">
          <span class="sim-title" id="sim-title-text">AtomHax v0.5.4 — Choose Nickname</span>
        </div>
        <div class="sim-header-meta">
          <span class="sim-tag-bridge">⚡ Vulkan Bridge</span>
          <span class="badge-chrome sim-fps-badge" id="sim-fps-counter">240 FPS</span>
        </div>
      </div>

      <!-- Main Client Content Stage -->
      <div class="sim-stage" id="sim-stage">
        <!-- Slide-out AtomHax Dark-Glass Sidebar -->
        <div class="sim-sidebar" id="sim-sidebar">
          <div class="sim-sb-btn traffic-close" id="sim-btn-close" title="Close Window">&times;</div>
          <div class="sim-sb-btn traffic-min" id="sim-btn-min" title="Minimize Window">&ndash;</div>
          <div class="sim-sb-actions">
            <button class="sim-sb-icon-btn" id="sim-sb-join" title="Join Room">
              <i class="fa fa-sign-in" aria-hidden="true"></i>
            </button>
            <button class="sim-sb-icon-btn" id="sim-sb-scripts" title="Scripts">
              <i class="fa fa-code" aria-hidden="true"></i>
            </button>
            <button class="sim-sb-icon-btn" id="sim-sb-settings" title="Settings">
              <i class="fa fa-cog" aria-hidden="true"></i>
            </button>
          </div>
        </div>

        <!-- Sidebar Hover Trigger Zone on Left Margin -->
        <div class="sim-sidebar-trigger" id="sim-sidebar-trigger" title="Hover to open AtomHax sidebar"></div>

        <!-- SCREEN 1: NICKNAME SELECTION (shot_sidebar.png) -->
        <div class="sim-view sim-view-nick" id="view-nick">
          <div class="sim-dialog-wrap">
            <div class="haxball-brand-wrap">
              <!-- Official HaxBall Logo (Star + Soccer Ball + 3D Font) -->
              <svg class="haxball-svg-logo" width="220" height="74" viewBox="0 0 280 94" fill="none">
                <g transform="translate(195, 34) rotate(16)">
                  <polygon points="0,-28 8,-8 28,0 8,8 0,28 -8,8 -28,0 -8,-8" fill="#f8b334" stroke="#d97706" stroke-width="2.5" />
                </g>
                <g transform="translate(182, 38)">
                  <circle cx="0" cy="0" r="21" fill="#ffffff" stroke="#12273d" stroke-width="3" />
                  <polygon points="0,-8 7,-3 4,5 -4,5 -7,-3" fill="#1e293b" />
                  <line x1="0" y1="-8" x2="0" y2="-19" stroke="#1e293b" stroke-width="2.2" />
                  <line x1="7" y1="-3" x2="16" y2="-7" stroke="#1e293b" stroke-width="2.2" />
                  <line x1="4" y1="5" x2="13" y2="15" stroke="#1e293b" stroke-width="2.2" />
                  <line x1="-4" y1="5" x2="-13" y2="15" stroke="#1e293b" stroke-width="2.2" />
                  <line x1="-7" y1="-3" x2="-16" y2="-7" stroke="#1e293b" stroke-width="2.2" />
                </g>
                <text x="12" y="66" font-family="'Arial Black', Impact, sans-serif" font-weight="900" font-size="62" fill="#12273d" stroke="#12273d" stroke-width="12" stroke-linejoin="round">HaxBall</text>
                <text x="12" y="63" font-family="'Arial Black', Impact, sans-serif" font-weight="900" font-size="62" fill="#e25c48">HaxBall</text>
                <text x="12" y="60" font-family="'Arial Black', Impact, sans-serif" font-weight="900" font-size="62" fill="#ffffff">HaxBall</text>
              </svg>
            </div>

            <div class="sim-dialog-box">
              <div class="sim-dialog-title">Choose nickname</div>
              <div class="sim-dialog-body">
                <label class="sim-label" for="sim-nick-input">Nick:</label>
                <input type="text" class="sim-input" id="sim-nick-input" value="AtomHax" maxlength="15" autocomplete="off" spellcheck="false" />
              </div>
              <div class="sim-dialog-actions">
                <button class="sim-btn-hax" id="sim-btn-ok">Ok</button>
              </div>
            </div>
          </div>
        </div>

        <!-- SCREEN 2: AUTHENTIC LOADING (shot_home.png) -->
        <div class="sim-view sim-view-loading" id="view-loading" style="display: none;">
          <div class="sim-dialog-box" style="text-align: center; max-width: 280px;">
            <div class="sim-dialog-title" style="text-align: left;">Loading</div>
            <div class="sim-loading-bars">
              <div class="sim-loading-bar"></div>
              <div class="sim-loading-bar"></div>
              <div class="sim-loading-bar"></div>
              <div class="sim-loading-bar"></div>
              <div class="sim-loading-bar"></div>
            </div>
          </div>
        </div>

        <!-- SCREEN 3: ROOM LIST LOBBY (shot_lobby.png) -->
        <div class="sim-view sim-view-lobby" id="view-lobby" style="display: none;">
          <div class="sim-lobby-box">
            <div class="sim-lobby-top">
              <div class="sim-dialog-title" style="margin-bottom: 0; padding-bottom: 2px;">Room list</div>
              <input type="text" class="sim-lobby-search" id="sim-room-search" placeholder="Filter rooms..." />
            </div>

            <div class="sim-lobby-body-split">
              <!-- Room table list with flags -->
              <div class="sim-room-list-scroll" id="sim-room-list-items">
                <div class="sim-room-item selected" data-room="AtomHax Solo Practice">
                  <span class="sim-room-flag">🇺🇸</span>
                  <span class="sim-room-name">AtomHax Solo Practice Arena</span>
                  <span class="sim-room-tag">SOLO</span>
                  <span class="sim-room-slots">1/1</span>
                </div>
                <div class="sim-room-item" data-room="Competitive 3v3 Classic">
                  <span class="sim-room-flag">🇺🇸</span>
                  <span class="sim-room-name">[US-East] Competitive 3v3 Classic</span>
                  <span class="sim-room-slots">5/6</span>
                </div>
                <div class="sim-room-item" data-room="Fast Paced Big 4v4">
                  <span class="sim-room-flag">🇨🇦</span>
                  <span class="sim-room-name">[CA] Fast Paced Big Stadium 4v4</span>
                  <span class="sim-room-slots">7/8</span>
                </div>
                <div class="sim-room-item" data-room="Real Soccer League">
                  <span class="sim-room-flag">🇬🇧</span>
                  <span class="sim-room-name">[EU-West] Real Soccer 11v11 Open</span>
                  <span class="sim-room-slots">14/22</span>
                </div>
                <div class="sim-room-item" data-room="Futsal Masters 1v1">
                  <span class="sim-room-flag">🇩🇪</span>
                  <span class="sim-room-name">[EU-Central] 1v1 Futsal Masters</span>
                  <span class="sim-room-slots">2/2</span>
                </div>
                <div class="sim-room-item" data-room="X1 Sem Regras">
                  <span class="sim-room-flag">🇧🇷</span>
                  <span class="sim-room-name">[SA-BR] X1 Sem Regras Pro</span>
                  <span class="sim-room-slots">3/4</span>
                </div>
              </div>

              <!-- Right action buttons matching shot_lobby.png -->
              <div class="sim-lobby-btn-stack">
                <button class="sim-btn-hax sim-stack-btn" id="sim-lobby-refresh"><i class="fa fa-refresh"></i> Refresh</button>
                <button class="sim-btn-hax sim-stack-btn" id="sim-lobby-join-modal"><i class="fa fa-sign-in"></i> Join Room</button>
                <button class="sim-btn-hax sim-stack-btn" id="sim-lobby-create"><i class="fa fa-plus"></i> Create Room</button>
                <button class="sim-btn-hax sim-stack-btn secondary" id="sim-lobby-replays"><i class="fa fa-film"></i> Replays</button>
                <button class="sim-btn-hax sim-stack-btn secondary" id="sim-lobby-settings"><i class="fa fa-cog"></i> Settings</button>
                <button class="sim-btn-hax sim-stack-btn secondary" id="sim-lobby-change-nick"><i class="fa fa-user"></i> Change Nick</button>
              </div>
            </div>
          </div>
        </div>

        <!-- SCREEN 4: CREATE ROOM DIALOG -->
        <div class="sim-view sim-view-create" id="view-create" style="display: none;">
          <div class="sim-dialog-box" style="max-width: 410px;">
            <div class="sim-dialog-title">Create room</div>
            <div class="sim-dialog-body form-grid">
              <label class="sim-label">Room name:</label>
              <input type="text" class="sim-input" id="sim-create-name" value="AtomHax Solo Practice" maxlength="28" />
              <label class="sim-label">Password:</label>
              <input type="password" class="sim-input" placeholder="(Optional)" />
              <label class="sim-label">Max players:</label>
              <select class="sim-select" id="sim-create-max">
                <option value="1" selected>1 (Solo Practice)</option>
                <option value="2">2 (1v1 Duel)</option>
                <option value="4">4 (2v2)</option>
                <option value="6">6 (3v3)</option>
                <option value="8">8 (4v4)</option>
              </select>
              <label class="sim-label">Stadium:</label>
              <select class="sim-select" id="sim-create-stadium">
                <option selected>Classic</option>
                <option>Big</option>
                <option>Real Soccer</option>
                <option>Small</option>
              </select>
            </div>
            <div class="sim-dialog-actions split">
              <button class="sim-btn-hax secondary" id="sim-create-cancel">Cancel</button>
              <button class="sim-btn-hax" id="sim-create-confirm">Create Room</button>
            </div>
          </div>
        </div>

        <!-- SCREEN 5: AUTHENTIC CONNECTING (shot_joined.png) -->
        <div class="sim-view sim-view-connecting" id="view-connecting" style="display: none;">
          <div class="sim-dialog-box" style="max-width: 320px;">
            <div class="sim-dialog-title">Connecting</div>
            <div style="font-size: 13px; color: #cbd5e1; line-height: 1.8; margin-bottom: 20px;">
              Connecting to master...<br />
              Connecting to peer...
            </div>
            <div class="sim-dialog-actions" style="justify-content: flex-end;">
              <button class="sim-btn-hax" id="sim-connecting-cancel">Cancel</button>
            </div>
          </div>
        </div>

        <!-- SCREEN 6: PLAYABLE MATCH ARENA (FULL WORKING HAXBALL PITCH) -->
        <div class="sim-view sim-view-arena" id="view-arena" style="display: none;">
          <canvas id="sim-arena-canvas" width="640" height="430"></canvas>

          <!-- Top Match HUD Header -->
          <div class="sim-match-hud" id="sim-match-hud">
            <div class="sim-scoreboard">
              <span class="score-red" id="hud-score-red">RED 0</span>
              <span>-</span>
              <span class="score-blue" id="hud-score-blue">0 BLUE</span>
              <span class="sim-match-clock" id="hud-match-clock">00:00</span>
            </div>
            <div class="sim-hud-actions">
              <button class="sim-hud-btn" id="sim-hud-pause" title="Pause Match">Pause</button>
              <button class="sim-hud-btn" id="sim-hud-reset" title="Reset 0-0">Reset</button>
              <button class="sim-hud-btn" id="sim-hud-leave" title="Exit to Lobby">&larr; Leave</button>
            </div>
          </div>

          <!-- In-Game Interactive Chatbox -->
          <div class="sim-chatbox" id="sim-chatbox">
            <div class="sim-chat-log" id="sim-chat-log">
              <div class="sim-chat-row"><span class="sys">* Connected to AtomHax Solo Practice Arena</span></div>
              <div class="sim-chat-row"><span class="bot">SparringBot:</span> gl hf! Press WASD to move, Space/Click to kick.</div>
            </div>
            <div class="sim-chat-input-bar">
              <input type="text" class="sim-chat-input" id="sim-chat-input" placeholder="Press Enter to chat (e.g. !p, !bb)..." />
            </div>
          </div>
        </div>

        <!-- MODAL: JOIN ROOM BY LINK (setupSidebar.ts joinRoomModal) -->
        <div class="sim-modal" id="sim-modal-join" style="display: none;">
          <div class="sim-modal-box" style="max-width: 360px;">
            <div class="sim-modal-header">
              <span>Join Room</span>
              <button class="sim-modal-close" id="sim-close-join">&times;</button>
            </div>
            <div class="sim-modal-content">
              <input type="text" class="sim-input" id="sim-join-link-input" placeholder="Paste room link (e.g. https://www.haxball.com/play?c=...)" style="text-align: center; height: 36px;" />
              <div id="sim-join-status" style="font-size: 12px; min-height: 18px; text-align: center; color: #94a3b8;"></div>
              <div class="sim-dialog-actions" style="justify-content: center;">
                <button class="sim-btn-hax" id="sim-join-submit-btn">Join</button>
              </div>
            </div>
          </div>
        </div>

        <!-- MODAL: ATOMHAX CLIENT SETTINGS (settings.ts) -->
        <div class="sim-modal" id="sim-modal-settings" style="display: none;">
          <div class="sim-modal-box">
            <div class="sim-modal-header">
              <span>AtomHax Settings</span>
              <button class="sim-modal-close" id="sim-close-settings">&times;</button>
            </div>
            <div class="sim-modal-content">
              <!-- FPS Limits -->
              <div class="sim-toggle-row">
                <span class="sim-toggle-label">Framerate Unlock</span>
                <div class="sim-toggle-btn-group" id="grp-fps">
                  <button class="sim-toggle-chip" data-fps="60">60Hz</button>
                  <button class="sim-toggle-chip" data-fps="120">120Hz</button>
                  <button class="sim-toggle-chip" data-fps="144">144Hz</button>
                  <button class="sim-toggle-chip active" data-fps="240">240Hz</button>
                  <button class="sim-toggle-chip" data-fps="1000">Uncapped</button>
                </div>
              </div>

              <!-- Render Scale -->
              <div class="sim-toggle-row">
                <span class="sim-toggle-label">Render Scale</span>
                <div class="sim-toggle-btn-group" id="grp-scale">
                  <button class="sim-toggle-chip" data-scale="0.5x">0.5x</button>
                  <button class="sim-toggle-chip" data-scale="0.8x">0.8x</button>
                  <button class="sim-toggle-chip active" data-scale="1.0x">1.0x</button>
                  <button class="sim-toggle-chip" data-scale="1.5x">1.5x</button>
                </div>
              </div>

              <!-- Discord Rich Presence -->
              <div class="sim-toggle-row">
                <span class="sim-toggle-label">Discord Rich Presence</span>
                <div class="sim-toggle-btn-group" id="grp-rpc">
                  <button class="sim-toggle-chip" data-rpc="off">Disabled</button>
                  <button class="sim-toggle-chip active" data-rpc="on">Enabled</button>
                </div>
              </div>

              <!-- Chat Shortcuts -->
              <div style="border-top: 1px solid rgba(255,255,255,0.08); padding-top: 10px;">
                <div style="font-size: 12px; font-weight: 700; color: #ffffff; margin-bottom: 6px;">Chat Shortcuts</div>
                <div style="font-size: 11px; color: #94a3b8; margin-bottom: 8px;">Shortcuts expand automatically when typed in match chat.</div>
                <div style="display: flex; flex-direction: column; gap: 4px; font-size: 11px; color: #cbd5e1; font-family: 'JetBrains Mono', monospace;">
                  <div><span style="color:#38bdf8;">!p</span> &rarr; /pause</div>
                  <div><span style="color:#38bdf8;">!bb</span> &rarr; Good game everyone!</div>
                  <div><span style="color:#38bdf8;">!op</span> &rarr; ⚡ AtomHax Uncapped Engine Active</div>
                </div>
              </div>

              <!-- Auth -->
              <div style="border-top: 1px solid rgba(255,255,255,0.08); padding-top: 10px; display: flex; justify-content: space-between; align-items: center;">
                <div>
                  <div style="font-size: 12px; font-weight: 700; color: #ffffff;">Player Auth Key</div>
                  <div style="font-size: 10.5px; color: #94a3b8;">auth_v1_8f92a3c7...</div>
                </div>
                <button class="sim-btn-hax secondary" id="sim-btn-auth-view" style="height: 26px; padding: 0 10px; font-size: 11px;">View Auth</button>
              </div>
            </div>
          </div>
        </div>

        <!-- MODAL: HAXSCRIPT RUNTIME & PLUGINS (setupScripts.ts) -->
        <div class="sim-modal" id="sim-modal-scripts" style="display: none;">
          <div class="sim-modal-box">
            <div class="sim-modal-header">
              <span>AtomHax Script Manager</span>
              <button class="sim-modal-close" id="sim-close-scripts">&times;</button>
            </div>
            <div class="sim-modal-content">
              <!-- Script 1: BlockHelper -->
              <div class="sim-script-item">
                <div class="sim-script-meta">
                  <span class="sim-script-name">BlockHelper.js</span>
                  <span class="sim-script-desc">Renders defensive trajectory vectors &amp; rebound projection lines on pitch.</span>
                </div>
                <button class="sim-script-toggle-btn on" id="toggle-script-block">ON</button>
              </div>

              <!-- Script 2: OPMode -->
              <div class="sim-script-item">
                <div class="sim-script-meta">
                  <span class="sim-script-name">OPMode.js (Kick Impulse Boost)</span>
                  <span class="sim-script-desc">Hardware-timed kick alignment and ball exit acceleration.</span>
                </div>
                <button class="sim-script-toggle-btn off" id="toggle-script-op">OFF</button>
              </div>

              <!-- Script 3: HaxScript Engine Patch -->
              <div class="sim-script-item">
                <div class="sim-script-meta">
                  <span class="sim-script-name">HaxScript-v16.2 Engine Bridge</span>
                  <span class="sim-script-desc">Uncapped frame generation bridge &amp; low-latency Canvas2D patch.</span>
                </div>
                <button class="sim-script-toggle-btn on" id="toggle-script-bridge">ON</button>
              </div>

              <div style="border-top: 1px solid rgba(255,255,255,0.08); padding-top: 8px; display: flex; justify-content: flex-end;">
                <button class="sim-btn-hax secondary" id="btn-import-script" style="height: 28px; padding: 0 12px; font-size: 11px;">Import hax-script.js</button>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  `;

  // Query DOM elements
  const simShell = container.querySelector('#sim-shell');
  const titleText = container.querySelector('#sim-title-text');
  const fpsCounter = container.querySelector('#sim-fps-counter');
  const sidebar = container.querySelector('#sim-sidebar');
  const sidebarTrigger = container.querySelector('#sim-sidebar-trigger');

  const viewNick = container.querySelector('#view-nick');
  const viewLoading = container.querySelector('#view-loading');
  const viewLobby = container.querySelector('#view-lobby');
  const viewCreate = container.querySelector('#view-create');
  const viewConnecting = container.querySelector('#view-connecting');
  const viewArena = container.querySelector('#view-arena');

  const nickInput = container.querySelector('#sim-nick-input');
  const btnOk = container.querySelector('#sim-btn-ok');

  const roomSearch = container.querySelector('#sim-room-search');
  const roomItems = container.querySelectorAll('.sim-room-item');
  const btnLobbyRefresh = container.querySelector('#sim-lobby-refresh');
  const btnLobbyJoinModal = container.querySelector('#sim-lobby-join-modal');
  const btnLobbyCreate = container.querySelector('#sim-lobby-create');
  const btnLobbyReplays = container.querySelector('#sim-lobby-replays');
  const btnLobbySettings = container.querySelector('#sim-lobby-settings');
  const btnLobbyChangeNick = container.querySelector('#sim-lobby-change-nick');

  const createNameInput = container.querySelector('#sim-create-name');
  const btnCreateCancel = container.querySelector('#sim-create-cancel');
  const btnCreateConfirm = container.querySelector('#sim-create-confirm');

  const btnConnectingCancel = container.querySelector('#sim-connecting-cancel');

  const arenaCanvas = container.querySelector('#sim-arena-canvas');
  const matchHud = container.querySelector('#sim-match-hud');
  const scoreRedEl = container.querySelector('#hud-score-red');
  const scoreBlueEl = container.querySelector('#hud-score-blue');
  const clockEl = container.querySelector('#hud-match-clock');
  const btnHudPause = container.querySelector('#sim-hud-pause');
  const btnHudReset = container.querySelector('#sim-hud-reset');
  const btnHudLeave = container.querySelector('#sim-hud-leave');

  const chatLog = container.querySelector('#sim-chat-log');
  const chatInput = container.querySelector('#sim-chat-input');

  // Modals
  const modalJoin = container.querySelector('#sim-modal-join');
  const btnCloseJoin = container.querySelector('#sim-close-join');
  const joinLinkInput = container.querySelector('#sim-join-link-input');
  const joinStatus = container.querySelector('#sim-join-status');
  const btnJoinSubmit = container.querySelector('#sim-join-submit-btn');

  const modalSettings = container.querySelector('#sim-modal-settings');
  const btnCloseSettings = container.querySelector('#sim-close-settings');
  const btnSbSettings = container.querySelector('#sim-sb-settings');

  const modalScripts = container.querySelector('#sim-modal-scripts');
  const btnCloseScripts = container.querySelector('#sim-close-scripts');
  const btnSbScripts = container.querySelector('#sim-sb-scripts');
  const btnSbJoin = container.querySelector('#sim-sb-join');

  const btnSbClose = container.querySelector('#sim-btn-close');
  const btnSbMin = container.querySelector('#sim-btn-min');
  const winBtnClose = container.querySelector('#win-btn-close');
  const winBtnMin = container.querySelector('#win-btn-min');
  const winBtnMax = container.querySelector('#win-btn-max');

  // Listen to any user interaction inside the client window to enable audio
  container.addEventListener('pointerdown', () => {
    state.userInteracted = true;
    initAudio();
  });

  // Sidebar hover and toggle logic
  const openSidebar = () => {
    sidebar.style.transform = 'translateX(0)';
    sidebar.style.opacity = '1';
  };
  const closeSidebar = () => {
    sidebar.style.transform = 'translateX(-120%)';
    sidebar.style.opacity = '0';
  };

  sidebarTrigger.addEventListener('mouseenter', openSidebar);
  sidebar.addEventListener('mouseleave', (e) => {
    if (e.clientX > 150) closeSidebar();
  });

  // Sidebar window controls
  const handleMinimize = () => {
    const stage = container.querySelector('#sim-stage');
    if (stage.style.display === 'none') {
      stage.style.display = 'block';
    } else {
      stage.style.display = 'none';
      setTimeout(() => { stage.style.display = 'block'; }, 1800);
    }
  };
  btnSbMin.addEventListener('click', handleMinimize);
  winBtnMin.addEventListener('click', handleMinimize);

  btnSbClose.addEventListener('click', () => {
    switchView('nick');
    closeSidebar();
  });
  winBtnClose.addEventListener('click', () => {
    switchView('nick');
  });

  // Focus Mode toggle (hotkey H or Green traffic light)
  const toggleFocusMode = () => {
    state.hudVisible = !state.hudVisible;
    matchHud.style.display = state.hudVisible ? 'flex' : 'none';
    const chat = container.querySelector('#sim-chatbox');
    if (chat) chat.style.display = state.hudVisible ? 'flex' : 'none';
  };
  winBtnMax.addEventListener('click', toggleFocusMode);

  // Modals opening/closing
  const openModal = (m) => { m.style.display = 'flex'; };
  const closeModal = (m) => { m.style.display = 'none'; };

  btnSbJoin.addEventListener('click', () => { openModal(modalJoin); closeSidebar(); });
  btnLobbyJoinModal.addEventListener('click', () => openModal(modalJoin));
  btnCloseJoin.addEventListener('click', () => closeModal(modalJoin));

  btnSbSettings.addEventListener('click', () => { openModal(modalSettings); closeSidebar(); });
  btnLobbySettings.addEventListener('click', () => openModal(modalSettings));
  btnCloseSettings.addEventListener('click', () => closeModal(modalSettings));

  btnSbScripts.addEventListener('click', () => { openModal(modalScripts); closeSidebar(); });
  btnCloseScripts.addEventListener('click', () => closeModal(modalScripts));

  // Join Room link validation
  const submitJoinLink = () => {
    const val = joinLinkInput.value.trim();
    if (!val) return;
    if (val.includes('haxball.com') || val.length >= 8) {
      joinStatus.textContent = 'Connecting to room...';
      joinStatus.style.color = '#4ade80';
      setTimeout(() => {
        closeModal(modalJoin);
        state.roomName = 'Remote Match Room';
        switchView('connecting');
      }, 350);
    } else {
      joinStatus.textContent = 'Invalid link format. Please check the URL.';
      joinStatus.style.color = '#f87171';
    }
  };
  btnJoinSubmit.addEventListener('click', submitJoinLink);
  joinLinkInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitJoinLink();
  });

  // Settings interactive toggles
  container.querySelectorAll('#grp-fps .sim-toggle-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      container.querySelectorAll('#grp-fps .sim-toggle-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      state.fpsLimit = parseInt(chip.dataset.fps, 10);
      fpsCounter.textContent = `${state.fpsLimit} FPS`;
    });
  });

  container.querySelectorAll('#grp-scale .sim-toggle-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      container.querySelectorAll('#grp-scale .sim-toggle-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      state.renderScale = chip.dataset.scale;
    });
  });

  container.querySelectorAll('#grp-rpc .sim-toggle-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      container.querySelectorAll('#grp-rpc .sim-toggle-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      state.discordRpc = chip.dataset.rpc === 'on';
    });
  });

  // Script toggles
  const toggleBlockBtn = container.querySelector('#toggle-script-block');
  toggleBlockBtn.addEventListener('click', () => {
    state.scripts.blockHelper = !state.scripts.blockHelper;
    toggleBlockBtn.textContent = state.scripts.blockHelper ? 'ON' : 'OFF';
    toggleBlockBtn.className = `sim-script-toggle-btn ${state.scripts.blockHelper ? 'on' : 'off'}`;
    addChatMessage('AtomHax', `BlockHelper.js set to ${state.scripts.blockHelper ? 'ENABLED' : 'DISABLED'}`);
  });

  const toggleOpBtn = container.querySelector('#toggle-script-op');
  toggleOpBtn.addEventListener('click', () => {
    state.scripts.opMode = !state.scripts.opMode;
    toggleOpBtn.textContent = state.scripts.opMode ? 'ON' : 'OFF';
    toggleOpBtn.className = `sim-script-toggle-btn ${state.scripts.opMode ? 'on' : 'off'}`;
    addChatMessage('AtomHax', `OPMode.js set to ${state.scripts.opMode ? 'ENABLED' : 'DISABLED'}`);
  });

  const toggleBridgeBtn = container.querySelector('#toggle-script-bridge');
  toggleBridgeBtn.addEventListener('click', () => {
    state.scripts.haxScript = !state.scripts.haxScript;
    toggleBridgeBtn.textContent = state.scripts.haxScript ? 'ON' : 'OFF';
    toggleBridgeBtn.className = `sim-script-toggle-btn ${state.scripts.haxScript ? 'on' : 'off'}`;
  });

  // Navigation State Machine
  function switchView(target) {
    state.view = target;
    viewNick.style.display = 'none';
    viewLoading.style.display = 'none';
    viewLobby.style.display = 'none';
    viewCreate.style.display = 'none';
    viewConnecting.style.display = 'none';
    viewArena.style.display = 'none';

    if (target === 'nick') {
      viewNick.style.display = 'flex';
      titleText.textContent = 'AtomHax v0.5.4 — Choose Nickname';
      // Only focus if the user has already interacted with the app to avoid viewport jumping
      if (state.userInteracted) {
        nickInput.focus({ preventScroll: true });
      }
    } else if (target === 'loading') {
      viewLoading.style.display = 'flex';
      titleText.textContent = 'AtomHax v0.5.4 — Loading...';
      setTimeout(() => switchView('lobby'), 380);
    } else if (target === 'lobby') {
      viewLobby.style.display = 'flex';
      titleText.textContent = `AtomHax v0.5.4 — Lobby (${state.nick})`;
    } else if (target === 'create') {
      viewCreate.style.display = 'flex';
      titleText.textContent = 'AtomHax v0.5.4 — Create Match Room';
      if (state.userInteracted) {
        createNameInput.focus({ preventScroll: true });
      }
    } else if (target === 'connecting') {
      viewConnecting.style.display = 'flex';
      titleText.textContent = `AtomHax v0.5.4 — Connecting to ${state.roomName}`;
      setTimeout(() => switchView('arena'), 460);
    } else if (target === 'arena') {
      viewArena.style.display = 'block';
      titleText.textContent = `AtomHax v0.5.4 — ${state.roomName}`;
      startMatch();
    }
  }

  // Nickname view actions
  const submitNick = () => {
    const val = nickInput.value.trim() || 'AtomHax';
    state.nick = val;
    switchView('loading');
  };
  btnOk.addEventListener('click', submitNick);
  nickInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitNick();
  });

  // Lobby view actions
  btnLobbyChangeNick.addEventListener('click', () => switchView('nick'));
  btnLobbyCreate.addEventListener('click', () => switchView('create'));
  btnLobbyRefresh.addEventListener('click', () => {
    btnLobbyRefresh.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Refreshing...';
    setTimeout(() => {
      btnLobbyRefresh.innerHTML = '<i class="fa fa-refresh"></i> Refresh';
    }, 300);
  });
  btnLobbyReplays.addEventListener('click', () => {
    alert('Replays: 3 match recordings saved locally in AtomHax/replays.');
  });

  roomItems.forEach((item) => {
    item.addEventListener('click', () => {
      roomItems.forEach(i => i.classList.remove('selected'));
      item.classList.add('selected');
      state.roomName = item.dataset.room || 'Practice Arena';
      switchView('connecting');
    });
  });

  // Create room actions
  btnCreateCancel.addEventListener('click', () => switchView('lobby'));
  btnCreateConfirm.addEventListener('click', () => {
    state.roomName = createNameInput.value.trim() || 'AtomHax Solo Practice';
    switchView('connecting');
  });

  btnConnectingCancel.addEventListener('click', () => switchView('lobby'));

  // Match HUD actions
  btnHudLeave.addEventListener('click', () => {
    stopMatch();
    switchView('lobby');
  });
  btnHudReset.addEventListener('click', () => {
    state.scoreRed = 0;
    state.scoreBlue = 0;
    state.matchSeconds = 0;
    scoreRedEl.textContent = 'RED 0';
    scoreBlueEl.textContent = '0 BLUE';
    clockEl.textContent = '00:00';
    resetPitch(false);
  });
  btnHudPause.addEventListener('click', () => {
    state.matchPaused = !state.matchPaused;
    btnHudPause.textContent = state.matchPaused ? 'Resume' : 'Pause';
    addChatMessage('System', state.matchPaused ? '* Match paused' : '* Match resumed');
  });

  // In-Game Chat Handling
  const addChatMessage = (sender, msg) => {
    const row = document.createElement('div');
    row.className = 'sim-chat-row';
    if (sender === 'System') {
      row.innerHTML = `<span class="sys">${msg}</span>`;
    } else if (sender === 'Bot') {
      row.innerHTML = `<span class="bot">SparringBot:</span> ${msg}`;
    } else {
      row.innerHTML = `<span class="user">${state.nick}:</span> ${msg}`;
    }
    chatLog.appendChild(row);
    chatLog.scrollTop = chatLog.scrollHeight;
  };

  const handleChatSubmit = () => {
    let msg = chatInput.value.trim();
    if (!msg) return;

    // Check shortcuts
    for (const sc of state.shortcuts) {
      if (msg === sc.key) {
        msg = sc.val;
        break;
      }
    }

    addChatMessage(state.nick, msg);
    chatInput.value = '';

    // Sparring Bot auto-replies to specific commands
    if (msg.toLowerCase().includes('gg')) {
      setTimeout(() => addChatMessage('Bot', 'gg wp! Nice shot!'), 500);
    } else if (msg.startsWith('/pause')) {
      btnHudPause.click();
    }
  };

  chatInput.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      handleChatSubmit();
      arenaCanvas.focus({ preventScroll: true });
    }
  });

  /* ═══════════════════════════════════════════════
     AUTHENTIC HAXBALL MATCH PITCH & PHYSICS ENGINE
     ═══════════════════════════════════════════════ */
  let matchRunning = false;
  let animId = null;
  let matchClockTimer = null;

  const ctx = arenaCanvas.getContext('2d');
  const W = arenaCanvas.width;
  const H = arenaCanvas.height;

  // Stadium Pitch Dimensions
  const pitch = {
    x: 48,
    y: 38,
    w: W - 96,
    h: H - 76,
    goalH: 108,
    goalDepth: 26,
  };
  const halfX = pitch.x + pitch.w / 2;
  const halfY = pitch.y + pitch.h / 2;
  const goalTop = halfY - pitch.goalH / 2;
  const goalBottom = halfY + pitch.goalH / 2;

  // Player (You: Red Team)
  const player = {
    x: halfX - 100,
    y: halfY,
    vx: 0,
    vy: 0,
    r: 15,
    speed: 0.58,
    kicking: false,
    kickCooldown: 0,
  };

  // Sparring Opponent (Bot: Blue Team)
  const bot = {
    x: halfX + 100,
    y: halfY,
    vx: 0,
    vy: 0,
    r: 15,
    speed: 0.44,
    kicking: false,
    kickCooldown: 0,
  };

  // Match Ball
  const ball = {
    x: halfX,
    y: halfY,
    vx: 0,
    vy: 0,
    r: 10,
    trail: [],
  };

  const keys = {
    up: false,
    down: false,
    left: false,
    right: false,
    kick: false,
  };

  // Global key event listeners
  const onKeyDown = (e) => {
    if (state.view !== 'arena') return;
    if (document.activeElement === chatInput) return;

    if (e.code === 'KeyH') {
      toggleFocusMode();
      e.preventDefault();
      return;
    }
    if (e.code === 'Enter') {
      chatInput.focus({ preventScroll: true });
      e.preventDefault();
      return;
    }

    if (['ArrowUp', 'KeyW'].includes(e.code)) { keys.up = true; e.preventDefault(); }
    if (['ArrowDown', 'KeyS'].includes(e.code)) { keys.down = true; e.preventDefault(); }
    if (['ArrowLeft', 'KeyA'].includes(e.code)) { keys.left = true; e.preventDefault(); }
    if (['ArrowRight', 'KeyD'].includes(e.code)) { keys.right = true; e.preventDefault(); }
    if (['Space', 'KeyX'].includes(e.code)) { triggerKick(); e.preventDefault(); }
  };

  const onKeyUp = (e) => {
    if (['ArrowUp', 'KeyW'].includes(e.code)) keys.up = false;
    if (['ArrowDown', 'KeyS'].includes(e.code)) keys.down = false;
    if (['ArrowLeft', 'KeyA'].includes(e.code)) keys.left = false;
    if (['ArrowRight', 'KeyD'].includes(e.code)) keys.right = false;
  };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  // Mouse / Touch Controls
  arenaCanvas.addEventListener('mousedown', () => {
    if (state.view !== 'arena') return;
    triggerKick();
  });

  let touchActive = false;
  arenaCanvas.addEventListener('touchstart', (e) => {
    touchActive = true;
    triggerKick();
    handleTouch(e);
  }, { passive: true });

  arenaCanvas.addEventListener('touchmove', (e) => {
    if (!touchActive) return;
    handleTouch(e);
  }, { passive: true });

  arenaCanvas.addEventListener('touchend', () => {
    touchActive = false;
    keys.up = keys.down = keys.left = keys.right = false;
  });

  function handleTouch(e) {
    const rect = arenaCanvas.getBoundingClientRect();
    const touch = e.touches[0];
    const tx = (touch.clientX - rect.left) * (W / rect.width);
    const ty = (touch.clientY - rect.top) * (H / rect.height);
    keys.left = (tx - player.x) < -12;
    keys.right = (tx - player.x) > 12;
    keys.up = (ty - player.y) < -12;
    keys.down = (ty - player.y) > 12;
  }

  function triggerKick() {
    if (player.kickCooldown > 0) return;
    player.kicking = true;
    player.kickCooldown = 16;
    playSound('kick');

    // Kick Ball calculation
    const dx = ball.x - player.x;
    const dy = ball.y - player.y;
    const dist = Math.hypot(dx, dy) || 1;
    if (dist <= player.r + ball.r + 9) {
      // OPMode kick boost multiplier
      const boost = state.scripts.opMode ? 14.5 : 10.2;
      ball.vx += (dx / dist) * boost;
      ball.vy += (dy / dist) * boost;
    }
  }

  let goalOverlay = 0;
  let goalScorer = '';

  function resetPitch(scored, scorer) {
    if (scored) {
      goalOverlay = 55;
      goalScorer = scorer;
      playSound('goal');
      if (scorer === 'RED') {
        state.scoreRed++;
        scoreRedEl.textContent = `RED ${state.scoreRed}`;
        addChatMessage('System', `⚽ GOAL scored by ${state.nick}!`);
      } else {
        state.scoreBlue++;
        scoreBlueEl.textContent = `${state.scoreBlue} BLUE`;
        addChatMessage('System', `⚽ GOAL scored by SparringBot!`);
      }
    }
    ball.x = halfX;
    ball.y = halfY;
    ball.vx = 0;
    ball.vy = 0;
    ball.trail = [];
    player.x = halfX - 100;
    player.y = halfY;
    player.vx = 0;
    player.vy = 0;
    bot.x = halfX + 100;
    bot.y = halfY;
    bot.vx = 0;
    bot.vy = 0;
  }

  // Sparring Bot AI logic
  function updateBotAI() {
    if (state.matchPaused) return;

    // Bot tracks the ball if it is on right side or midfield, else returns to defense
    const targetX = (ball.x > halfX - 40) ? ball.x : halfX + 80;
    const targetY = ball.y;

    const dx = targetX - bot.x;
    const dy = targetY - bot.y;
    const dist = Math.hypot(dx, dy) || 1;

    bot.vx += (dx / dist) * bot.speed;
    bot.vy += (dy / dist) * bot.speed;
    bot.x += bot.vx;
    bot.y += bot.vy;
    bot.vx *= 0.90;
    bot.vy *= 0.90;

    // Bot boundary bounds
    if (bot.x + bot.r > pitch.x + pitch.w) { bot.x = pitch.x + pitch.w - bot.r; bot.vx *= -0.5; }
    if (bot.x - bot.r < halfX - 60) { bot.x = halfX - 60 + bot.r; bot.vx *= -0.5; }
    if (bot.y - bot.r < pitch.y) { bot.y = pitch.y + bot.r; bot.vy *= -0.5; }
    if (bot.y + bot.r > pitch.y + pitch.h) { bot.y = pitch.y + pitch.h - bot.r; bot.vy *= -0.5; }

    // Bot kick attempt toward Red's goal (Left)
    const bdx = ball.x - bot.x;
    const bdy = ball.y - bot.y;
    const bDist = Math.hypot(bdx, bdy) || 1;
    if (bDist <= bot.r + ball.r + 7 && bot.kickCooldown <= 0) {
      bot.kicking = true;
      bot.kickCooldown = 22;
      playSound('kick');
      // Kick toward Red goal: target left net center
      const gx = pitch.x - 20 - ball.x;
      const gy = halfY - ball.y;
      const gDist = Math.hypot(gx, gy) || 1;
      ball.vx += (gx / gDist) * 9.8;
      ball.vy += (gy / gDist) * 9.8;
    }

    if (bot.kickCooldown > 0) {
      bot.kickCooldown--;
      if (bot.kickCooldown < 15) bot.kicking = false;
    }
  }

  function updatePhysics() {
    if (state.matchPaused) return;

    // Player acceleration
    let ax = 0;
    let ay = 0;
    if (keys.left) ax -= player.speed;
    if (keys.right) ax += player.speed;
    if (keys.up) ay -= player.speed;
    if (keys.down) ay += player.speed;

    player.vx += ax;
    player.vy += ay;
    player.x += player.vx;
    player.y += player.vy;
    player.vx *= 0.92;
    player.vy *= 0.92;

    if (player.kickCooldown > 0) {
      player.kickCooldown--;
      if (player.kickCooldown < 10) player.kicking = false;
    }

    updateBotAI();

    // Ball movement & friction
    ball.x += ball.vx;
    ball.y += ball.vy;
    ball.vx *= 0.985;
    ball.vy *= 0.985;

    // Ball trail
    if (Math.hypot(ball.vx, ball.vy) > 0.9) {
      ball.trail.push({ x: ball.x, y: ball.y, alpha: 0.65 });
      if (ball.trail.length > 14) ball.trail.shift();
    } else if (ball.trail.length) {
      ball.trail.shift();
    }
    ball.trail.forEach(t => t.alpha *= 0.88);

    // Player pitch bounds
    if (player.x - player.r < pitch.x) { player.x = pitch.x + player.r; player.vx *= -0.5; }
    if (player.x + player.r > pitch.x + pitch.w) { player.x = pitch.x + pitch.w - player.r; player.vx *= -0.5; }
    if (player.y - player.r < pitch.y) { player.y = pitch.y + player.r; player.vy *= -0.5; }
    if (player.y + player.r > pitch.y + pitch.h) { player.y = pitch.y + pitch.h - player.r; player.vy *= -0.5; }

    // Ball wall bounces & Goal checks
    // Top & Bottom walls
    if (ball.y - ball.r < pitch.y) {
      ball.y = pitch.y + ball.r;
      ball.vy *= -0.88;
      playSound('bounce');
    }
    if (ball.y + ball.r > pitch.y + pitch.h) {
      ball.y = pitch.y + pitch.h - ball.r;
      ball.vy *= -0.88;
      playSound('bounce');
    }

    // Left Goal (Red's net)
    if (ball.x - ball.r < pitch.x) {
      if (ball.y > goalTop && ball.y < goalBottom) {
        if (ball.x - ball.r < pitch.x - pitch.goalDepth + 5) {
          // Blue scores in Left Net!
          resetPitch(true, 'BLUE');
        }
      } else {
        ball.x = pitch.x + ball.r;
        ball.vx *= -0.88;
        playSound('bounce');
      }
    }

    // Right Goal (Blue's net - Target Goal for Red!)
    if (ball.x + ball.r > pitch.x + pitch.w) {
      if (ball.y > goalTop && ball.y < goalBottom) {
        if (ball.x + ball.r > pitch.x + pitch.w + pitch.goalDepth - 5) {
          // Red scores in Right Net!
          resetPitch(true, 'RED');
        }
      } else {
        ball.x = pitch.x + pitch.w - ball.r;
        ball.vx *= -0.88;
        playSound('bounce');
      }
    }

    // Player - Ball circle collision
    resolveCircleCollision(player, ball, 3.2);

    // Bot - Ball circle collision
    resolveCircleCollision(bot, ball, 2.9);

    // Player - Bot disc collision
    const pDist = Math.hypot(bot.x - player.x, bot.y - player.y);
    const pMin = player.r + bot.r;
    if (pDist < pMin) {
      const pOver = pMin - pDist;
      const nx = (bot.x - player.x) / (pDist || 1);
      const ny = (bot.y - player.y) / (pDist || 1);
      player.x -= nx * pOver * 0.5;
      player.y -= ny * pOver * 0.5;
      bot.x += nx * pOver * 0.5;
      bot.y += ny * pOver * 0.5;
    }
  }

  function resolveCircleCollision(c1, c2, force) {
    const dist = Math.hypot(c2.x - c1.x, c2.y - c1.y);
    const minD = c1.r + c2.r;
    if (dist < minD) {
      const overlap = minD - dist;
      const nx = (c2.x - c1.x) / (dist || 1);
      const ny = (c2.y - c1.y) / (dist || 1);
      c2.x += nx * overlap;
      c2.y += ny * overlap;
      c2.vx += nx * force + c1.vx * 0.45;
      c2.vy += ny * force + c1.vy * 0.45;
      playSound('bounce');
    }
  }

  /* ═══════════════════════════════════════════════
     AUTHENTIC HAXBALL STADIUM GRAPHICS RENDERING
     ═══════════════════════════════════════════════ */
  function renderPitch() {
    // Outer Border Stadium Background (Dark Grass)
    ctx.fillStyle = '#5c7844';
    ctx.fillRect(0, 0, W, H);

    // Pitch Ground Turf
    ctx.fillStyle = '#718c5a';
    ctx.fillRect(pitch.x, pitch.y, pitch.w, pitch.h);

    // Authentic Mowing Stripes (Vertical alternating greens)
    ctx.fillStyle = '#7a9763';
    const stripeW = 42;
    for (let x = pitch.x; x < pitch.x + pitch.w; x += stripeW * 2) {
      const w = Math.min(stripeW, pitch.x + pitch.w - x);
      ctx.fillRect(x, pitch.y, w, pitch.h);
    }

    // Outer Pitch Boundary Lines (Crisp White)
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.4;
    ctx.strokeRect(pitch.x, pitch.y, pitch.w, pitch.h);

    // Midfield Line
    ctx.beginPath();
    ctx.moveTo(halfX, pitch.y);
    ctx.lineTo(halfX, pitch.y + pitch.h);
    ctx.stroke();

    // Center Circle & Center Spot
    ctx.beginPath();
    ctx.arc(halfX, halfY, 62, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(halfX, halfY, 3.5, 0, Math.PI * 2);
    ctx.fill();

    // Penalty Boxes
    // Left Box (Red Area)
    ctx.strokeRect(pitch.x, halfY - 65, 60, 130);
    // Right Box (Blue Area)
    ctx.strokeRect(pitch.x + pitch.w - 60, halfY - 65, 60, 130);

    // Penalty spots
    ctx.beginPath();
    ctx.arc(pitch.x + 45, halfY, 2.5, 0, Math.PI * 2);
    ctx.arc(pitch.x + pitch.w - 45, halfY, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Goal Nets
    // Left Goal (Red)
    ctx.strokeStyle = '#e56e56';
    ctx.strokeRect(pitch.x - pitch.goalDepth, goalTop, pitch.goalDepth, pitch.goalH);
    ctx.fillStyle = 'rgba(229, 110, 86, 0.22)';
    ctx.fillRect(pitch.x - pitch.goalDepth, goalTop, pitch.goalDepth, pitch.goalH);

    // Right Goal (Blue)
    ctx.strokeStyle = '#5689e5';
    ctx.strokeRect(pitch.x + pitch.w, goalTop, pitch.goalDepth, pitch.goalH);
    ctx.fillStyle = 'rgba(86, 137, 229, 0.22)';
    ctx.fillRect(pitch.x + pitch.w, goalTop, pitch.goalDepth, pitch.goalH);

    // Goal Post Stanchions (White crossbar circles)
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(pitch.x, goalTop, 4, 0, Math.PI * 2);
    ctx.arc(pitch.x, goalBottom, 4, 0, Math.PI * 2);
    ctx.arc(pitch.x + pitch.w, goalTop, 4, 0, Math.PI * 2);
    ctx.arc(pitch.x + pitch.w, goalBottom, 4, 0, Math.PI * 2);
    ctx.fill();

    // Userscript: BlockHelper Dynamic Trajectory Guidelines
    if (state.scripts.blockHelper) {
      ctx.save();
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.55)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);

      // Vector from ball to player
      ctx.beginPath();
      ctx.moveTo(ball.x, ball.y);
      ctx.lineTo(player.x, player.y);
      ctx.stroke();

      // Vector from ball to right target goal center
      ctx.strokeStyle = 'rgba(74, 222, 128, 0.65)';
      ctx.beginPath();
      ctx.moveTo(ball.x, ball.y);
      ctx.lineTo(pitch.x + pitch.w + 10, halfY);
      ctx.stroke();
      ctx.restore();
    }

    // Ball Trail
    ball.trail.forEach((t) => {
      ctx.fillStyle = `rgba(255, 255, 255, ${t.alpha * 0.45})`;
      ctx.beginPath();
      ctx.arc(t.x, t.y, ball.r * 0.8, 0, Math.PI * 2);
      ctx.fill();
    });

    // Match Ball (Authentic Black & White Soccer Ball)
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 2;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#1e293b';
    ctx.stroke();

    // Ball inner pentagon
    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Blue Opponent Disc (SparringBot)
    renderPlayerDisc(bot, '#5689e5', '2', 'SparringBot');

    // Red Player Disc (You)
    renderPlayerDisc(player, '#e56e56', '1', state.nick);

    // Goal Scored Celebration Banner
    if (goalOverlay > 0) {
      goalOverlay--;
      const alpha = Math.min(1, goalOverlay / 18);
      ctx.save();
      ctx.fillStyle = `rgba(18, 25, 36, ${alpha * 0.9})`;
      ctx.fillRect(halfX - 120, halfY - 36, 240, 72);
      ctx.strokeStyle = goalScorer === 'RED' ? '#e56e56' : '#5689e5';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(halfX - 120, halfY - 36, 240, 72);

      ctx.font = '900 28px Arial Black, sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.fillText('GOAL!', halfX, halfY + 4);

      ctx.font = '700 11px Inter, sans-serif';
      ctx.fillStyle = goalScorer === 'RED' ? '#e56e56' : '#5689e5';
      ctx.fillText(goalScorer === 'RED' ? `${state.nick} SCORED` : 'SPARRING BOT SCORED', halfX, halfY + 22);
      ctx.restore();
    }
  }

  function renderPlayerDisc(p, color, num, name) {
    ctx.save();
    // Kick aura pulse
    if (p.kicking) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.8;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r + 8, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Disc body
    ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 2;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    // Player Number
    ctx.font = '700 12px Inter, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(num, p.x, p.y + 0.5);

    // Name tag above disc
    ctx.font = '600 11px Inter, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#000000';
    ctx.shadowBlur = 4;
    ctx.textBaseline = 'bottom';
    ctx.fillText(name, p.x, p.y - p.r - 4);
    ctx.restore();
  }

  let lastTick = performance.now();
  let frameCount = 0;
  let fpsTimer = performance.now();

  function loop(now) {
    if (!matchRunning) return;

    frameCount++;
    if (now - fpsTimer >= 1000) {
      state.fps = frameCount;
      frameCount = 0;
      fpsTimer = now;
      fpsCounter.textContent = `${Math.min(state.fps, state.fpsLimit)} FPS`;
    }

    updatePhysics();
    renderPitch();

    animId = requestAnimationFrame(loop);
  }

  function startMatch() {
    matchRunning = true;
    lastTick = performance.now();
    fpsTimer = performance.now();
    frameCount = 0;

    if (matchClockTimer) clearInterval(matchClockTimer);
    matchClockTimer = setInterval(() => {
      if (!state.matchPaused && matchRunning) {
        state.matchSeconds++;
        const mins = String(Math.floor(state.matchSeconds / 60)).padStart(2, '0');
        const secs = String(state.matchSeconds % 60).padStart(2, '0');
        clockEl.textContent = `${mins}:${secs}`;
      }
    }, 1000);

    animId = requestAnimationFrame(loop);
  }

  function stopMatch() {
    matchRunning = false;
    if (animId) cancelAnimationFrame(animId);
    if (matchClockTimer) clearInterval(matchClockTimer);
  }

  // Initial mount: start firmly in nickname view with zero scrolling
  switchView('nick');
}
