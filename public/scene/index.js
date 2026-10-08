import * as THREE from 'three';
import { createSky, SUN_DIR } from './sky.js';
import { createGarden } from './garden.js';
import { createMascot } from './mascot.js';
import { createEffects } from './effects.js';
import { rimUniforms } from './toon.js';

const MOBILE_QUERY = '(max-width: 800px)';
const DAIS_TOP = 0.34;
const INTRO_SECONDS = 3.4;

const MOOD_RIM = {
  idle: [0xffc9a0, 0.55],
  thinking: [0x8ee8ff, 0.8],
  confused: [0xd3a8ff, 0.7],
  happy: [0xffd770, 0.9],
  neutral: [0xffd6b0, 0.6],
  sad: [0x9fb0ff, 0.45],
};

const easeInOutCubic = x => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

// Resolves once the first frame is actually on screen, so the loader can cover shader compilation.
export async function initScene(canvas, panelEl = document.getElementById('panel')) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  let pixelRatio = Math.min(window.devicePixelRatio, 1.5);
  renderer.setPixelRatio(pixelRatio);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 220);

  // Golden-hour lighting: violet sky bounce, warm key with shadows, hot sunset rim from behind.
  scene.add(new THREE.HemisphereLight(0xb7a6ff, 0x5a4630, 1.5));
  scene.add(new THREE.AmbientLight(0xffe4f0, 0.35));

  const key = new THREE.DirectionalLight(0xffd2a8, 2.6);
  key.position.set(4, 7, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -10;
  key.shadow.camera.right = 10;
  key.shadow.camera.top = 10;
  key.shadow.camera.bottom = -10;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 30;
  key.shadow.bias = -0.0006;
  key.shadow.normalBias = 0.02;
  key.target.position.set(0, 0, -1.5);
  scene.add(key, key.target);

  const rim = new THREE.DirectionalLight(0xff8a5c, 1.6);
  rim.position.copy(SUN_DIR).multiplyScalar(20).setY(5);
  scene.add(rim);

  const sky = createSky(scene);
  const garden = createGarden(scene);
  const mascot = createMascot();
  mascot.group.position.y = DAIS_TOP;
  scene.add(mascot.group);

  const effects = createEffects(renderer, scene, camera);

  // Camera framing.
  let currentView = 'input';
  let isCinema = false;
  const cameraTargetPos = new THREE.Vector3();
  const lookTarget = new THREE.Vector3();
  const lookCurrent = new THREE.Vector3();
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let introT = reducedMotion ? 1 : 0;
  const introFrom = new THREE.Vector3(-9, 9, 24);
  const introLookFrom = new THREE.Vector3(0, 3, -12);

  const pointer = { x: 0, y: 0 };
  const raycaster = new THREE.Raycaster();
  const pointerVec = new THREE.Vector2();

  window.addEventListener('pointermove', e => {
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
    mascot.setPointer(pointer.x, pointer.y);
  }, { passive: true });

  window.addEventListener('pointerdown', e => {
    if (e.target !== canvas) return;
    const rect = canvas.getBoundingClientRect();
    pointerVec.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointerVec.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointerVec, camera);
    if (raycaster.intersectObject(mascot.hitbox, false).length) pet();
  });

  function updateCameraTargets() {
    const mobile = window.matchMedia(MOBILE_QUERY).matches;
    const y = DAIS_TOP;
    if (isCinema) {
      cameraTargetPos.set(0, (mobile ? 1.8 : 2.0) + y, mobile ? 5.8 : 5.4);
      lookTarget.set(0, 1.25 + y, 0);
    } else if (currentView === 'result') {
      cameraTargetPos.set(mobile ? 0 : -0.5, (mobile ? 2.0 : 2.1) + y, mobile ? 6.0 : 6.2);
      lookTarget.set(0, 1.35 + y, 0);
    } else if (currentView === 'clarify') {
      cameraTargetPos.set(mobile ? 0 : -0.4, 2.1 + y, mobile ? 6.0 : 6.3);
      lookTarget.set(0, 1.3 + y, 0);
    } else if (currentView === 'compare') {
      cameraTargetPos.set(0, (mobile ? 2.4 : 2.9) + y, mobile ? 7.4 : 8.6);
      lookTarget.set(0, 1.4 + y, -1.8);
    } else {
      cameraTargetPos.set(0, (mobile ? 2.2 : 2.5) + y, mobile ? 6.8 : 7.6);
      lookTarget.set(0, 1.45 + y, -1.4);
    }
  }

  function resize() {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    effects.setSize(width, height, pixelRatio);
    // Point sprites are tuned for a 900px-tall canvas; scale so they keep the same world size.
    garden.setPixelRatio(pixelRatio * height / 900);
    camera.aspect = width / height;
    updateCameraTargets();

    const mobile = window.matchMedia(MOBILE_QUERY).matches;
    const panelWidth = panelEl && !isCinema ? panelEl.offsetWidth : 0;
    const panel = mobile || isCinema ? 0 : Math.min(panelWidth + 16, width * 0.75);
    if (panel > 0) camera.setViewOffset(width, height, panel / 2, 0, width, height);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
  }

  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  if (panelEl) observer.observe(panelEl);
  updateCameraTargets();
  // Start at the intro position (or straight at the target) so the first frame never looks wrong.
  camera.position.copy(introT < 1 ? introFrom : cameraTargetPos);
  lookCurrent.copy(introT < 1 ? introLookFrom : lookTarget);
  camera.lookAt(lookCurrent);
  resize();

  // Adaptive quality: if the GPU struggles, drop the expensive bits rather than stutter.
  let quality = 2;
  let slowFrames = 0;
  function degrade() {
    quality--;
    if (quality === 1) {
      pixelRatio = 1;
      renderer.setPixelRatio(1);
      key.shadow.mapSize.set(1024, 1024);
      key.shadow.map?.dispose();
      key.shadow.map = null;
    } else {
      effects.bloom.enabled = false;
      renderer.shadowMap.enabled = false;
      scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
    }
    resize();
  }

  const timer = new THREE.Timer();
  timer.connect(document);
  const rimTarget = new THREE.Color(MOOD_RIM.idle[0]);
  let rimStrengthTarget = MOOD_RIM.idle[1];
  const camPos = new THREE.Vector3();
  const camLook = new THREE.Vector3();

  function tick(time) {
    timer.update(time);
    const rawDt = timer.getDelta();
    const dt = Math.min(rawDt, 0.05);
    const camDt = Math.min(rawDt, 0.2); // camera uses real time so slow GPUs still arrive
    const t = timer.getElapsed();

    if (quality > 0 && t > 2) {
      slowFrames = rawDt > 0.045 ? slowFrames + 1 : Math.max(0, slowFrames - 1);
      if (slowFrames > 40) { slowFrames = 0; degrade(); }
    }

    const parallaxX = pointer.x * (isCinema ? 0.6 : 0.35);
    const parallaxY = pointer.y * 0.2;
    camPos.set(cameraTargetPos.x + parallaxX, cameraTargetPos.y + parallaxY, cameraTargetPos.z);
    camLook.copy(lookTarget);
    if (introT < 1) {
      introT = Math.min(1, introT + camDt / INTRO_SECONDS);
      const k = easeInOutCubic(introT);
      // Swing round in an arc rather than a straight dolly.
      const arc = Math.sin(k * Math.PI) * 2.5;
      camera.position.lerpVectors(introFrom, camPos, k);
      camera.position.x += arc;
      lookCurrent.lerpVectors(introLookFrom, camLook, k);
    } else {
      const smooth = 1 - Math.exp(-camDt * 3.5);
      camera.position.lerp(camPos, smooth);
      lookCurrent.lerp(camLook, smooth);
    }
    camera.lookAt(lookCurrent);

    const ease = 1 - Math.exp(-dt * 3);
    rimUniforms.rimColor.value.lerp(rimTarget, ease);
    rimUniforms.rimStrength.value += (rimStrengthTarget - rimUniforms.rimStrength.value) * ease;

    sky.update(t, dt);
    garden.update(t, dt);
    mascot.update(t, dt);
    effects.update(dt);
    effects.render();
  }

  // A driver reset or GPU overload can drop the context; show the painted fallback until it returns.
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    document.body.classList.add('no-webgl');
  });
  canvas.addEventListener('webglcontextrestored', () => {
    document.body.classList.remove('no-webgl');
  });

  const gl = renderer.getContext();
  const gpuInfo = gl.getExtension('WEBGL_debug_renderer_info');
  console.info('[scene] WebGL ready:', gpuInfo ? gl.getParameter(gpuInfo.UNMASKED_RENDERER_WEBGL) : 'unknown GPU');

  // Compile every shader up front (in parallel where the driver allows) instead of
  // stalling on the first frames while the page sits empty. Never wait forever on a driver.
  const compileStart = performance.now();
  const timeout = ms => new Promise(resolve => setTimeout(resolve, ms, 'timeout'));
  const compiled = await Promise.race([renderer.compileAsync(scene, camera), timeout(6000)]).catch(err => err);
  console.info(`[scene] shaders ${compiled === 'timeout' ? 'still compiling after' : 'compiled in'} ${Math.round(performance.now() - compileStart)} ms`);

  let firstFrame;
  const firstFrameDone = new Promise(resolve => { firstFrame = resolve; });
  let frameErrors = 0;
  const loop = time => {
    try {
      tick(time);
    } catch (err) {
      if (frameErrors++ === 0) console.error('[scene] frame failed:', err);
    }
    if (firstFrame) {
      console.info('[scene] first frame drawn');
      firstFrame();
      firstFrame = null;
    }
  };
  renderer.setAnimationLoop(loop);
  document.addEventListener('visibilitychange', () => {
    renderer.setAnimationLoop(document.hidden ? null : loop);
  });
  await Promise.race([firstFrameDone, timeout(4000)]);

  function pet() {
    mascot.pet();
    garden.burst(0.6);
    canvas.dispatchEvent(new CustomEvent('pet'));
  }

  return {
    setMood(mood) {
      mascot.setMood(mood);
      garden.setMood(mood);
      const [color, strength] = MOOD_RIM[mood] ?? MOOD_RIM.idle;
      rimTarget.set(color);
      rimStrengthTarget = strength;
      if (mood === 'happy') {
        garden.burst(1.3);
        effects.flash(0.5);
      }
    },
    showScore(score) {
      mascot.showScore(score);
      effects.flash(0.35);
    },
    hideScore: mascot.hideScore,
    setView(view) {
      currentView = view;
      updateCameraTargets();
      resize();
    },
    toggleCinema(cinema) {
      isCinema = typeof cinema === 'boolean' ? cinema : !isCinema;
      updateCameraTargets();
      resize();
      return isCinema;
    },
    setLang: mascot.setLang,
    pet,
    burst() {
      garden.burst();
    },
  };
}
