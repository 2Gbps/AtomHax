// Authentic 2D HaxBall physics simulation for practice gameplay demonstration
export function initPracticeReplay(canvas) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const width = canvas.width;
  const height = canvas.height;

  // Stadium boundaries
  const pitch = {
    x: 40,
    y: 30,
    w: width - 80,
    h: height - 60,
    goalH: 90,
  };

  // Disc physics
  const player = {
    x: pitch.x + pitch.w * 0.35,
    y: pitch.y + pitch.h * 0.5,
    vx: 0,
    vy: 0,
    r: 15,
    color: '#e24a4a',
    kickCooldown: 0,
    kicking: false,
  };

  const ball = {
    x: pitch.x + pitch.w * 0.55,
    y: pitch.y + pitch.h * 0.5,
    vx: 2.2,
    vy: 1.1,
    r: 10,
    trail: [],
  };

  const friction = 0.982;
  const playerSpeed = 0.42;
  let frame = 0;

  function update() {
    frame++;

    // AI Practice bot logic: player chases and shoots ball towards right goal
    const targetGoal = { x: pitch.x + pitch.w, y: pitch.y + pitch.h * 0.5 };
    const dx = ball.x - player.x;
    const dy = ball.y - player.y;
    const dist = Math.hypot(dx, dy);

    // Steer player toward ball
    if (dist > player.r + ball.r + 2) {
      player.vx += (dx / dist) * playerSpeed;
      player.vy += (dy / dist) * playerSpeed;
    } else {
      // Kick towards goal
      if (player.kickCooldown <= 0) {
        player.kicking = true;
        player.kickCooldown = 22;
        const gdx = targetGoal.x - ball.x;
        const gdy = targetGoal.y - ball.y;
        const gdist = Math.hypot(gdx, gdy) || 1;
        ball.vx += (gdx / gdist) * 6.5 + (Math.random() - 0.5) * 1.5;
        ball.vy += (gdy / gdist) * 5.0 + (Math.random() - 0.5) * 2.0;
      }
    }

    if (player.kickCooldown > 0) {
      player.kickCooldown--;
      if (player.kickCooldown < 16) player.kicking = false;
    }

    // Apply velocities and friction
    player.x += player.vx;
    player.y += player.vy;
    player.vx *= 0.94;
    player.vy *= 0.94;

    ball.x += ball.vx;
    ball.y += ball.vy;
    ball.vx *= friction;
    ball.vy *= friction;

    // Ball trail
    if (frame % 2 === 0) {
      ball.trail.push({ x: ball.x, y: ball.y, alpha: 0.6 });
      if (ball.trail.length > 12) ball.trail.shift();
    }
    ball.trail.forEach(t => t.alpha *= 0.92);

    // Pitch collisions (Player)
    if (player.x - player.r < pitch.x) { player.x = pitch.x + player.r; player.vx *= -0.5; }
    if (player.x + player.r > pitch.x + pitch.w) { player.x = pitch.x + pitch.w - player.r; player.vx *= -0.5; }
    if (player.y - player.r < pitch.y) { player.y = pitch.y + player.r; player.vy *= -0.5; }
    if (player.y + player.r > pitch.y + pitch.h) { player.y = pitch.y + pitch.h - player.r; player.vy *= -0.5; }

    // Pitch collisions (Ball)
    if (ball.y - ball.r < pitch.y) { ball.y = pitch.y + ball.r; ball.vy *= -0.85; }
    if (ball.y + ball.r > pitch.y + pitch.h) { ball.y = pitch.y + pitch.h - ball.r; ball.vy *= -0.85; }

    // Left wall bounce
    if (ball.x - ball.r < pitch.x) {
      ball.x = pitch.x + ball.r;
      ball.vx *= -0.85;
    }

    // Right goal or wall bounce
    const goalTop = pitch.y + (pitch.h - pitch.goalH) / 2;
    const goalBottom = goalTop + pitch.goalH;

    if (ball.x + ball.r > pitch.x + pitch.w) {
      if (ball.y > goalTop && ball.y < goalBottom) {
        // Goal scored in practice! Reset to middle
        ball.x = pitch.x + pitch.w * 0.45;
        ball.y = pitch.y + pitch.h * 0.5;
        ball.vx = (Math.random() - 0.5) * 2;
        ball.vy = (Math.random() - 0.5) * 2;
        player.x = pitch.x + pitch.w * 0.25;
        player.y = pitch.y + pitch.h * 0.5;
      } else {
        ball.x = pitch.x + pitch.w - ball.r;
        ball.vx *= -0.85;
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
      ball.vx += nx * 2.8;
      ball.vy += ny * 2.8;
    }
  }

  function draw() {
    ctx.clearRect(0, 0, width, height);

    // Stadium grass
    ctx.fillStyle = '#10161f';
    ctx.fillRect(0, 0, width, height);

    // Pitch surface
    ctx.fillStyle = '#17222e';
    ctx.fillRect(pitch.x, pitch.y, pitch.w, pitch.h);

    // Field line markings
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.lineWidth = 2;
    ctx.strokeRect(pitch.x, pitch.y, pitch.w, pitch.h);

    // Halfway line
    ctx.beginPath();
    ctx.moveTo(pitch.x + pitch.w / 2, pitch.y);
    ctx.lineTo(pitch.x + pitch.w / 2, pitch.y + pitch.h);
    ctx.stroke();

    // Center circle
    ctx.beginPath();
    ctx.arc(pitch.x + pitch.w / 2, pitch.y + pitch.h / 2, 45, 0, Math.PI * 2);
    ctx.stroke();

    // Center dot
    ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.beginPath();
    ctx.arc(pitch.x + pitch.w / 2, pitch.y + pitch.h / 2, 3, 0, Math.PI * 2);
    ctx.fill();

    // Goal outlines
    const goalTop = pitch.y + (pitch.h - pitch.goalH) / 2;
    ctx.strokeStyle = '#e2e8ed';
    ctx.lineWidth = 3;
    // Left goal
    ctx.strokeRect(pitch.x - 18, goalTop, 18, pitch.goalH);
    // Right goal
    ctx.strokeRect(pitch.x + pitch.w, goalTop, 18, pitch.goalH);

    // Ball trails
    ball.trail.forEach(t => {
      ctx.fillStyle = `rgba(255, 255, 255, ${t.alpha * 0.4})`;
      ctx.beginPath();
      ctx.arc(t.x, t.y, ball.r * 0.85, 0, Math.PI * 2);
      ctx.fill();
    });

    // Ball
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Player (User circle)
    ctx.fillStyle = player.color;
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.r, 0, Math.PI * 2);
    ctx.fill();

    // Player ring border (highlights on kick)
    ctx.strokeStyle = player.kicking ? '#ffffff' : 'rgba(0, 0, 0, 0.7)';
    ctx.lineWidth = player.kicking ? 3.5 : 2;
    ctx.stroke();

    // Player number / glyph
    ctx.fillStyle = '#ffffff';
    ctx.font = '600 10px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('1', player.x, player.y);

    // HUD / Practice indicator
    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.font = '10px "SF Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('PRACTICE SIMULATION • 144 FPS UNLOCKED', pitch.x + 8, pitch.y + 18);
  }

  let running = true;
  function loop() {
    if (running) {
      update();
      draw();
      requestAnimationFrame(loop);
    }
  }
  loop();

  return () => { running = false; };
}
