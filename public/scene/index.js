import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { createSky, SUN_DIR } from './sky.js';
import { createGarden } from './garden.js';
import { createMascot } from './mascot.js';
import { createEffects } from './effects.js';
import { rimUniforms } from './toon.js';

const MOBILE_QUERY = '(max-width: 800px)';
const DAIS_TOP = 0.34;
const INTRO_SECONDS = 3.4;
const INTRO_DELAY = 0.6; // seconds after the first frame, roughly the loader's fade-out

const MOOD_RIM = {
  idle: [0xffc9a0, 0.55],
  thinking: [0x8ee8ff, 0.8],
  confused: [0xd3a8ff, 0.7],
  happy: [0xffd770, 0.9],
  neutral: [0xffd6b0, 0.6],
  sad: [0x9fb0ff, 0.45],
};

const easeInOutCubic = x => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const timeout = ms => new Promise(resolve => setTimeout(resolve, ms, 'timeout'));

// Hands the main thread back so the loading screen keeps animating between setup steps.
// rAF never fires in a background tab, so a timer backs it up.
function yieldToBrowser() {
  return new Promise(resolve => {
    const fallback = setTimeout(resolve, 100);
    requestAnimationFrame(() => {
      clearTimeout(fallback);
      setTimeout(resolve, 0);
    });
  });
}

function materialsOf(object) {
  if (!object.material) return [];
  return Array.isArray(object.material) ? object.material : [object.material];
}

function texturesOf(material) {
  const found = Object.values(material).filter(v => v?.isTexture);
  for (const uniform of Object.values(material.uniforms ?? {})) if (uniform?.value?.isTexture) found.push(uniform.value);
  return found.filter(t => !t.isRenderTargetTexture);
}

function passMaterials(pass) {
  const found = [];
  for (const value of Object.values(pass)) {
    if (value?.isMaterial) found.push(value);
    else if (Array.isArray(value)) found.push(...value.filter(v => v?.isMaterial));
  }
  return found;
}

// Uploads textures and compiles + links every shader the first frame needs, a little at a time.
// Without KHR_parallel_shader_compile each program link blocks the main thread (seconds in total on
// slow or software GPUs), so it happens about one program per task instead of all in the first frame.
// Scene materials are compiled against an offscreen target because the composer renders the scene
// into one; compiling for the canvas would build different (tone-mapped) variants and waste the work.
async function warmUp(renderer, scene, camera, effects) {
  const parallel = renderer.extensions.has('KHR_parallel_shader_compile');
  const offscreen = effects.composer.renderTarget1;
  // Post-processing materials compile on the same full-screen geometry the passes draw with.
  const quadScene = new THREE.Scene();
  const quad = new FullScreenQuad()._mesh;

  const textures = new Set();
  const jobs = [];
  scene.traverseVisible(object => {
    const materials = materialsOf(object);
    if (!materials.length) return;
    materials.forEach(m => texturesOf(m).forEach(t => textures.add(t)));
    jobs.push(() => renderer.compile(object, camera, scene));
  });
  // The key light's shadow pass draws casters with a packed-depth material, back faces only.
  let caster;
  scene.traverseVisible(object => { if (!caster && object.isMesh && !object.isInstancedMesh && object.castShadow) caster = object; });
  if (caster && renderer.shadowMap.enabled) {
    const depth = new THREE.Mesh(caster.geometry, new THREE.MeshDepthMaterial({ side: THREE.BackSide }));
    jobs.push(() => {
      // Shadow passes see the lights but no fog.
      const fog = scene.fog;
      scene.fog = null;
      try {
        return renderer.compile(depth, camera, scene);
      } finally {
        scene.fog = fog;
      }
    });
  }
  const passes = effects.composer.passes;
  const output = passes[passes.length - 1]; // draws to the canvas; handled below
  for (const pass of passes) {
    if (pass === output) continue;
    for (const material of passMaterials(pass)) {
      jobs.push(() => {
        quad.material = material;
        return renderer.compile(quad, camera, quadScene);
      });
    }
  }

  let lastYield = performance.now();
  const maybeYield = async () => {
    if (performance.now() - lastYield < 30) return;
    await yieldToBrowser();
    lastYield = performance.now();
  };

  for (const texture of textures) {
    renderer.initTexture(texture);
    await maybeYield();
  }

  const pending = new Set();
  for (const job of jobs) {
    renderer.setRenderTarget(offscreen);
    const compiled = job();
    renderer.setRenderTarget(null);
    for (const material of compiled) {
      const program = renderer.properties.get(material).currentProgram;
      if (!program) continue;
      if (parallel) pending.add(program);
      else program.getUniforms(); // forces the link now, while we can still yield
    }
    await maybeYield();
  }

  // The output pass picks its defines (tone mapping, sRGB) on its first render; one cheap draw does it.
  output.renderToScreen = true;
  output.render(renderer, null, offscreen);
  await yieldToBrowser();

  // With the parallel extension, wait without blocking until the driver reports the links done.
  while (pending.size) {
    for (const program of pending) if (program.isReady()) pending.delete(program);
    if (pending.size) await timeout(16);
  }
}

// Resolves once the first frame is actually on screen, so the loader can cover shader compilation.
export async function initScene(canvas, panelEl = document.getElementById('panel')) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  // Software rendering (browser hardware acceleration off, or a blocklisted GPU) draws about one
  // frame per second at full quality, which looks frozen. Detect it up front and start light:
  // lower render resolution, no shadows, no bloom, all decided before any shader is compiled.
  const gl = renderer.getContext();
  const gpuInfo = gl.getExtension('WEBGL_debug_renderer_info');
  const gpuName = gpuInfo ? gl.getParameter(gpuInfo.UNMASKED_RENDERER_WEBGL) : 'unknown GPU';
  const softwareGpu = /swiftshader|llvmpipe|softpipe|software|basic render/i.test(gpuName);
  let pixelRatio = softwareGpu ? 0.5 : Math.min(window.devicePixelRatio, 1.5);
  renderer.setPixelRatio(pixelRatio);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = !softwareGpu;
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

  // Build in steps so the loading screen never freezes while the world is assembled.
  const sky = createSky(scene);
  await yieldToBrowser();
  const garden = createGarden(scene);
  await yieldToBrowser();
  const mascot = createMascot();
  mascot.group.position.y = DAIS_TOP;
  scene.add(mascot.group);
  await yieldToBrowser();

  const effects = createEffects(renderer, scene, camera);

  // Camera framing.
  let currentView = 'input';
  let isCinema = false;
  const cameraTargetPos = new THREE.Vector3();
  const lookTarget = new THREE.Vector3();
  const lookCurrent = new THREE.Vector3();
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let introT = reducedMotion ? 1 : 0;
  // The fly-in waits until the loader has faded and advances by at most 0.1 s per frame,
  // so start-up hitches cannot use up the animation while nobody can see it.
  let introDelay = INTRO_DELAY;
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
  let quality = softwareGpu ? 0 : 2;
  if (softwareGpu) effects.bloom.enabled = false;
  let slowFrames = 0;
  function degrade() {
    quality--;
    console.info(`[scene] slow GPU: lowering quality to level ${quality}`);
    if (quality === 1) {
      pixelRatio = 1;
      renderer.setPixelRatio(1);
      key.shadow.mapSize.set(1024, 1024);
      key.shadow.map?.dispose();
      key.shadow.map = null;
    } else {
      // Never toggle shadowMap.enabled or flag materials for update here: that recompiles every
      // shader at once and freezes the page for seconds. Freezing the shadow map is free instead.
      effects.bloom.enabled = false;
      renderer.shadowMap.autoUpdate = false;
      renderer.shadowMap.needsUpdate = true;
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

    // Skip the first seconds (every machine is busy then); degrading is cheap, it never recompiles shaders.
    if (quality > 0 && t > 3) {
      slowFrames = rawDt > 0.045 ? slowFrames + 1 : Math.max(0, slowFrames - 1);
      if (slowFrames > 40) { slowFrames = 0; degrade(); }
    }

    const parallaxX = pointer.x * (isCinema ? 0.6 : 0.35);
    const parallaxY = pointer.y * 0.2;
    camPos.set(cameraTargetPos.x + parallaxX, cameraTargetPos.y + parallaxY, cameraTargetPos.z);
    camLook.copy(lookTarget);
    if (introT < 1) {
      if (introDelay > 0) introDelay -= Math.min(camDt, 0.1);
      else introT = Math.min(1, introT + Math.min(camDt, 0.1) / INTRO_SECONDS);
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

  console.info('[scene] WebGL ready:', gpuName);
  if (softwareGpu) {
    console.warn('[scene] software rendering detected: using light mode. Turn on hardware acceleration in the browser settings for the full scene.');
  }

  // Compile every shader up front (in parallel where the driver allows) instead of
  // stalling on the first frames while the page sits empty. Never wait forever on a driver.
  const compileStart = performance.now();
  const compiled = await Promise.race([warmUp(renderer, scene, camera, effects), timeout(20000)]).catch(err => err);
  if (compiled instanceof Error) console.warn('[scene] shader warm-up failed:', compiled);
  console.info(`[scene] shaders ${compiled === 'timeout' ? 'still compiling after' : 'compiled in'} ${Math.round(performance.now() - compileStart)} ms (${renderer.info.programs.length} programs)`);

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
