import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { animate, spring } from 'animejs';
import 'animejs/adapters/three';

const canvas = document.getElementById('atom-canvas');
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

try {
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
  renderer.toneMappingExposure = 1.15;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 60);
  camera.position.set(0, 0.6, 8.2);
  camera.lookAt(0, 0, 0);

  /* ─── chrome material ─── */
  const chrome = new THREE.MeshPhysicalMaterial({
    color: 0xdfe5ea,
    metalness: 1,
    roughness: 0.07,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
    envMapIntensity: 1.5,
  });

  /* ─── atom group ─── */
  const atom = new THREE.Group();
  scene.add(atom);

  /* nucleus cluster: core + 4 nucleons on tetrahedral offsets */
  const nucleus = new THREE.Group();
  atom.add(nucleus);
  const coreGeo = new THREE.SphereGeometry(0.5, 48, 48);
  const nucleonGeo = new THREE.SphereGeometry(0.27, 32, 32);
  const core = new THREE.Mesh(coreGeo, chrome);
  nucleus.add(core);
  const tetra = [
    [0.42, 0.34, 0.30],
    [-0.42, 0.28, -0.26],
    [0.18, -0.44, 0.32],
    [-0.16, -0.30, 0.46],
  ];
  tetra.forEach((offset) => {
    const nucleon = new THREE.Mesh(nucleonGeo, chrome);
    nucleon.position.set(...offset);
    nucleus.add(nucleon);
  });

  /* ─── 3 orbit rings at 120°, standing like the classic atom symbol ─── */
  const electrons = [];
  const ringRadii = [2.05, 2.5, 2.95];
  const ringTilts = [24, 30, 20];
  const orbitSpeeds = [1.35, -1.0, 0.7];
  ringRadii.forEach((radius, i) => {
    const container = new THREE.Group();
    container.rotation.y = (i * Math.PI * 2) / 3;
    atom.add(container);

    const ringGroup = new THREE.Group();
    ringGroup.rotation.x = THREE.MathUtils.degToRad(ringTilts[i]);
    ringGroup.rotation.z = THREE.MathUtils.degToRad(i * 6 - 6);
    container.add(ringGroup);

    const torus = new THREE.Mesh(
      new THREE.TorusGeometry(radius, 0.032, 24, 180),
      chrome,
    );
    ringGroup.add(torus);

    const pivot = new THREE.Group();
    ringGroup.add(pivot);

    const electron = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 32, 32),
      new THREE.MeshPhysicalMaterial({
        color: 0xeef2f5,
        metalness: 1,
        roughness: 0.12,
        clearcoat: 1,
        envMapIntensity: 1.6,
        emissive: 0x000000,
        emissiveIntensity: 0.6,
        transparent: true,
        opacity: 1,
      }),
    );
    electron.position.x = radius;
    pivot.add(electron);
    electrons.push({ pivot, electron, baseSpeed: orbitSpeeds[i], phase: i * 2.1 });
  });

  /* faint distant particles for depth */
  const starGeo = new THREE.BufferGeometry();
  const starCount = 260;
  const starPos = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const r = 12 + Math.random() * 16;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(Math.random() * 2 - 1);
    starPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    starPos[i * 3 + 1] = r * Math.cos(phi);
    starPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const stars = new THREE.Points(
    starGeo,
    new THREE.PointsMaterial({ color: 0x9fb4c4, size: 0.05, transparent: true, opacity: 0.5, depthWrite: false }),
  );
  scene.add(stars);

  /* colored rim lights to tint the chrome */
  const limeLight = new THREE.PointLight(0xc8ff4a, 18, 30, 2);
  limeLight.position.set(5, 3, 4);
  scene.add(limeLight);
  const cyanLight = new THREE.PointLight(0x55d6ff, 14, 30, 2);
  cyanLight.position.set(-5, -2.5, 3);
  scene.add(cyanLight);

  /* ─── drag to rotate (orbit target offset left so the atom sits right of frame) ─── */
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(-1.5, 0.15, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.enableZoom = false;
  controls.enablePan = false;
  controls.autoRotate = false;
  controls.minPolarAngle = Math.PI * 0.22;
  controls.maxPolarAngle = Math.PI * 0.78;

  /* ─── anime.js adapter drives the atom ─── */
  animate(atom, {
    scale: [0, 1],
    duration: 1400,
    ease: spring({ stiffness: 70, damping: 11 }),
  });

  if (!reduced) {
    animate(atom, {
      rotateY: 360,
      duration: 90000,
      ease: 'linear',
      loop: true,
    });
  }

  if (!reduced) {
    animate(core, {
      scale: 1.06,
      duration: 2600,
      alternate: true,
      loop: true,
      ease: 'inOutSine',
    });
    electrons.forEach((entry) => {
      animate(entry.electron, {
        rotateZ: 360,
        duration: 5200 + Math.random() * 1600,
        ease: 'linear',
        loop: true,
      });
    });
  }

  /* ─── hover: excite ─── */
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2(-2, -2);
  const hitTargets = [core, ...electrons.map((e) => e.electron)];
  const hoverState = { excited: false, speed: 1, targetSpeed: 1 };

    const excite = () => {
    if (hoverState.excited) return;
    hoverState.excited = true;
    hoverState.targetSpeed = 3.4;
    electrons.forEach((entry, i) => {
      animate(entry.electron, {
        scale: 1.5,
        duration: 550,
        ease: spring({ stiffness: 180, damping: 13 }),
        delay: i * 40,
      });
      animate(entry.electron.material, {
        emissive: '#c8ff4a',
        emissiveIntensity: 1.6,
        duration: 300,
        ease: 'outCubic',
      });
    });
  };

  const calm = () => {
    if (!hoverState.excited) return;
    hoverState.excited = false;
    hoverState.targetSpeed = 1;
    electrons.forEach((entry) => {
      animate(entry.electron, { scale: 1, duration: 700, ease: 'outCubic' });
      animate(entry.electron.material, {
        emissive: '#000000',
        emissiveIntensity: 0.6,
        duration: 700,
        ease: 'outCubic',
      });
    });
  };

  canvas.addEventListener('pointermove', (event) => {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  });
  canvas.addEventListener('pointerleave', () => {
    pointer.set(-2, -2);
    calm();
  });

  /* ─── frame loop ─── */
  const clock = new THREE.Clock();
  const tick = () => {
    const dt = Math.min(clock.getDelta(), 0.05);
    controls.update();

    hoverState.speed += (hoverState.targetSpeed - hoverState.speed) * 0.06;
    electrons.forEach((entry, i) => {
      entry.pivot.rotation.z += entry.baseSpeed * hoverState.speed * dt;
    });

    nucleus.rotation.y += 0.12 * dt;
    stars.rotation.y += 0.004 * dt;

    /* hover raycast */
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(hitTargets, false);
    if (hits.length > 0) excite();
    else if (hoverState.excited && pointer.x > -2) calm();

    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  };
  tick();

  const resize = () => {
    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.fov = width < 700 ? 46 : 38;
    camera.updateProjectionMatrix();
  };
  resize();
  window.addEventListener('resize', resize, { passive: true });

  window.__atomReady = true;
} catch (error) {
  document.body.classList.add('atom-failed');
  console.error('AtomHax 3D atom failed to start:', error);
}
