// AtomHax Native Client Interactive In-Browser Runtime
// Provides full in-browser client shell: Nickname -> Lobby -> Room Creation -> Playable Custom Arena

export function initClientSimulator(container) {
  if (!container) return;

  let state = {
    view: 'nick', // 'nick' | 'lobby' | 'create' | 'arena'
    nick: 'AtomHax',
    roomName: 'AtomHax Solo Arena',
    score: 0,
    fps: 144,
    sidebarOpen: false,
    settingsOpen: false,
    scriptsOpen: false,
    fpsLimit: 240,
    vsyncBypass: true,
  };

  container.innerHTML = `
    <div class="sim-shell">
      <!-- Window Chrome Header -->
      <div class="sim-header">
        <div class="sim-traffic-lights">
          <span class="sim-light red" title="Close"></span>
          <span class="sim-light yellow" title="Minimize"></span>
          <span class="sim-light green" title="Maximize"></span>
        </div>
        <div class="sim-title-wrap">
          <span class="sim-title" id="sim-title-text">AtomHax v0.5.4 — Choose Nickname</span>
        </div>
        <div class="sim-header-meta">
          <span class="badge-chrome sim-fps-badge" id="sim-fps-counter">240 FPS</span>
        </div>
      </div>

      <!-- Main Client Content Stage -->
      <div class="sim-stage" id="sim-stage">
        <!-- Slide-out AtomHax Dark-Glass Sidebar -->
        <div class="sim-sidebar" id="sim-sidebar">
          <div class="sim-sb-btn traffic-close" id="sim-btn-close">×</div>
          <div class="sim-sb-btn traffic-min" id="sim-btn-min">–</div>
          <div class="sim-sb-actions">
            <button class="sim-sb-icon-btn" id="sim-sb-join" title="Join Room">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
            </button>
            <button class="sim-sb-icon-btn" id="sim-sb-scripts" title="Scripts">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
            </button>
            <button class="sim-sb-icon-btn" id="sim-sb-settings" title="Settings">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            </button>
          </div>
        </div>

        <!-- Sidebar Hover Trigger Zone on Left Margin -->
        <div class="sim-sidebar-trigger" id="sim-sidebar-trigger"></div>

        <!-- SCREEN 1: NICKNAME SELECTION -->
        <div class="sim-view sim-view-nick" id="view-nick">
          <div class="sim-dialog-box">
            <div class="sim-dialog-title">Choose nickname</div>
            <div class="sim-dialog-body">
              <label class="sim-label">Nick:</label>
              <input type="text" class="sim-input" id="sim-nick-input" value="AtomHax" maxlength="15" autocomplete="off" spellcheck="false" autofocus />
            </div>
            <div class="sim-dialog-actions">
              <button class="btn-chrome sim-action-btn" id="sim-btn-ok">Ok</button>
            </div>
          </div>
        </div>

        <!-- SCREEN 2: ROOM LOBBY TABLE -->
        <div class="sim-view sim-view-lobby" id="view-lobby" style="display: none;">
          <div class="sim-lobby-wrap">
            <div class="sim-lobby-header">
              <span class="sim-lobby-title">Room list</span>
              <span class="sim-lobby-tip">Tip: Join solo practice to rehearse high-speed rebounds.</span>
            </div>
            <div class="sim-room-table">
              <div class="sim-room-row header-row">
                <span class="col-name">Name</span>
                <span class="col-players">Players</span>
                <span class="col-pass">Pass</span>
                <span class="col-dist">Distance</span>
              </div>
              <div class="sim-room-row is-recommended" id="room-solo-practice">
                <span class="col-name"><span class="badge-chrome-tag">PRACTICE</span> AtomHax Solo Arena</span>
                <span class="col-players">1/1</span>
                <span class="col-pass">No</span>
                <span class="col-dist">0 km</span>
              </div>
              <div class="sim-room-row">
                <span class="col-name">United RS League | X6 (Curve, Pens) 🔴🟢</span>
                <span class="col-players">4/30</span>
                <span class="col-pass">No</span>
                <span class="col-dist">956 km</span>
              </div>
              <div class="sim-room-row">
                <span class="col-name">mrslammer's room [Ranked]</span>
                <span class="col-players">1/2</span>
                <span class="col-pass">Yes</span>
                <span class="col-dist">714 km</span>
              </div>
              <div class="sim-room-row">
                <span class="col-name">dommy's room</span>
                <span class="col-players">1/12</span>
                <span class="col-pass">No</span>
                <span class="col-dist">841 km</span>
              </div>
            </div>
            <div class="sim-lobby-footer">
              <button class="btn-secondary sim-btn-sm" id="sim-btn-refresh">Refresh</button>
              <button class="btn-chrome sim-btn-sm" id="sim-btn-open-create">Create Room</button>
              <button class="btn-chrome sim-btn-sm" id="sim-btn-quick-play">Join Practice Arena</button>
              <button class="btn-secondary sim-btn-sm" id="sim-btn-change-nick">Change Nick</button>
            </div>
          </div>
        </div>

        <!-- SCREEN 3: CREATE ROOM DIALOG -->
        <div class="sim-view sim-view-create" id="view-create" style="display: none;">
          <div class="sim-dialog-box">
            <div class="sim-dialog-title">Create room</div>
            <div class="sim-dialog-body form-grid">
              <label class="sim-label">Room name:</label>
              <input type="text" class="sim-input" id="sim-roomname-input" value="AtomHax Solo Arena" maxlength="25" />
              <label class="sim-label">Password:</label>
              <input type="password" class="sim-input" placeholder="(Optional)" />
              <label class="sim-label">Max players:</label>
              <select class="sim-select">
                <option selected>1 (Solo Practice)</option>
                <option>2 (1v1)</option>
                <option>4 (2v2)</option>
                <option>6 (3v3)</option>
              </select>
            </div>
            <div class="sim-dialog-actions split">
              <button class="btn-secondary sim-action-btn" id="sim-btn-cancel-create">Cancel</button>
              <button class="btn-chrome sim-action-btn" id="sim-btn-confirm-create">Create &amp; Enter</button>
            </div>
          </div>
        </div>

        <!-- SCREEN 4: FULLY PLAYABLE ATOMHAX SOLO ARENA (CANVAS) -->
        <div class="sim-view sim-view-arena" id="view-arena" style="display: none;">
          <canvas id="sim-arena-canvas" width="620" height="380"></canvas>
          
          <div class="sim-arena-overlay">
            <div class="sim-overlay-top-left">
              <button class="sim-pill-btn" id="sim-btn-leave-arena">&larr; Lobby</button>
              <span class="sim-score-chip" id="sim-score-chip">GOALS: 0</span>
            </div>
            <div class="sim-overlay-top-right">
              <span class="sim-engine-tag">⚡ VULKAN UNLOCKED</span>
            </div>
            <div class="sim-overlay-bottom-hint">
              <span><b>WASD / Arrow Keys</b> to move &middot; <b>SPACE / Click</b> to kick</span>
            </div>
          </div>
        </div>

        <!-- MODAL: ATOMHAX CLIENT SETTINGS -->
        <div class="sim-modal" id="sim-modal-settings" style="display: none;">
          <div class="sim-modal-box">
            <div class="sim-modal-header">
              <span>AtomHax Settings</span>
              <button class="sim-modal-close" id="sim-close-settings">&times;</button>
            </div>
            <div class="sim-modal-content">
              <div class="setting-row">
                <div class="setting-info">
                  <span class="setting-title">Uncapped Vsync Bypass</span>
                  <span class="setting-sub">Disables Chromium 60Hz presentation throttle</span>
                </div>
                <input type="checkbox" checked id="sim-toggle-vsync" />
              </div>
              <div class="setting-row">
                <div class="setting-info">
                  <span class="setting-title">Target Framerate Limit</span>
                  <span class="setting-sub">Matches 144Hz / 240Hz / Native Display</span>
                </div>
                <select class="sim-select" id="sim-select-fps">
                  <option value="60">60 FPS (Vanilla)</option>
                  <option value="144">144 FPS</option>
                  <option value="240" selected>240 FPS (Uncapped)</option>
                  <option value="1000">1000 FPS (Benchmark)</option>
                </select>
              </div>
              <div class="setting-row">
                <div class="setting-info">
                  <span class="setting-title">Local Scripting Bridge</span>
                  <span class="setting-sub">Enables HaxScript v16.2 runtime hooks</span>
                </div>
                <input type="checkbox" checked />
              </div>
            </div>
          </div>
        </div>

        <!-- MODAL: HAXSCRIPT RUNTIME -->
        <div class="sim-modal" id="sim-modal-scripts" style="display: none;">
          <div class="sim-modal-box">
            <div class="sim-modal-header">
              <span>Local Script Manager</span>
              <button class="sim-modal-close" id="sim-close-scripts">&times;</button>
            </div>
            <div class="sim-modal-content">
              <div class="script-card active">
                <div class="script-card-header">
                  <span class="script-badge active">LOADED</span>
                  <span class="script-name">HaxScript-v16.2-Core.js</span>
                </div>
                <p class="script-desc">Hardware-timed kick macros, ball trajectory prediction, and frametime smoothing.</p>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  `;

  // DOM elements
  const titleText = container.querySelector('#sim-title-text');
  const fpsCounter = container.querySelector('#sim-fps-counter');
  const sidebar = container.querySelector('#sim-sidebar');
  const sidebarTrigger = container.querySelector('#sim-sidebar-trigger');

  const viewNick = container.querySelector('#view-nick');
  const viewLobby = container.querySelector('#view-lobby');
  const viewCreate = container.querySelector('#view-create');
  const viewArena = container.querySelector('#view-arena');

  const nickInput = container.querySelector('#sim-nick-input');
  const btnOk = container.querySelector('#sim-btn-ok');
  const btnRefresh = container.querySelector('#sim-btn-refresh');
  const btnOpenCreate = container.querySelector('#sim-btn-open-create');
  const btnQuickPlay = container.querySelector('#sim-btn-quick-play');
  const btnChangeNick = container.querySelector('#sim-btn-change-nick');
  const roomSoloPractice = container.querySelector('#room-solo-practice');

  const btnCancelCreate = container.querySelector('#sim-btn-cancel-create');
  const btnConfirmCreate = container.querySelector('#sim-btn-confirm-create');
  const roomNameInput = container.querySelector('#sim-roomname-input');

  const btnLeaveArena = container.querySelector('#sim-btn-leave-arena');
  const scoreChip = container.querySelector('#sim-score-chip');
  const arenaCanvas = container.querySelector('#sim-arena-canvas');

  // Modal elements
  const modalSettings = container.querySelector('#sim-modal-settings');
  const btnSettings = container.querySelector('#sim-sb-settings');
  const btnCloseSettings = container.querySelector('#sim-close-settings');

  const modalScripts = container.querySelector('#sim-modal-scripts');
  const btnScripts = container.querySelector('#sim-sb-scripts');
  const btnCloseScripts = container.querySelector('#sim-close-scripts');
  const btnSbJoin = container.querySelector('#sim-sb-join');

  const selectFps = container.querySelector('#sim-select-fps');

  // Sidebar triggers
  const openSidebar = () => {
    sidebar.style.transform = 'translateX(0)';
    sidebar.style.opacity = '1';
    state.sidebarOpen = true;
  };
  const closeSidebar = () => {
    sidebar.style.transform = 'translateX(-115%)';
    sidebar.style.opacity = '0';
    state.sidebarOpen = false;
  };

  sidebarTrigger.addEventListener('mouseenter', openSidebar);
  sidebar.addEventListener('mouseleave', (e) => {
    if (e.clientX > 150) closeSidebar();
  });

  // Settings & Scripts Modal events
  btnSettings.addEventListener('click', () => { modalSettings.style.display = 'flex'; });
  btnCloseSettings.addEventListener('click', () => { modalSettings.style.display = 'none'; });

  btnScripts.addEventListener('click', () => { modalScripts.style.display = 'flex'; });
  btnCloseScripts.addEventListener('click', () => { modalScripts.style.display = 'none'; });

  btnSbJoin.addEventListener('click', () => {
    switchView('lobby');
    closeSidebar();
  });

  selectFps.addEventListener('change', (e) => {
    state.fpsLimit = parseInt(e.target.value, 10);
    fpsCounter.textContent = `${state.fpsLimit} FPS`;
  });

  // Navigation state machine
  function switchView(target) {
    state.view = target;
    viewNick.style.display = 'none';
    viewLobby.style.display = 'none';
    viewCreate.style.display = 'none';
    viewArena.style.display = 'none';

    if (target === 'nick') {
      viewNick.style.display = 'flex';
      titleText.textContent = 'AtomHax v0.5.4 — Choose Nickname';
      setTimeout(() => nickInput.focus(), 50);
    } else if (target === 'lobby') {
      viewLobby.style.display = 'flex';
      titleText.textContent = `AtomHax v0.5.4 — Lobby (${state.nick})`;
    } else if (target === 'create') {
      viewCreate.style.display = 'flex';
      titleText.textContent = 'AtomHax v0.5.4 — Create Match Room';
      setTimeout(() => roomNameInput.focus(), 50);
    } else if (target === 'arena') {
      viewArena.style.display = 'block';
      titleText.textContent = `AtomHax v0.5.4 — ${state.roomName}`;
      startArenaGame();
    }
  }

  // Nickname interactions
  const submitNick = () => {
    const val = nickInput.value.trim() || 'AtomHax';
    state.nick = val;
    switchView('lobby');
  };
  btnOk.addEventListener('click', submitNick);
  nickInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitNick();
  });

  // Lobby interactions
  btnChangeNick.addEventListener('click', () => switchView('nick'));
  btnOpenCreate.addEventListener('click', () => switchView('create'));
  btnQuickPlay.addEventListener('click', () => switchView('arena'));
  roomSoloPractice.addEventListener('click', () => switchView('arena'));

  btnRefresh.addEventListener('click', () => {
    btnRefresh.textContent = 'Refreshing...';
    setTimeout(() => { btnRefresh.textContent = 'Refresh'; }, 300);
  });

  // Create Room interactions
  btnCancelCreate.addEventListener('click', () => switchView('lobby'));
  btnConfirmCreate.addEventListener('click', () => {
    state.roomName = roomNameInput.value.trim() || 'AtomHax Solo Arena';
    switchView('arena');
  });

  // Arena interactions
  btnLeaveArena.addEventListener('click', () => {
    stopArenaGame();
    switchView('lobby');
  });

  /* ═══════════════════════════════════════════════
     AUTHENTIC HAXBALL SOLO PRACTICE ARENA (CANVAS)
     60/144Hz Interactive Canvas Physics Engine
     ═══════════════════════════════════════════════ */
  let gameRunning = false;
  let animId = null;

  const ctx = arenaCanvas.getContext('2d');
  const W = arenaCanvas.width;
  const H = arenaCanvas.height;

  const pitch = {
    x: 44,
    y: 36,
    w: W - 88,
    h: H - 72,
    goalH: 104,
  };
  const halfX = pitch.x + pitch.w / 2;
  const halfY = pitch.y + pitch.h / 2;
  const goalTop = halfY - pitch.goalH / 2;
  const goalBottom = halfY + pitch.goalH / 2;

  const player = {
    x: halfX - 90,
    y: halfY,
    vx: 0,
    vy: 0,
    r: 15,
    speed: 0.52,
    kicking: false,
    kickCooldown: 0,
  };

  const ball = {
    x: halfX,
    y: halfY,
    vx: 0,
    vy: 0,
    r: 9.5,
    trail: [],
  };

  const keys = {
    up: false,
    down: false,
    left: false,
    right: false,
    kick: false,
  };

  // Keyboard controls
  const onKeyDown = (e) => {
    if (state.view !== 'arena') return;
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

  // Mouse / Canvas click kick trigger
  arenaCanvas.addEventListener('mousedown', (e) => {
    if (state.view !== 'arena') return;
    triggerKick();
  });

  // Touch controls for mobile / tablet
  let touchActive = false;
  arenaCanvas.addEventListener('touchstart', (e) => {
    touchActive = true;
    triggerKick();
    handleTouchMove(e);
  }, { passive: true });

  arenaCanvas.addEventListener('touchmove', (e) => {
    if (!touchActive) return;
    handleTouchMove(e);
  }, { passive: true });

  arenaCanvas.addEventListener('touchend', () => {
    touchActive = false;
    keys.up = keys.down = keys.left = keys.right = false;
  });

  function handleTouchMove(e) {
    const rect = arenaCanvas.getBoundingClientRect();
    const touch = e.touches[0];
    const tx = (touch.clientX - rect.left) * (W / rect.width);
    const ty = (touch.clientY - rect.top) * (H / rect.height);
    const dx = tx - player.x;
    const dy = ty - player.y;
    keys.left = dx < -10;
    keys.right = dx > 10;
    keys.up = dy < -10;
    keys.down = dy > 10;
  }

  function triggerKick() {
    if (player.kickCooldown > 0) return;
    player.kicking = true;
    player.kickCooldown = 18;

    // Check distance to ball
    const dx = ball.x - player.x;
    const dy = ball.y - player.y;
    const dist = Math.hypot(dx, dy) || 1;
    if (dist <= player.r + ball.r + 8) {
      // Powerful kick strike!
      ball.vx += (dx / dist) * 9.5;
      ball.vy += (dy / dist) * 9.5;
    }
  }

  let goalFlash = 0;

  function resetBall(scored) {
    if (scored) {
      state.score++;
      scoreChip.textContent = `GOALS: ${state.score}`;
      goalFlash = 45;
    }
    ball.x = halfX;
    ball.y = halfY;
    ball.vx = 0;
    ball.vy = 0;
    player.x = halfX - 90;
    player.y = halfY;
    player.vx = 0;
    player.vy = 0;
  }

  let lastFrameTime = performance.now();
  let frameCount = 0;
  let fpsTimer = 0;

  function updatePhysics() {
    // Player movement acceleration
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

    // Kick cooldown animation
    if (player.kickCooldown > 0) {
      player.kickCooldown--;
      if (player.kickCooldown < 12) player.kicking = false;
    }

    // Ball physics
    ball.x += ball.vx;
    ball.y += ball.vy;
    ball.vx *= 0.985;
    ball.vy *= 0.985;

    // Ball trail
    if (Math.hypot(ball.vx, ball.vy) > 0.8) {
      ball.trail.push({ x: ball.x, y: ball.y, alpha: 0.6 });
      if (ball.trail.length > 12) ball.trail.shift();
    } else if (ball.trail.length) {
      ball.trail.shift();
    }
    ball.trail.forEach(t => t.alpha *= 0.88);

    // Arena boundary collisions (Player)
    if (player.x - player.r < pitch.x) { player.x = pitch.x + player.r; player.vx *= -0.5; }
    if (player.x + player.r > pitch.x + pitch.w) { player.x = pitch.x + pitch.w - player.r; player.vx *= -0.5; }
    if (player.y - player.r < pitch.y) { player.y = pitch.y + player.r; player.vy *= -0.5; }
    if (player.y + player.r > pitch.y + pitch.h) { player.y = pitch.y + pitch.h - player.r; player.vy *= -0.5; }

    // Ball boundary collisions & Goals
    // Top & Bottom walls
    if (ball.y - ball.r < pitch.y) {
      ball.y = pitch.y + ball.r;
      ball.vy *= -0.88;
    }
    if (ball.y + ball.r > pitch.y + pitch.h) {
      ball.y = pitch.y + pitch.h - ball.r;
      ball.vy *= -0.88;
    }

    // Left wall or goal
    if (ball.x - ball.r < pitch.x) {
      if (ball.y > goalTop && ball.y < goalBottom) {
        // Own goal / bounce
        ball.x = pitch.x + ball.r;
        ball.vx *= -0.85;
      } else {
        ball.x = pitch.x + ball.r;
        ball.vx *= -0.88;
      }
    }

    // Right wall or goal (Target goal!)
    if (ball.x + ball.r > pitch.x + pitch.w) {
      if (ball.y > goalTop && ball.y < goalBottom) {
        // GOAL SCORED!
        resetBall(true);
      } else {
        ball.x = pitch.x + pitch.w - ball.r;
        ball.vx *= -0.88;
      }
    }

    // Player-Ball circle collision
    const colDist = Math.hypot(ball.x - player.x, ball.y - player.y);
    const minDist = player.r + ball.r;
    if (colDist < minDist) {
      const overlap = minDist - colDist;
      const nx = (ball.x - player.x) / (colDist || 1);
      const ny = (ball.y - player.y) / (colDist || 1);
      ball.x += nx * overlap;
      ball.y += ny * overlap;
      ball.vx += nx * 2.8 + player.vx * 0.5;
      ball.vy += ny * 2.8 + player.vy * 0.5;
    }
  }

  function renderArena() {
    // Turf: Dark Obsidian Carbon Field
    ctx.fillStyle = '#0f1724';
    ctx.fillRect(0, 0, W, H);

    // Custom AtomHax Pitch Ground
    ctx.fillStyle = '#141d2e';
    ctx.beginPath();
    ctx.roundRect(pitch.x, pitch.y, pitch.w, pitch.h, 20);
    ctx.fill();

    // Subtle turf pitch stripes
    ctx.fillStyle = 'rgba(255, 255, 255, 0.015)';
    for (let x = pitch.x; x < pitch.x + pitch.w; x += 50) {
      ctx.fillRect(x, pitch.y, 25, pitch.h);
    }

    // Pitch borders (AtomHax electric cyan)
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.roundRect(pitch.x, pitch.y, pitch.w, pitch.h, 20);
    ctx.stroke();

    // Midfield Line
    ctx.beginPath();
    ctx.moveTo(halfX, pitch.y);
    ctx.lineTo(halfX, pitch.y + pitch.h);
    ctx.stroke();

    // Midfield Center Circle & Dot
    ctx.beginPath();
    ctx.arc(halfX, halfY, 55, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.arc(halfX, halfY, 3.5, 0, Math.PI * 2);
    ctx.fill();

    // Center Turf Watermark Branding
    ctx.save();
    ctx.font = '600 13px Inter, sans-serif';
    ctx.fillStyle = 'rgba(186, 230, 253, 0.18)';
    ctx.textAlign = 'center';
    ctx.fillText('ATOMHAX SOLO ARENA', halfX, halfY - 65);
    ctx.restore();

    // Left Goal (Practice Net)
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.6)';
    ctx.strokeRect(pitch.x - 22, goalTop, 22, pitch.goalH);
    ctx.fillStyle = 'rgba(30, 60, 90, 0.3)';
    ctx.fillRect(pitch.x - 22, goalTop, 22, pitch.goalH);

    // Right Goal (Target Net)
    ctx.strokeStyle = '#38bdf8';
    ctx.strokeRect(pitch.x + pitch.w, goalTop, 22, pitch.goalH);
    ctx.fillStyle = 'rgba(56, 189, 248, 0.2)';
    ctx.fillRect(pitch.x + pitch.w, goalTop, 22, pitch.goalH);

    // Ball Trail
    ball.trail.forEach((t) => {
      ctx.fillStyle = `rgba(186, 230, 253, ${t.alpha * 0.4})`;
      ctx.beginPath();
      ctx.arc(t.x, t.y, ball.r * 0.75, 0, Math.PI * 2);
      ctx.fill();
    });

    // Ball
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#1e293b';
    ctx.stroke();

    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Player Kick Aura Halo
    if (player.kicking) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(player.x, player.y, player.r + 7, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Player Disc (Atom Red / Chrome Pip)
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle = '#e24a4a';
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Inner Pip
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(player.x, player.y, 4.5, 0, Math.PI * 2);
    ctx.fill();

    // Nickname above player disc
    ctx.font = '500 11px Inter, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.shadowColor = '#000000';
    ctx.shadowBlur = 4;
    ctx.fillText(state.nick, player.x, player.y - player.r - 6);
    ctx.restore();

    // Goal scored banner overlay
    if (goalFlash > 0) {
      goalFlash--;
      const alpha = Math.min(1, goalFlash / 15);
      ctx.save();
      ctx.fillStyle = `rgba(15, 23, 42, ${alpha * 0.85})`;
      ctx.roundRect(halfX - 100, halfY - 32, 200, 64, 12);
      ctx.fill();
      ctx.strokeStyle = `rgba(56, 189, 248, ${alpha})`;
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.font = '700 24px Inter, sans-serif';
      ctx.fillStyle = `rgba(56, 189, 248, ${alpha})`;
      ctx.textAlign = 'center';
      ctx.fillText('GOAL!', halfX, halfY + 2);
      ctx.font = '500 10px Inter, sans-serif';
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.8})`;
      ctx.fillText('PRACTICE SHOT CONVERTED', halfX, halfY + 18);
      ctx.restore();
    }
  }

  function loop(now) {
    if (!gameRunning) return;

    frameCount++;
    if (now - fpsTimer >= 1000) {
      state.fps = frameCount;
      frameCount = 0;
      fpsTimer = now;
      fpsCounter.textContent = `${Math.min(state.fps, state.fpsLimit)} FPS`;
    }

    updatePhysics();
    renderArena();

    animId = requestAnimationFrame(loop);
  }

  function startArenaGame() {
    gameRunning = true;
    lastFrameTime = performance.now();
    fpsTimer = performance.now();
    animId = requestAnimationFrame(loop);
  }

  function stopArenaGame() {
    gameRunning = false;
    if (animId) cancelAnimationFrame(animId);
  }

  // Initial mount
  switchView('nick');
}
