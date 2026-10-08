import * as THREE from 'three';
import { createGarden } from './garden.js';
import { createMascot } from './mascot.js';

const MOBILE_QUERY = '(max-width: 800px)';

export function initScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  const lookTarget = new THREE.Vector3(0, 1.3, -1.5);

  scene.add(new THREE.HemisphereLight(0xfff6ee, 0x9fd48b, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(4, 8, 6);
  scene.add(sun);

  const garden = createGarden(scene);
  const mascot = createMascot();
  scene.add(mascot.group);

  // On desktop the UI panel covers the right side, so shift the view to keep Sensei visible.
  function resize() {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    const mobile = window.matchMedia(MOBILE_QUERY).matches;
    camera.position.set(0, mobile ? 2.0 : 2.3, mobile ? 6.2 : 7.2);
    const panel = mobile ? 0 : Math.min(520, window.innerWidth * 0.45) + 16;
    if (panel) camera.setViewOffset(width, height, panel / 2, 0, width, height);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(canvas);
  resize();

  // THREE.Clock is deprecated in r186; Timer resets itself when the tab becomes visible again.
  const timer = new THREE.Timer();
  timer.connect(document);
  function tick(time) {
    timer.update(time);
    const dt = Math.min(timer.getDelta(), 0.05);
    const t = timer.getElapsed();
    camera.position.x = Math.sin(t * 0.15) * 0.3;
    camera.lookAt(lookTarget);
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
  };
}
