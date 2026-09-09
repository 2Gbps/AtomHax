import * as THREE from "three";

const canvas = document.getElementById("world-canvas");
const body = document.body;

if (!canvas) throw new Error("AtomHax scene canvas is missing");

try {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x071019, 0.018);

  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  camera.position.set(0, 0, 9.5);

  const world = new THREE.Group();
  const atom = new THREE.Group();
  const orbitGroup = new THREE.Group();
  const shardGroup = new THREE.Group();
  const backgroundGroup = new THREE.Group();
  world.add(backgroundGroup, atom, orbitGroup, shardGroup);
  scene.add(world);

  scene.add(new THREE.AmbientLight(0x8ac5d4, 0.6));
  const keyLight = new THREE.PointLight(0xc8ff4a, 12, 20, 2);
  keyLight.position.set(2.8, 2.6, 5.5);
  scene.add(keyLight);
  const fillLight = new THREE.PointLight(0x55d6ff, 14, 26, 2);
  fillLight.position.set(-4, -2, 3);
  scene.add(fillLight);
  const coreLight = new THREE.PointLight(0xc8ff4a, 14, 18, 2);
  coreLight.position.set(0, 0, 0);
  atom.add(coreLight);
  const rimLight = new THREE.DirectionalLight(0xff735e, 2.2);
  rimLight.position.set(-2, 4, -3);
  scene.add(rimLight);

  const glowTexture = createGlowTexture();
  const coreGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture,
    color: 0xc8ff4a,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  coreGlow.scale.setScalar(5.2);
  atom.add(coreGlow);

  const deepGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture,
    color: 0x55d6ff,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  deepGlow.scale.setScalar(11.5);
  deepGlow.position.z = -2.2;
  atom.add(deepGlow);

  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(3.4, 48, 48),
    new THREE.MeshBasicMaterial({
      color: 0x55d6ff,
      transparent: true,
      opacity: 0.045,
      side: THREE.BackSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  atom.add(atmosphere);

  const nucleus = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.56, 2),
    new THREE.MeshStandardMaterial({
      color: 0xc8ff4a,
      emissive: 0x8bc520,
      emissiveIntensity: 2.6,
      roughness: 0.2,
      metalness: 0.12,
    }),
  );
  atom.add(nucleus);

  const shellGeometry = new THREE.IcosahedronGeometry(2.45, 3);
  const shell = new THREE.Mesh(
    shellGeometry,
    new THREE.MeshStandardMaterial({
      color: 0x112c3d,
      emissive: 0x2a7a9e,
      emissiveIntensity: 1.4,
      roughness: 0.16,
      metalness: 0.18,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthWrite: true,
    }),
  );
  shell.userData.basePositions = shellGeometry.attributes.position.array.slice();
  atom.add(shell);

  const shellWire = new THREE.LineSegments(
    new THREE.WireframeGeometry(shellGeometry),
    new THREE.LineBasicMaterial({ color: 0xc8fdff, transparent: true, opacity: 0.85, depthWrite: false }),
  );
  atom.add(shellWire);

  const innerShell = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.55, 2),
    new THREE.MeshBasicMaterial({ color: 0x8ee9ff, transparent: true, opacity: 0.12, wireframe: true, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  atom.add(innerShell);

  const orbitConfigs = [
    { rotation: [-0.44, 0.2, -0.35], color: 0xc8ff4a, speed: 0.55, phase: 0.1 },
    { rotation: [0.5, -0.42, 0.65], color: 0x8ee9ff, speed: -0.38, phase: 2.1 },
    { rotation: [1.16, 0.12, -0.72], color: 0xff735e, speed: 0.28, phase: 4.3 },
    { rotation: [0.12, 0.82, 0.22], color: 0xc8ff4a, speed: 0.22, phase: 1.4 },
  ];

  const electrons = [];
  orbitConfigs.forEach((config, index) => {
    const orbit = new THREE.Group();
    orbit.rotation.set(...config.rotation);
    orbit.scale.y = 0.34 + index * 0.05;
    orbitGroup.add(orbit);

    const torus = new THREE.Mesh(
      new THREE.TorusGeometry(3.15 + index * 0.22, 0.018, 5, 160),
      new THREE.MeshBasicMaterial({ color: config.color, transparent: true, opacity: 0.9, depthWrite: false }),
    );
    orbit.add(torus);

    const electron = new THREE.Mesh(
      new THREE.SphereGeometry(0.105 + index * 0.018, 12, 12),
      new THREE.MeshStandardMaterial({
        color: config.color,
        emissive: config.color,
        emissiveIntensity: 2.4,
        roughness: 0.18,
      }),
    );
    orbit.add(electron);
    electrons.push({ orbit, electron, config, radius: 3.15 + index * 0.16 });
  });

  const backgroundRings = [];
  for (let index = 0; index < 7; index += 1) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(4.9 + index * 0.8, 0.006, 4, 180),
      new THREE.MeshBasicMaterial({
        color: index % 2 ? 0x55d6ff : 0xc8ff4a,
        transparent: true,
        opacity: 0.12 - index * 0.006,
        depthWrite: false,
      }),
    );
    ring.rotation.set(index * 0.32, index * 0.18, index * 0.21);
    ring.position.z = -1.3 - index * 0.2;
    backgroundGroup.add(ring);
    backgroundRings.push(ring);
  }

  const shardMaterials = [
    new THREE.MeshStandardMaterial({ color: 0x9deaff, emissive: 0x1a4d68, emissiveIntensity: 1.4, roughness: 0.12, metalness: 0.05, transparent: true, opacity: 0.6 }),
    new THREE.MeshStandardMaterial({ color: 0xc8ff4a, emissive: 0x3d660c, emissiveIntensity: 1.2, roughness: 0.2, transparent: true, opacity: 0.5 }),
    new THREE.MeshStandardMaterial({ color: 0xff735e, emissive: 0x6b2016, emissiveIntensity: 1.1, roughness: 0.2, transparent: true, opacity: 0.45 }),
  ];
  const shards = [];
  for (let index = 0; index < 26; index += 1) {
    const angle = (index / 26) * Math.PI * 2;
    const radius = 3.4 + (index % 5) * 0.6;
    const shard = new THREE.Mesh(
      new THREE.ConeGeometry(0.08 + (index % 3) * 0.035, 0.46 + (index % 4) * 0.15, 5),
      shardMaterials[index % shardMaterials.length],
    );
    shard.position.set(Math.cos(angle) * radius, Math.sin(angle * 1.7) * 2.2, Math.sin(angle) * radius - 0.4);
    shard.rotation.set(index * 0.7, index * 0.43, index * 0.18);
    shard.userData = { angle, radius, speed: 0.08 + (index % 4) * 0.025, baseY: shard.position.y };
    shardGroup.add(shard);
    shards.push(shard);
  }

  const particleGeometry = new THREE.BufferGeometry();
  const particleCount = 560;
  const particlePositions = new Float32Array(particleCount * 3);
  const particleColors = new Float32Array(particleCount * 3);
  for (let index = 0; index < particleCount; index += 1) {
    const radius = 5.5 + Math.random() * 7.5;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos((Math.random() * 2) - 1);
    const offset = index * 3;
    particlePositions[offset] = radius * Math.sin(phi) * Math.cos(theta);
    particlePositions[offset + 1] = radius * Math.cos(phi) * 0.72;
    particlePositions[offset + 2] = radius * Math.sin(phi) * Math.sin(theta) - 1.5;
    const color = index % 11 === 0 ? new THREE.Color(0xff735e) : index % 7 === 0 ? new THREE.Color(0xc8ff4a) : new THREE.Color(0x8ee9ff);
    particleColors[offset] = color.r;
    particleColors[offset + 1] = color.g;
    particleColors[offset + 2] = color.b;
  }
  particleGeometry.setAttribute("position", new THREE.BufferAttribute(particlePositions, 3));
  particleGeometry.setAttribute("color", new THREE.BufferAttribute(particleColors, 3));
  const particles = new THREE.Points(
    particleGeometry,
    new THREE.PointsMaterial({ size: 0.042, vertexColors: true, transparent: true, opacity: 0.78, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  backgroundGroup.add(particles);

  let targetProgress = 0;
  let progress = 0;
  let activeIndex = 0;
  let pointerX = 0;
  let pointerY = 0;
  const clock = new THREE.Clock();

  window.addEventListener("atom-scroll", (event) => {
    targetProgress = event.detail.progress;
    activeIndex = event.detail.sectionIndex;
  });
  window.addEventListener("atom-pointer", (event) => {
    pointerX = event.detail.x - 0.5;
    pointerY = event.detail.y - 0.5;
  });

  const resize = () => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, width < 700 ? 1.25 : 1.8));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.fov = width < 700 ? 39 : 32;
    camera.updateProjectionMatrix();
  };

  const tick = () => {
    const elapsed = clock.getElapsedTime();
    progress += (targetProgress - progress) * (reduced ? 0.2 : 0.055);
    const scenePhase = progress * Math.PI * 2;
    const widthFactor = window.innerWidth < 700 ? 0.72 : 1;

    world.rotation.y += (0.0009 + progress * 0.0022) * (reduced ? 0.2 : 1);
    world.rotation.x = Math.sin(elapsed * 0.12) * 0.04 + progress * 0.22;
    world.position.x += ((0.8 * widthFactor + pointerX * 0.46 * widthFactor) - world.position.x) * 0.025;
    world.position.y += ((-pointerY * 0.24) - world.position.y) * 0.025;

    camera.position.x += ((Math.sin(scenePhase * 0.8) * 0.7 + pointerX * 0.8) * widthFactor - camera.position.x) * 0.025;
    camera.position.y += ((Math.cos(scenePhase * 0.65) * 0.25 - pointerY * 0.45) - camera.position.y) * 0.025;
    camera.position.z += ((9.5 - Math.sin(progress * Math.PI) * 1.5) - camera.position.z) * 0.025;
    camera.lookAt(0.8, 0, -0.5);

    nucleus.rotation.x = elapsed * 0.22;
    nucleus.rotation.y = elapsed * 0.34;
    const pulse = 1 + Math.sin(elapsed * 2.4) * 0.055 + Math.sin(progress * Math.PI) * 0.08;
    nucleus.scale.setScalar(pulse);
    coreGlow.material.opacity = 0.46 + Math.sin(elapsed * 1.9) * 0.08;
    coreGlow.scale.setScalar(4.6 + Math.sin(elapsed * 1.4) * 0.35);
    deepGlow.material.opacity = 0.2 + Math.sin(elapsed * 0.9) * 0.04;
    innerShell.rotation.x = elapsed * 0.14;
    innerShell.rotation.y = elapsed * 0.24;
    atmosphere.rotation.y = elapsed * 0.03;

    const shellPositions = shellGeometry.attributes.position;
    const base = shell.userData.basePositions;
    for (let index = 0; index < shellPositions.count; index += 1) {
      const offset = index * 3;
      const wobble = 1 + Math.sin(elapsed * 0.75 + index * 0.17 + activeIndex * 0.8) * (0.032 + activeIndex * 0.009);
      shellPositions.setXYZ(index, base[offset] * wobble, base[offset + 1] * wobble, base[offset + 2] * wobble);
    }
    shellPositions.needsUpdate = true;
    shell.rotation.y = elapsed * 0.08 - progress * 1.6;
    shell.rotation.z = Math.sin(elapsed * 0.3) * 0.08;
    shellWire.rotation.copy(shell.rotation);
    shell.scale.setScalar(1 + Math.sin(progress * Math.PI) * 0.15);
    shellWire.scale.copy(shell.scale);
    shell.material.opacity = Math.min(0.95, 0.65 + activeIndex * 0.06);
    shellWire.material.opacity = Math.min(0.95, 0.7 + activeIndex * 0.05);

    electrons.forEach((entry, index) => {
      const angle = elapsed * entry.config.speed + entry.config.phase + progress * (index % 2 ? 2.6 : -2.1);
      entry.electron.position.set(Math.cos(angle) * entry.radius, Math.sin(angle) * entry.radius, 0);
      entry.electron.scale.setScalar(1 + Math.sin(elapsed * 2 + index) * 0.12);
    });

    shards.forEach((shard, index) => {
      const data = shard.userData;
      const angle = data.angle + elapsed * data.speed + progress * 2.2;
      const distance = data.radius + Math.sin(elapsed * 0.5 + index) * 0.12;
      shard.position.x = Math.cos(angle) * distance;
      shard.position.z = Math.sin(angle) * distance - 0.4;
      shard.position.y = data.baseY + Math.sin(elapsed * 0.7 + index * 0.4) * 0.18;
      shard.rotation.x += 0.002;
      shard.rotation.y += 0.003;
    });

    backgroundRings.forEach((ring, index) => {
      ring.rotation.z += (0.00035 + index * 0.00009) * (index % 2 ? -1 : 1);
      ring.rotation.x = Math.sin(elapsed * 0.12 + index) * 0.12 + index * 0.32;
    });
    particles.rotation.y = elapsed * 0.008 + progress * 0.9;
    particles.rotation.x = Math.sin(elapsed * 0.08) * 0.06;

    renderer.render(scene, camera);
    window.requestAnimationFrame(tick);
  };

  resize();
  window.addEventListener("resize", resize, { passive: true });
  body.classList.add("scene-ready");
  window.dispatchEvent(new Event("atom-scene-ready"));
  window.requestAnimationFrame(tick);
} catch (error) {
  body.classList.add("scene-fallback");
  console.error("AtomHax WebGL scene failed", error);
}

function createGlowTexture() {
  const size = 128;
  const glowCanvas = document.createElement("canvas");
  glowCanvas.width = size;
  glowCanvas.height = size;
  const context = glowCanvas.getContext("2d");
  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, "rgba(200,255,74,0.95)");
  gradient.addColorStop(0.2, "rgba(200,255,74,0.38)");
  gradient.addColorStop(1, "rgba(200,255,74,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(glowCanvas);
}
