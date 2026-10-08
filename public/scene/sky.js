// Backdrop: sunset sky dome, layered mountain silhouettes, sea of clouds and distant floating islands.
import * as THREE from 'three';
import { part, toon, getGlowTexture, rng } from './toon.js';

export const SUN_DIR = new THREE.Vector3(-0.32, 0.12, -1).normalize();
export const FOG_COLOR = new THREE.Color(0xf6b9a8);

function createSkyDome() {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTime: { value: 0 },
      uSunDir: { value: SUN_DIR },
      uTop: { value: new THREE.Color(0x231c5c) },
      uMid: { value: new THREE.Color(0x8a5bc4) },
      uLow: { value: new THREE.Color(0xff8f8a) },
      uHorizon: { value: new THREE.Color(0xffd29a) },
      uSun: { value: new THREE.Color(0xfff1c4) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uSunDir, uTop, uMid, uLow, uHorizon, uSun;
      varying vec3 vDir;
      float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = mix(uHorizon, uLow, smoothstep(-0.02, 0.1, h));
        col = mix(col, uMid, smoothstep(0.08, 0.38, h));
        col = mix(col, uTop, smoothstep(0.32, 0.85, h));
        // Below the horizon: warm haze that the cloud sea fades into.
        col = mix(col, uHorizon * 0.95, smoothstep(0.0, -0.25, h));

        float s = max(dot(d, normalize(uSunDir)), 0.0);
        col += uSun * pow(s, 8.0) * 0.55;          // wide warm glow
        col += uSun * pow(s, 90.0) * 1.4;          // halo
        col += uSun * smoothstep(0.9975, 0.999, s) * 6.0; // HDR disc (blooms)

        // Twinkling stars in the upper sky.
        vec3 cell = floor(d * 140.0);
        float star = step(0.9965, hash(cell)) * smoothstep(0.35, 0.8, h);
        star *= 0.55 + 0.45 * sin(uTime * 2.5 + hash(cell + 3.1) * 40.0);
        col += vec3(1.0, 0.95, 0.9) * star * 1.6;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(95, 48, 24), material);
  dome.renderOrder = -10;
  dome.frustumCulled = false;
  return dome;
}

// A jagged ridge line as a flat silhouette; nearer layers are darker (atmospheric perspective).
function createRidge({ z, width, height, color, seed, peaks = 9, y = -2 }) {
  const rand = rng(seed);
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, -6);
  const steps = peaks * 6;
  for (let i = 0; i <= steps; i++) {
    const x = -width / 2 + (i / steps) * width;
    const t = i / steps;
    const ridge = Math.abs(Math.sin(t * Math.PI * peaks * 0.5 + seed)) * 0.7 + Math.sin(t * 37 + seed) * 0.08 + rand() * 0.06;
    shape.lineTo(x, height * ridge);
  }
  shape.lineTo(width / 2, -6);
  const mesh = new THREE.Mesh(
    new THREE.ShapeGeometry(shape),
    new THREE.MeshBasicMaterial({ color, fog: false }),
  );
  mesh.position.set(0, y, z);
  return mesh;
}

// Mount Fuji as a painted backdrop: wide concave flanks, a flat crater rim, and a snow cap whose
// lower edge runs down the gullies in streaks. Flat silhouettes, like the ridges, so it reads as art.
const FUJI = { halfWidth: 58, height: 24, rim: 3.2, curve: 1.75 };

// Height of the flank at horizontal offset x (concave: steep near the top, gentle near the base).
function fujiHeight(x) {
  const u = Math.max(0, Math.abs(x) - FUJI.rim) / (FUJI.halfWidth - FUJI.rim);
  return u >= 1 ? 0 : FUJI.height * Math.pow(1 - u, FUJI.curve);
}

function verticalGradient(geometry, bottomColor, topColor, top) {
  const pos = geometry.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const a = new THREE.Color(bottomColor);
  const b = new THREE.Color(topColor);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    c.copy(a).lerp(b, THREE.MathUtils.clamp(pos.getY(i) / top, 0, 1));
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

function createFuji() {
  const group = new THREE.Group();
  const steps = 160;

  const body = new THREE.Shape();
  body.moveTo(-FUJI.halfWidth - 6, -8);
  for (let i = 0; i <= steps; i++) {
    const x = -FUJI.halfWidth + (i / steps) * FUJI.halfWidth * 2;
    body.lineTo(x, fujiHeight(x));
  }
  body.lineTo(FUJI.halfWidth + 6, -8);
  const bodyGeo = verticalGradient(new THREE.ShapeGeometry(body), 0x4e4392, 0x7e6cc2, FUJI.height);
  group.add(new THREE.Mesh(bodyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false })));

  // Snow cap: follows the flank down to about 62% of the height, with streaks reaching lower.
  const rand = rng(7);
  const snowLine = FUJI.height * 0.62;
  const snowX = FUJI.rim + (FUJI.halfWidth - FUJI.rim) * (1 - Math.pow(snowLine / FUJI.height, 1 / FUJI.curve));
  const cap = new THREE.Shape();
  cap.moveTo(-snowX, fujiHeight(-snowX));
  for (let i = 0; i <= 60; i++) {
    const x = -snowX + (i / 60) * snowX * 2;
    cap.lineTo(x, fujiHeight(x) + 0.05);
  }
  // Jagged lower edge from right to left: alternating long streaks down the gullies and short notches.
  const teeth = 14;
  for (let i = 1; i < teeth; i++) {
    const x = snowX - (i / teeth) * snowX * 2;
    const base = Math.min(fujiHeight(x), snowLine + 1.2);
    const drop = i % 2 ? 1.6 + rand() * 2.4 : 0.2 + rand() * 0.6;
    cap.lineTo(x + (rand() - 0.5) * 0.8, base - drop);
  }
  cap.lineTo(-snowX, fujiHeight(-snowX));
  const capGeo = verticalGradient(new THREE.ShapeGeometry(cap), 0xf3d6ea, 0xfff7fb, FUJI.height);
  const snow = new THREE.Mesh(capGeo, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }));
  snow.position.z = 0.05;
  group.add(snow);

  // Rising above the torii (the classic view), slightly right so the setting sun glows on its left.
  group.position.set(4, -5, -88);
  return group;
}

const CLOUD_PUFFS = [
  [0, 0, 0, 1.2], [-1, -0.25, 0.1, 0.85], [1, -0.2, -0.1, 0.92], [-0.45, 0.5, 0.1, 0.78],
  [0.55, 0.42, -0.05, 0.82], [1.6, -0.35, 0, 0.62], [-1.65, -0.35, 0, 0.58],
];

function createCloud(scale, color = 0xffe9ef) {
  const group = new THREE.Group();
  const material = toon(color, { rim: 1.6 });
  for (const [x, y, z, r] of CLOUD_PUFFS) {
    const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 2), material);
    puff.position.set(x, y, z);
    group.add(puff);
  }
  group.scale.set(scale * 1.3, scale, scale);
  return group;
}

// Cheap instanced cloud sea that the island floats over.
function createCloudSea() {
  const rand = rng(77);
  const COUNT = 220;
  const mesh = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1, 2),
    toon(0xffd9e0, { rim: 1.8 }),
    COUNT,
  );
  const dummy = new THREE.Object3D();
  const items = [];
  for (let i = 0; i < COUNT; i++) {
    const angle = rand() * Math.PI * 2;
    const radius = 11 + Math.pow(rand(), 0.7) * 48;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius - 6;
    const s = 1.6 + rand() * 3.4;
    items.push({ x, z, y: -5.2 - rand() * 2.2, s, phase: rand() * 6.28 });
  }
  function update(t) {
    for (let i = 0; i < COUNT; i++) {
      const it = items[i];
      dummy.position.set(it.x + Math.sin(t * 0.05 + it.phase) * 0.6, it.y + Math.sin(t * 0.3 + it.phase) * 0.15, it.z);
      dummy.scale.set(it.s * 1.4, it.s * 0.55, it.s);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }
  update(0);
  return { mesh, update };
}

// Small floating rock with a grassy cap, sometimes a tree or a tiny shrine on top.
function createMiniIsland(seed, { tree = false, shrine = false } = {}) {
  const rand = rng(seed);
  const group = new THREE.Group();
  const rock = new THREE.ConeGeometry(1.3, 2.4, 7, 2);
  rock.rotateX(Math.PI);
  const pos = rock.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) < 1.1) {
      pos.setX(i, pos.getX(i) * (0.85 + rand() * 0.3));
      pos.setZ(i, pos.getZ(i) * (0.85 + rand() * 0.3));
    }
  }
  rock.computeVertexNormals();
  const base = part(rock, 0x6e4f7a, { outline: 0.04 });
  base.position.y = -1.2;
  const cap = part(new THREE.CylinderGeometry(1.35, 1.25, 0.28, 10), 0x7cc55a, { outline: 0.04 });
  group.add(base, cap);
  if (tree) {
    const trunk = part(new THREE.CylinderGeometry(0.07, 0.11, 0.9, 6), 0x5a3b30, { outline: 0.05 });
    trunk.position.y = 0.55;
    const crown = part(new THREE.IcosahedronGeometry(0.6, 1), 0xffb3c8, { outline: 0.04 });
    crown.position.y = 1.2;
    group.add(trunk, crown);
  }
  if (shrine) {
    const red = 0xe02a45;
    for (const x of [-0.35, 0.35]) {
      const post = part(new THREE.CylinderGeometry(0.05, 0.05, 0.75, 6), red, { outline: 0.06 });
      post.position.set(x, 0.5, 0);
      group.add(post);
    }
    const beam = part(new THREE.BoxGeometry(1.05, 0.09, 0.12), 0x2a1a2e, { outline: 0.05 });
    beam.position.y = 0.9;
    group.add(beam);
  }
  return group;
}

export function createSky(scene) {
  scene.fog = new THREE.Fog(FOG_COLOR, 18, 62);
  scene.background = FOG_COLOR;

  const dome = createSkyDome();
  scene.add(dome);

  // Layered ridges: far = pale and violet, near = deeper; read like painted game backdrops.
  scene.add(createRidge({ z: -80, width: 260, height: 7, color: 0xc797c9, seed: 3, peaks: 7, y: -3 }));
  scene.add(createFuji());
  scene.add(createRidge({ z: -60, width: 200, height: 9, color: 0xa877b3, seed: 11, peaks: 9, y: -4 }));
  scene.add(createRidge({ z: -46, width: 160, height: 6, color: 0x84609e, seed: 23, peaks: 12, y: -5 }));

  // Sun halo sprite sitting on the horizon behind the shrine.
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: getGlowTexture(), color: 0xffb27a, transparent: true, opacity: 0.55,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  halo.position.copy(SUN_DIR).multiplyScalar(85);
  halo.scale.setScalar(55);
  scene.add(halo);

  const sea = createCloudSea();
  scene.add(sea.mesh);

  const clouds = [];
  for (const cfg of [
    { x: -16, y: 9, z: -34, s: 2.6, v: 0.25, c: 0xffe1ea },
    { x: 34, y: 15, z: -42, s: 3.2, v: 0.18, c: 0xffd6e2 },
    { x: 20, y: 8, z: -30, s: 2.2, v: 0.3, c: 0xffe9ef },
    { x: -28, y: 6, z: -24, s: 2.0, v: 0.35, c: 0xffc9d7 },
    { x: 30, y: 13, z: -50, s: 3.6, v: 0.15, c: 0xf8d0ec },
  ]) {
    const cloud = createCloud(cfg.s, cfg.c);
    cloud.position.set(cfg.x, cfg.y, cfg.z);
    scene.add(cloud);
    clouds.push({ ...cfg, obj: cloud });
  }

  const islands = [];
  for (const cfg of [
    { x: -15, y: 3.5, z: -22, s: 1.4, seed: 5, tree: true },
    { x: 17, y: 5, z: -26, s: 1.8, seed: 9, shrine: true },
    { x: -26, y: 7, z: -40, s: 2.2, seed: 13, tree: true },
    { x: 30, y: 10, z: -48, s: 1.3, seed: 17 },
    { x: 26, y: 1.5, z: -14, s: 1.1, seed: 21, tree: true },
  ]) {
    const island = createMiniIsland(cfg.seed, cfg);
    island.scale.setScalar(cfg.s);
    island.position.set(cfg.x, cfg.y, cfg.z);
    scene.add(island);
    islands.push({ ...cfg, obj: island, phase: cfg.seed });
  }

  function update(t, dt) {
    dome.material.uniforms.uTime.value = t;
    sea.update(t);
    for (const c of clouds) {
      c.obj.position.x -= c.v * dt;
      if (c.obj.position.x < -45) c.obj.position.x = 45;
    }
    for (const i of islands) {
      i.obj.position.y = i.y + Math.sin(t * 0.5 + i.phase) * 0.35;
      i.obj.rotation.y = Math.sin(t * 0.15 + i.phase) * 0.2;
    }
  }

  return { update };
}
