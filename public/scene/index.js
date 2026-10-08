import * as THREE from 'three';
import { createGarden } from './garden.js';
import { createMascot } from './mascot.js';

const MOBILE_QUERY = '(max-width: 800px)';

export function initScene(canvas, panelEl = document.getElementById('panel')) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 120);

  // Lighting setup for rich Japanese anime cel-shading
  const hemiLight = new THREE.HemisphereLight(0xfff7ee, 0x93ce80, 1.8);
  scene.add(hemiLight);

  // Warm key sunlight
  const sun = new THREE.DirectionalLight(0xfff8ed, 2.4);
  sun.position.set(4.5, 9, 6);
  scene.add(sun);

  // Cool rim backlight for character silhouette
  const rimLight = new THREE.DirectionalLight(0xb2d9ff, 0.75);
  rimLight.position.set(-4, 6, -5);
  scene.add(rimLight);

  const garden = createGarden(scene);
  const mascot = createMascot();
  scene.add(mascot.group);

  // Camera framing states
  let currentView = 'input';
  let isCinema = false;
  const cameraTargetPos = new THREE.Vector3(0, 2.3, 7.2);
  const lookTarget = new THREE.Vector3(0, 1.3, -1.2);
  const lookTargetCurrent = new THREE.Vector3(0, 1.3, -1.2);

  // Mouse Parallax & Mascot Look-at
  const pointer = { x: 0, y: 0 };
  const raycaster = new THREE.Raycaster();
  const pointerVec = new THREE.Vector2();

  function onPointerMove(e) {
    const x = (e.clientX / window.innerWidth) * 2 - 1;
    const y = -(e.clientY / window.innerHeight) * 2 + 1;
    pointer.x = x;
    pointer.y = y;
    mascot.setPointer(x, y);
  }
  window.addEventListener('pointermove', onPointerMove, { passive: true });

  // Raycasting click to pet mascot
  function onPointerDown(e) {
    if (e.target !== canvas) return;
    pointerVec.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointerVec.y = -(e.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(pointerVec, camera);
    const intersects = raycaster.intersectObjects(mascot.group.children, true);
    if (intersects.length > 0) {
      mascot.pet();
      garden.burst();
    }
  }
  window.addEventListener('pointerdown', onPointerDown);

  function updateCameraTargets() {
    const mobile = window.matchMedia(MOBILE_QUERY).matches;

    if (isCinema) {
      cameraTargetPos.set(0, mobile ? 1.6 : 1.8, mobile ? 4.8 : 4.4);
      lookTarget.set(0, 1.1, 0);
      return;
    }

    if (currentView === 'result') {
      cameraTargetPos.set(mobile ? 0 : -0.4, mobile ? 1.9 : 2.0, mobile ? 5.6 : 5.8);
      lookTarget.set(0, 1.15, 0);
    } else if (currentView === 'clarify') {
      cameraTargetPos.set(mobile ? 0 : -0.3, mobile ? 1.9 : 2.0, mobile ? 5.7 : 6.0);
      lookTarget.set(0, 1.25, 0);
    } else if (currentView === 'compare') {
      cameraTargetPos.set(0, mobile ? 2.1 : 2.4, mobile ? 6.5 : 7.6);
      lookTarget.set(0, 1.3, -1.5);
    } else {
      // default 'input'
      cameraTargetPos.set(0, mobile ? 2.0 : 2.3, mobile ? 6.2 : 7.2);
      lookTarget.set(0, 1.3, -1.2);
    }
  }

  function resize() {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;

    updateCameraTargets();

    const mobile = window.matchMedia(MOBILE_QUERY).matches;
    const panelWidth = panelEl && !isCinema ? panelEl.offsetWidth : 0;
    const panel = mobile || isCinema ? 0 : Math.min(panelWidth + 16, width * 0.75);

    if (panel > 0) {
      camera.setViewOffset(width, height, panel / 2, 0, width, height);
    } else {
      camera.clearViewOffset();
    }
    camera.updateProjectionMatrix();
  }

  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  if (panelEl) observer.observe(panelEl);
  resize();

  // Animation Loop using THREE.Timer
  const timer = new THREE.Timer();
  timer.connect(document);

  function tick(time) {
    timer.update(time);
    const dt = Math.min(timer.getDelta(), 0.05);
    const t = timer.getElapsed();

    // Smooth camera mouse parallax + view transition
    const parallaxX = pointer.x * (isCinema ? 0.6 : 0.35);
    const parallaxY = pointer.y * 0.2;
    const smoothFactor = 1 - Math.exp(-dt * 3.5);

    camera.position.x += (cameraTargetPos.x + parallaxX - camera.position.x) * smoothFactor;
    camera.position.y += (cameraTargetPos.y + parallaxY - camera.position.y) * smoothFactor;
    camera.position.z += (cameraTargetPos.z - camera.position.z) * smoothFactor;

    lookTargetCurrent.lerp(lookTarget, smoothFactor);
    camera.lookAt(lookTargetCurrent);

    garden.update(t, dt);
    mascot.update(t, dt);
    renderer.render(scene, camera);
  }

  renderer.setAnimationLoop(tick);
  document.addEventListener('visibilitychange', () => {
    renderer.setAnimationLoop(document.hidden ? null : tick);
  });

  return {
    setMood(mood) {
      mascot.setMood(mood);
      if (mood === 'happy') garden.burst();
    },
    showScore: mascot.showScore,
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
    pet() {
      mascot.pet();
      garden.burst();
    },
    burst() {
      garden.burst();
    },
  };
}
