import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { animate, createTimeline, spring, onScroll, stagger } from 'animejs';
import 'animejs/adapters/three';

const canvas = document.getElementById('atom-canvas');
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

try {
  /* ═══════════════════════════════════════════════
     RENDERER — transparent over the page field
     ═══════════════════════════════════════════════ */
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 90);
  camera.position.set(0, 0.55, 8.6);

  scene.add(new THREE.AmbientLight(0x8fa8b8, 0.28));

  const limeLight = new THREE.PointLight(0xc8ff4a, 15, 44, 2);
  limeLight.position.set(5.2, 3.2, 4.6);
  const cyanLight = new THREE.PointLight(0x55d6ff, 11, 44, 2);
  cyanLight.position.set(-5.4, -2.6, 3.4);
  const rimLight = new THREE.PointLight(0xffffff, 7, 36, 2);
  rimLight.position.set(0, 4.6, -5.2);
  scene.add(limeLight, cyanLight, rimLight);

  /* ═══════════════════════════════════════════════
     RIG — spinner (idle yaw) > scrollRig (scroll pose) > atom (trackball)
     Each layer is owned by exactly one motion system.
     ═══════════════════════════════════════════════ */
  const spinner = new THREE.Group();
  const scrollRig = new THREE.Group();
  const atom = new THREE.Group();
  scrollRig.add(atom);
  spinner.add(scrollRig);
  scene.add(spinner);

  /* ═══════════════════════════════════════════════
     CHROME MATERIALS
     ═══════════════════════════════════════════════ */
  const chrome = new THREE.MeshPhysicalMaterial({
    color: 0xdfe5ea,
    metalness: 1,
    roughness: 0.07,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
    envMapIntensity: 1.5,
  });
  const chromeDark = chrome.clone();
  chromeDark.color = new THREE.Color(0xb7c1c9);
  chromeDark.roughness = 0.16;
  chromeDark.envMapIntensity = 1.25;

  /* ═══════════════════════════════════════════════
     NUCLEUS CLUSTER — core + nucleons packed on tetra offsets
     ═══════════════════════════════════════════════ */
  const nucleus = new THREE.Group();
  atom.add(nucleus);

  const core = new THREE.Mesh(new THREE.SphereGeometry(0.44, 48, 48), chrome);
  nucleus.add(core);

  const nucleonGeo = new THREE.SphereGeometry(0.23, 32, 32);
  const nucleonOffsets = [
    [0.36, 0.28, 0.15],
    [-0.36, 0.24, -0.24],
    [0.15, -0.4, -0.22],
    [-0.13, -0.24, 0.38],
  ];
  nucleonOffsets.forEach((offset) => {
    const nucleon = new THREE.Mesh(nucleonGeo, chromeDark);
    nucleon.position.set(...offset);
    nucleus.add(nucleon);
  });

  /* ═══════════════════════════════════════════════
     ORBIT RINGS — 3 at 120°, standing, per-ring tilt
     ═══════════════════════════════════════════════ */
  const ringSpecs = [
    { radius: 1.5, tilt: 24, zOffset: -6, speed: 1.35, glow: '#c8ff4a' },
    { radius: 1.86, tilt: 30, zOffset: 0, speed: -1.05, glow: '#8ee9ff' },
    { radius: 2.24, tilt: 20, zOffset: 6, speed: 0.72, glow: '#ff735e' },
  ];
  const electrons = [];

  ringSpecs.forEach((spec, i) => {
    const container = new THREE.Group();
    container.rotation.y = (i * Math.PI * 2) / 3;
    atom.add(container);

    const ringGroup = new THREE.Group();
    ringGroup.rotation.x = THREE.MathUtils.degToRad(spec.tilt);
    ringGroup.rotation.z = THREE.MathUtils.degToRad(spec.zOffset);
    container.add(ringGroup);

    const torus = new THREE.Mesh(
      new THREE.TorusGeometry(spec.radius, 0.026, 24, 190),
      i === 1 ? chromeDark : chrome,
    );
    ringGroup.add(torus);

    const pivot = new THREE.Group();
    ringGroup.add(pivot);

    const electron = new THREE.Mesh(
      new THREE.SphereGeometry(0.125, 32, 32),
      new THREE.MeshPhysicalMaterial({
        color: 0xe8edf1,
        metalness: 1,
        roughness: 0.1,
        clearcoat: 1,
        envMapIntensity: 1.6,
        emissive: 0x000000,
        emissiveIntensity: 0.6,
        transparent: true,
        opacity: 1,
      }),
    );
    electron.position.x = spec.radius;

    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeGlowTexture(),
      color: new THREE.Color(spec.glow),
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    glow.scale.setScalar(0.6);
    electron.add(glow);

    pivot.add(electron);
    electrons.push({ pivot, electron, glow, spec });
  });

  /* ═══════════════════════════════════════════════
     STARFIELD — two depth layers with parallax drift
     ═══════════════════════════════════════════════ */
  const starsA = makeStars(260, 15, 34, 0.045, 0x9fb4c4, 0.5);
  const starsB = makeStars(150, 9, 18, 0.07, 0xd7e6ef, 0.65);
  scene.add(starsA, starsB);

  /* ═══════════════════════════════════════════════
     ANIME.JS ADAPTER — the atom is driven by anime.js
     ═══════════════════════════════════════════════ */
  animate(atom, {
    scale: [0, 1],
    duration: 1500,
    ease: spring({ stiffness: 68, damping: 11 }),
  });

  if (!reduced) {
    animate(spinner, { rotateY: 360, duration: 110000, ease: 'linear', loop: true });
    animate(spinner.position, {
      y: [0.15, -0.15],
      duration: 5600,
      alternate: true,
      loop: true,
      ease: 'inOutSine',
    });
    animate(core, {
      scale: 1.07,
      duration: 2700,
      alternate: true,
      loop: true,
      ease: 'inOutSine',
    });
    electrons.forEach((entry, i) => {
      animate(entry.electron, {
        rotateZ: 360,
        duration: 4800 + i * 950,
        ease: 'linear',
        loop: true,
      });
      animate(entry.glow.material, {
        opacity: [0.24, 0.5],
        duration: 2400 + i * 500,
        alternate: true,
        loop: true,
        ease: 'inOutSine',
      });
    });
    animate(limeLight, {
      intensity: [9, 19],
      duration: 4300,
      alternate: true,
      loop: true,
      ease: 'inOutSine',
    });
    animate(cyanLight, {
      intensity: [7, 15],
      duration: 5400,
      alternate: true,
      loop: true,
      ease: 'inOutSine',
    });
    animate(starsA.material, {
      opacity: [0.3, 0.6],
      duration: 3800,
      alternate: true,
      loop: true,
      ease: 'inOutSine',
    });
    animate(starsB.material, {
      opacity: [0.45, 0.8],
      duration: 3000,
      delay: 600,
      alternate: true,
      loop: true,
      ease: 'inOutSine',
    });
  }

  /* ═══════════════════════════════════════════════
     SCROLL CHOREOGRAPHY — atom travels side to side,
     rotation and scale scrubbed to page scroll;
     camera dollies in counterpoint.
     ═══════════════════════════════════════════════ */
  if (!reduced) {
    createTimeline({
      autoplay: onScroll({ target: document.body, sync: true }),
      defaults: { ease: 'inOutCubic' },
    })
      .add(scrollRig, { x: 1.45, rotateY: 0, rotateX: 0, scale: 0.9, duration: 160 }, 0)
      .add(camera, { z: 8.2, y: 0.9, duration: 160 }, 0)
      .add(scrollRig, { x: -1.7, rotateY: -150, rotateX: 24, scale: 1.1, duration: 240 }, 160)
      .add(camera, { z: 7.4, y: 1.05, duration: 240 }, 160)
      .add(scrollRig, { x: 1.7, rotateY: -310, rotateX: -16, scale: 0.98, duration: 250 }, 410)
      .add(camera, { z: 8.9, y: 0.45, duration: 240 }, 410)
      .add(scrollRig, { x: 0, y: 0.12, rotateY: -360, rotateX: 0, scale: 1.2, duration: 270 }, 660)
      .add(camera, { z: 6.9, y: 0.4, duration: 270 }, 660);
  }

  /* ═══════════════════════════════════════════════
     TRACKBALL DRAG — free self-rotation following the
     gesture; horizontal spin around world-up, vertical
     spin around camera-right; anime.js spring carries
     release inertia to rest.
     ═══════════════════════════════════════════════ */
  const drag = { active: false, lastX: 0, lastY: 0 };
  const inertia = { x: 0, y: 0 };
  const WORLD_UP = new THREE.Vector3(0, 1, 0);
  const cameraRight = new THREE.Vector3();
  const rotationQuaternion = new THREE.Quaternion();

  const applySpin = (dx, dy) => {
    cameraRight.set(1, 0, 0).applyQuaternion(camera.quaternion);
    atom.quaternion.premultiply(rotationQuaternion.setFromAxisAngle(WORLD_UP, dx * 0.0052));
    atom.quaternion.premultiply(rotationQuaternion.setFromAxisAngle(cameraRight, dy * 0.0052));
  };

  canvas.addEventListener('pointerdown', (event) => {
    drag.active = true;
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
    inertia.x = 0;
    inertia.y = 0;
    canvas.setPointerCapture(event.pointerId);
  });

  canvas.addEventListener('pointermove', (event) => {
    if (!drag.active) return;
    const dx = event.clientX - drag.lastX;
    const dy = event.clientY - drag.lastY;
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
    inertia.x = dx;
    inertia.y = dy;
    applySpin(dx, dy);
  });

  const releaseDrag = () => {
    if (!drag.active) return;
    drag.active = false;
    animate(inertia, {
      x: 0,
      y: 0,
      duration: 1700,
      ease: spring({ stiffness: 52, damping: 21 }),
    });
  };

  canvas.addEventListener('pointerup', releaseDrag);
  canvas.addEventListener('pointercancel', releaseDrag);

  /* ═══════════════════════════════════════════════
     FRAME LOOP — orbit pivots, star drift, inertia decay
     ═══════════════════════════════════════════════ */
  const clock = new THREE.Clock();

  const tick = () => {
    const dt = Math.min(clock.getDelta(), 0.05);

    if (!drag.active && (Math.abs(inertia.x) > 0.01 || Math.abs(inertia.y) > 0.01)) {
      applySpin(inertia.x * 0.55, inertia.y * 0.55);
    }

    electrons.forEach((entry) => {
      entry.pivot.rotation.z += entry.spec.speed * dt;
    });

    starsA.rotation.y += 0.0045 * dt;
    starsB.rotation.y -= 0.003 * dt;

    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  };
  tick();

  /* ═══════════════════════════════════════════════
     RESIZE
     ═══════════════════════════════════════════════ */
  const resize = () => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.fov = width < 700 ? 47 : 38;
    camera.updateProjectionMatrix();
  };
  resize();
  window.addEventListener('resize', resize, { passive: true });

  window.__atomReady = true;
} catch (error) {
  document.body.classList.add('atom-failed');
  console.error('AtomHax 3D field failed to start:', error);
}

/* ═══════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════ */
function makeGlowTexture() {
  const size = 128;
  const glowCanvas = document.createElement('canvas');
  glowCanvas.width = size;
  glowCanvas.height = size;
  const context = glowCanvas.getContext('2d');
  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,0.9)');
  gradient.addColorStop(0.25, 'rgba(255,255,255,0.32)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(glowCanvas);
}

function makeStars(count, minRadius, maxRadius, size, color, opacity) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const radius = minRadius + Math.random() * (maxRadius - minRadius);
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(Math.random() * 2 - 1);
    positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = radius * Math.cos(phi);
    positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return new THREE.Points(geometry, new THREE.PointsMaterial({
    color,
    size,
    transparent: true,
    opacity,
    depthWrite: false,
  }));
}
