import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { animate, createTimeline, createScope, onScroll, spring } from 'animejs';
import 'animejs/adapters/three';

const canvas = document.getElementById('atom-canvas');
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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
     AURORA SCROLL ENERGY — page scroll feeds the
     field; observer created once, independent of the
     pose timeline.
     ═══════════════════════════════════════════════ */
  onScroll({
    target: document.body,
    syncSmooth: 0.3,
    onUpdate: (self) => {
      auroraUniforms.uScroll.value = self.progress;
    },
  });

  /* ═══════════════════════════════════════════════
     SCROLL CHOREOGRAPHY — the atom holds the half of
     the screen the copy is not using: left through the
     hero and showcase (copy right), right margin through
     the features (copy left), far right for the download.
     It crosses the middle low, under the copy.

     anime.js maps scroll progress over the body's whole
     viewport traversal, so the page only ever reaches
     ~0.86 of the timeline; poseWatch pins the span to a
     full 1000 units so keyframe positions stay predictable.
     ═══════════════════════════════════════════════ */
  let poseTimeline = null;
  const poseWatch = { progress: 0 };

  const scope = createScope({
    root: document.body,
    mediaQueries: { mobile: '(max-width: 700px)' },
  });

  scope.add(({ matches }) => {
    const mobile = matches.mobile;
    if (poseTimeline) poseTimeline.revert();

    const drift = mobile ? 0.3 : 1;

    poseTimeline = createTimeline({
      autoplay: onScroll({ target: document.body, syncSmooth: 0.3 }),
      defaults: { ease: 'inOutCubic' },
    })
      .add(poseWatch, { progress: 1, duration: 1000, ease: 'linear' }, 0)
      .add(scrollRig, { x: (mobile ? 1.75 : -1.75) * drift, y: 0.28, rotateY: -12, rotateX: 0, scale: mobile ? 0.62 : 0.82, duration: 130 }, 0)
      .add(camera, { z: 8.2, y: 0.9, duration: 130 }, 0)
      .add(scrollRig, { x: (mobile ? 2.05 : -2.05) * drift, y: 0.1, rotateY: -70, rotateX: 18, scale: mobile ? 0.68 : 0.95, duration: 130 }, 130)
      .add(camera, { z: 7.9, y: 0.95, duration: 130 }, 130)
      .add(scrollRig, { x: (mobile ? 1.95 : -1.95) * drift, y: -0.3, rotateY: -150, rotateX: 0, scale: mobile ? 0.66 : 0.9, duration: 370 }, 130)
      .add(camera, { z: 8.1, y: 0.6, duration: 370 }, 130)
      .add(scrollRig, { x: 0, y: -2.2, rotateY: -230, rotateX: -4, scale: mobile ? 0.42 : 0.5, duration: 30 }, 610)
      .add(camera, { z: 8.7, y: 0.3, duration: 30 }, 610)
      .add(scrollRig, { x: 4.2 * drift, y: -1.6, rotateY: -310, rotateX: -16, scale: mobile ? 0.44 : 0.55, duration: 30 }, 640)
      .add(camera, { z: 8.9, y: 0.45, duration: 30 }, 640)
      .add(scrollRig, { x: 4.2 * drift, y: -1.55, rotateY: -330, rotateX: -8, scale: mobile ? 0.44 : 0.56, duration: 30 }, 680)
      .add(camera, { z: 8.9, y: 0.45, duration: 30 }, 680)
      .add(scrollRig, { x: 4.3 * drift, y: -0.7, rotateY: -360, rotateX: 0, scale: mobile ? 0.46 : 0.62, duration: 35 }, 820)
      .add(camera, { z: 8.3, y: 0.35, duration: 35 }, 820);
  });

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
     FRAME LOOP — inertia decay, orbit pivots, aurora clock
     ═══════════════════════════════════════════════ */
  const clock = new THREE.Clock();

  const tick = () => {
    const dt = Math.min(clock.getDelta(), 0.05);

    auroraUniforms.uTime.value = clock.getElapsedTime();

    if (!drag.active && (Math.abs(inertia.x) > 0.01 || Math.abs(inertia.y) > 0.01)) {
      applySpin(inertia.x * 0.55, inertia.y * 0.55);
    }

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


