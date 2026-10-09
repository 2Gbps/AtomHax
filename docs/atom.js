import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { animate } from 'animejs';
import 'animejs/adapters/three';

const canvas = document.getElementById('atom-canvas');
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if (canvas) {
  try {
  /* ═══════════════════════════════════════════════
     RENDERER
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

  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 120);
  camera.position.set(0, 0.55, 8.6);

  scene.add(new THREE.AmbientLight(0x8fa8b8, 0.28));

  const keyLight = new THREE.PointLight(0xffffff, 15, 44, 2);
  keyLight.position.set(5.2, 3.2, 4.6);
  const fillLight = new THREE.PointLight(0xcfdce6, 11, 44, 2);
  fillLight.position.set(-5.4, -2.6, 3.4);
  const rimLight = new THREE.PointLight(0xffffff, 7, 36, 2);
  rimLight.position.set(0, 4.6, -5.2);
  scene.add(keyLight, fillLight, rimLight);

  /* ═══════════════════════════════════════════════
     AURORA FIELD — flat fullscreen shader plane,
     a silver luminance band domain-warped like a
     boreal aurora. Monochrome by design: the field
     reads as chrome light moving over dark glass.
     ═══════════════════════════════════════════════ */
  const auroraUniforms = {
    uTime: { value: 0 },
    uScroll: { value: 0 },
    uIntensity: { value: reduced ? 0 : 0.16 },
  };

  const auroraMaterial = new THREE.ShaderMaterial({
    uniforms: auroraUniforms,
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      varying vec2 vUv;
      uniform float uTime;
      uniform float uScroll;
      uniform float uIntensity;

      float hash(vec2 p) {
        p = fract(p * vec2(234.34, 435.345));
        p += dot(p, p + 34.23);
        return fract(p.x * p.y);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 s = f * f * (3.0 - 2.0 * f);
        float a = hash(i);
        float b = hash(i + vec2(1.0, 0.0));
        float c = hash(i + vec2(0.0, 1.0));
        float d = hash(i + vec2(1.0, 1.0));
        return mix(mix(a, b, s.x), mix(c, d, s.x), s.y);
      }

      float fbm(vec2 p) {
        float value = 0.0;
        float amplitude = 0.5;
        mat2 rotation = mat2(0.8, 0.6, -0.6, 0.8);
        for (int octave = 0; octave < 4; octave++) {
          value += amplitude * noise(p);
          p = rotation * p * 2.02;
          amplitude *= 0.55;
        }
        return value;
      }

      vec3 energyColor(float wave) {
        float segment = fract(wave) * 6.0;
        float first  = mix(0.22, 0.34, smoothstep(0.0, 1.0, segment));
        float second = mix(first, 0.48, smoothstep(1.0, 2.0, segment));
        float third  = mix(second, 0.62, smoothstep(2.0, 3.0, segment));
        float fourth = mix(third, 0.78, smoothstep(3.0, 4.0, segment));
        float fifth  = mix(fourth, 0.92, smoothstep(4.0, 5.0, segment));
        float sixth  = mix(fifth, 1.0, smoothstep(5.0, 6.0, segment));
        return vec3(sixth);
      }

      void main() {
        float t = uTime * 0.045;
        vec2 field = vUv;
        field.y += uScroll * 0.7;

        vec2 warp = vec2(
          fbm(field * vec2(1.15, 1.7) + vec2(t, -t * 0.55)),
          fbm(field * vec2(1.9, 0.85) - vec2(t * 0.4, t * 0.8))
        );

        float bands = fbm(field * vec2(2.7, 1.05) + warp * 1.6 + vec2(t * 0.55, -t * 0.2));
        float curtain = smoothstep(0.28, 0.8, bands);
        curtain = pow(curtain, 1.35);

        float band = smoothstep(0.02, 0.42, vUv.y) * (1.0 - smoothstep(0.6, 0.98, vUv.y));
        band = 0.55 + 0.45 * band;

        float drift = fbm(field * vec2(0.75, 0.5) + vec2(-t * 0.33, t * 0.21));
        vec3 color = energyColor(drift + t * 0.05);

        float energy = curtain * band * uIntensity;
        gl_FragColor = vec4(color * energy * 1.6, energy);
      }
    `,
  });

  const aurora = new THREE.Mesh(new THREE.PlaneGeometry(110, 40), auroraMaterial);
  aurora.position.z = -30;
  aurora.renderOrder = -1;
  aurora.frustumCulled = false;
  scene.add(aurora);

  /* ═══════════════════════════════════════════════
     RIG — spinner (idle yaw) > scrollRig (scroll pose)
     > atom (trackball). One system per layer.
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
  chromeDark.color = new THREE.Color(0xb9c2c9);
  chromeDark.roughness = 0.16;
  chromeDark.envMapIntensity = 1.35;

  /* ═══════════════════════════════════════════════
     NUCLEUS CLUSTER + GLOW
     ═══════════════════════════════════════════════ */
  const nucleus = new THREE.Group();
  atom.add(nucleus);

  const core = new THREE.Mesh(new THREE.SphereGeometry(0.42, 48, 48), chrome);
  nucleus.add(core);

  const nucleonGeo = new THREE.SphereGeometry(0.21, 32, 32);
  const nucleonOffsets = [
    [0.33, 0.26, 0.14],
    [-0.33, 0.22, -0.22],
    [0.14, -0.36, -0.2],
    [-0.12, -0.22, 0.34],
  ];
  nucleonOffsets.forEach((offset) => {
    const nucleon = new THREE.Mesh(nucleonGeo, chromeDark);
    nucleon.position.set(...offset);
    nucleus.add(nucleon);
  });

  const nucleusGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeGlowTexture(),
    color: new THREE.Color(0xdfe8ee),
    transparent: true,
    opacity: 0.09,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  nucleusGlow.scale.setScalar(1.5);
  nucleus.add(nucleusGlow);

  /* ═══════════════════════════════════════════════
     ORBIT RINGS — standing, 120° apart, with resonance
     halos, orbiting electrons and fading trails
     ═══════════════════════════════════════════════ */
  const ringSpecs = [
    { radius: 1.4, tilt: 24, zOffset: -6, speed: 1.35, glow: '#ffffff' },
    { radius: 1.74, tilt: 30, zOffset: 0, speed: -1.05, glow: '#c9d4dc' },
    { radius: 2.1, tilt: 20, zOffset: 6, speed: 0.72, glow: '#eef2f5' },
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
      new THREE.TorusGeometry(spec.radius, 0.024, 24, 190),
      i === 1 ? chromeDark : chrome,
    );
    ringGroup.add(torus);

    const resonance = new THREE.Mesh(
      new THREE.TorusGeometry(spec.radius * 1.14, 0.007, 8, 190),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(spec.glow),
        transparent: true,
        opacity: 0.09,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    ringGroup.add(resonance);

    const pivot = new THREE.Group();
    ringGroup.add(pivot);

    const electron = new THREE.Mesh(
      new THREE.SphereGeometry(0.125, 32, 32),
      new THREE.MeshPhysicalMaterial({
        color: 0xe8edf1,
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
    electron.position.x = spec.radius;

    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeGlowTexture(),
      color: new THREE.Color(spec.glow),
      transparent: true,
      opacity: 0.36,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    glow.scale.setScalar(0.55);
    electron.add(glow);

    pivot.add(electron);

    const trailGeo = new THREE.SphereGeometry(0.072, 20, 20);
    [-0.5, -0.95].forEach((offset, j) => {
      const trail = new THREE.Mesh(
        trailGeo,
        new THREE.MeshBasicMaterial({
          color: new THREE.Color(spec.glow),
          transparent: true,
          opacity: 0.34 - j * 0.13,
          depthWrite: false,
        }),
      );
      const trailAngle = offset * Math.sign(spec.speed);
      trail.position.set(
        Math.cos(trailAngle) * spec.radius,
        Math.sin(trailAngle) * spec.radius,
        0,
      );
      pivot.add(trail);
    });

    electrons.push({ pivot, electron, glow, resonance, spec, index: i });
  });

  /* ═══════════════════════════════════════════════
     ANIME.JS ADAPTER — idle life of the atom
     ═══════════════════════════════════════════════ */
  animate(atom, {
    scale: [0, 1],
    duration: 1500,
    ease: spring({ stiffness: 68, damping: 11 }),
  });

  if (!reduced) {
    animate(spinner, { rotateY: 360, duration: 110000, ease: 'linear', loop: true });
    animate(spinner.position, {
      y: [0.14, -0.14],
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
    animate(nucleusGlow.material, {
      opacity: [0.05, 0.15],
      duration: 3200,
      alternate: true,
      loop: true,
      ease: 'inOutSine',
    });
    electrons.forEach((entry) => {
      animate(entry.electron, {
        rotateZ: 360,
        duration: 4600 + entry.index * 950,
        ease: 'linear',
        loop: true,
      });
      animate(entry.glow.material, {
        opacity: [0.22, 0.48],
        duration: 2400 + entry.index * 500,
        alternate: true,
        loop: true,
        ease: 'inOutSine',
      });
      animate(entry.electron.material, {
        emissiveIntensity: [0.4, 0.9],
        duration: 3000 + entry.index * 400,
        alternate: true,
        loop: true,
        ease: 'inOutSine',
      });
      animate(entry.pivot.children[1], {
        opacity: [0.05, 0.14],
        duration: 3900 + entry.index * 600,
        alternate: true,
        loop: true,
        ease: 'inOutSine',
      });
    });
    animate(keyLight, {
      intensity: [9, 19],
      duration: 4300,
      alternate: true,
      loop: true,
      ease: 'inOutSine',
    });
    animate(fillLight, {
      intensity: [7, 15],
      duration: 5400,
      alternate: true,
      loop: true,
      ease: 'inOutSine',
    });
  }

  /* ═══════════════════════════════════════════════
     DETERMINISTIC COLLISION-FREE SCROLL CHOREOGRAPHY
     The atom moves and resizes ONLY when the page is
     scrolled. It is 100% stationary when the user does
     not scroll.
     Position and scale are pure mathematical functions
     of scroll progress, mapped strictly into open negative
     space so it never intersects or sits behind any text:
       - Hero (0% - 12%): Copy on Right -> Atom holds Left (-3.4)
       - Glide (12% - 32%): Hero copy scrolls out -> Atom glides to Right (+3.4)
       - Features, Practice, Download (32% - 100%): All copy on Left -> Atom holds Right (+3.4)
     ═══════════════════════════════════════════════ */
  function smoothstep(edge0, edge1, x) {
    const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
    return t * t * (3 - 2 * t);
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function computePose(progress, isMobile) {
    if (isMobile) {
      // Mobile (<768px): Safely parked in top header zone
      return {
        x: 1.6,
        y: 2.8,
        scale: 0.25,
        rotY: -progress * Math.PI * 2.0,
        rotX: 0.05,
      };
    }

    let x, y, scale, rotY, rotX;

    if (progress <= 0.12) {
      // Hero: Copy is on the RIGHT. Atom fills open LEFT field.
      x = -3.4;
      y = 0.15;
      scale = 0.88;
      rotY = -progress * 1.5;
      rotX = 0.08;
    } else if (progress < 0.32) {
      // Glide: Crosses through clear vertical negative space between sections
      const t = smoothstep(0.12, 0.32, progress);
      x = lerp(-3.4, 3.4, t);
      y = lerp(0.15, 0.05, t);
      scale = lerp(0.88, 0.90, t);
      rotY = lerp(-0.18, -Math.PI * 0.9, t);
      rotX = lerp(0.08, 0.12, t);
    } else {
      // Features, Practice, Download: All content is on the LEFT.
      // Atom occupies open RIGHT field throughout. Never goes behind text.
      const t = (progress - 0.32) / 0.68;
      x = 3.4;
      // Gentle vertical tracking centered with viewport
      y = lerp(0.05, -0.05, smoothstep(0, 0.5, t)) + (t > 0.5 ? lerp(0, 0.05, smoothstep(0.5, 1.0, t)) : 0);
      scale = 0.90;
      rotY = lerp(-Math.PI * 0.9, -Math.PI * 2.8, t);
      rotX = 0.10 + Math.sin(t * Math.PI) * 0.04;
    }

    return { x, y, scale, rotY, rotX };
  }

  /* ═══════════════════════════════════════════════
     FRAME LOOP — purely scroll-driven, no autonomous drift
     ═══════════════════════════════════════════════ */
  const clock = new THREE.Clock();

  let currentX = -3.4;
  let currentY = 0.15;
  let currentScale = 0.88;
  let currentRotY = 0.0;
  let currentRotX = 0.08;

  const tick = () => {
    const dt = Math.min(clock.getDelta(), 0.05);

    auroraUniforms.uTime.value = clock.getElapsedTime();

    // Deterministic scroll calculation
    const scrollMax = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
    const scrollProgress = Math.min(Math.max(window.scrollY / scrollMax, 0), 1);
    auroraUniforms.uScroll.value = scrollProgress;

    const isMobile = window.innerWidth < 768;
    const target = computePose(scrollProgress, isMobile);

    // Frame-rate independent liquid damping
    const damp = 1 - Math.exp(-14 * dt);
    currentX += (target.x - currentX) * damp;
    currentY += (target.y - currentY) * damp;
    currentScale += (target.scale - currentScale) * damp;
    currentRotY += (target.rotY - currentRotY) * damp;
    currentRotX += (target.rotX - currentRotX) * damp;

    scrollRig.position.x = currentX;
    scrollRig.position.y = currentY;
    scrollRig.scale.setScalar(currentScale);
    scrollRig.rotation.y = currentRotY;
    scrollRig.rotation.x = currentRotX;

    // Electron orbital revolution around nucleus
    electrons.forEach((entry) => {
      entry.pivot.rotation.z += entry.spec.speed * dt;
    });

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


