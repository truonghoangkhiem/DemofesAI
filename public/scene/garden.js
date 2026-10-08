import * as THREE from 'three';
import { part, toon } from './toon.js';

const PETALS = 220;
const BURST = 70;
const AREA = { x: 9, yTop: 7, zMin: -8, zMax: 4 };

function skyTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, 256);
  gradient.addColorStop(0, '#9ed4f0');
  gradient.addColorStop(0.55, '#fde2e4');
  gradient.addColorStop(1, '#ffd6a8');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 2, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function torii() {
  const gate = new THREE.Group();
  const RED = 0xd7263d;
  for (const x of [-1.5, 1.5]) {
    const pillar = part(new THREE.CylinderGeometry(0.17, 0.21, 3.3, 20), RED, { outline: 0.06 });
    pillar.position.set(x, 1.65, 0);
    gate.add(pillar);
    const foot = part(new THREE.CylinderGeometry(0.26, 0.26, 0.25, 20), 0x2b1d1a, { outline: 0 });
    foot.position.set(x, 0.12, 0);
    gate.add(foot);
  }
  const kasagi = part(new THREE.BoxGeometry(4.4, 0.24, 0.42), 0x2b1d1a, { outline: 0 });
  kasagi.position.y = 3.5;
  gate.add(kasagi);
  const shimaki = part(new THREE.BoxGeometry(4.0, 0.2, 0.36), RED, { outline: 0.03 });
  shimaki.position.y = 3.3;
  gate.add(shimaki);
  const nuki = part(new THREE.BoxGeometry(3.6, 0.18, 0.24), RED, { outline: 0.03 });
  nuki.position.y = 2.65;
  gate.add(nuki);
  const gakuzuka = part(new THREE.BoxGeometry(0.22, 0.6, 0.2), RED, { outline: 0.05 });
  gakuzuka.position.y = 2.98;
  gate.add(gakuzuka);
  return gate;
}

function lantern() {
  const STONE = 0xa9a39a;
  const group = new THREE.Group();
  const base = part(new THREE.CylinderGeometry(0.32, 0.38, 0.2, 8), STONE);
  base.position.y = 0.1;
  const pole = part(new THREE.CylinderGeometry(0.1, 0.12, 0.8, 8), STONE);
  pole.position.y = 0.6;
  const deck = part(new THREE.BoxGeometry(0.6, 0.12, 0.6), STONE);
  deck.position.y = 1.05;
  const light = part(new THREE.BoxGeometry(0.42, 0.38, 0.42), 0xffd27a, { emissive: 0xffb347, emissiveIntensity: 0.9 });
  light.position.y = 1.3;
  const roof = part(new THREE.ConeGeometry(0.56, 0.38, 4), STONE);
  roof.rotation.y = Math.PI / 4;
  roof.position.y = 1.68;
  const knob = part(new THREE.SphereGeometry(0.08, 12, 8), STONE);
  knob.position.y = 1.92;
  group.add(base, pole, deck, light, roof, knob);
  const glow = new THREE.PointLight(0xffb36b, 1.2, 3, 2);
  glow.position.y = 1.3;
  group.add(glow);
  return group;
}

function sakuraTree(scale = 1) {
  const tree = new THREE.Group();
  const BARK = 0x6b4a3a;
  const trunk = part(new THREE.CylinderGeometry(0.16, 0.26, 2.2, 10), BARK);
  trunk.position.y = 1.1;
  trunk.rotation.z = 0.08;
  tree.add(trunk);
  for (const [x, y, z, rz] of [[-0.45, 2.0, 0, 0.8], [0.5, 2.1, 0.1, -0.7], [0, 2.3, -0.4, 0.1]]) {
    const branch = part(new THREE.CylinderGeometry(0.06, 0.1, 1.0, 8), BARK);
    branch.position.set(x, y, z);
    branch.rotation.z = rz;
    tree.add(branch);
  }
  const blossoms = [
    [0, 2.9, 0, 0.95, 0xffc4d0], [-0.9, 2.6, 0.1, 0.7, 0xffb7c5], [0.9, 2.65, 0.2, 0.72, 0xffd1dc],
    [-0.4, 3.4, -0.2, 0.65, 0xffd1dc], [0.5, 3.3, -0.3, 0.68, 0xffb7c5], [0.1, 2.5, 0.6, 0.6, 0xffc4d0],
    [-0.7, 2.3, -0.5, 0.5, 0xffd1dc],
  ];
  for (const [x, y, z, r, color] of blossoms) {
    const puff = part(new THREE.IcosahedronGeometry(r, 1), color, { outline: 0.04 });
    puff.position.set(x, y, z);
    tree.add(puff);
  }
  tree.scale.setScalar(scale);
  return tree;
}

// Small five-petal flower with a short stem, for the foreground lawn.
function flower(color) {
  const group = new THREE.Group();
  const stem = part(new THREE.CylinderGeometry(0.015, 0.015, 0.22, 6), 0x4f9a45, { outline: 0 });
  stem.position.y = 0.11;
  group.add(stem);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const petal = part(new THREE.SphereGeometry(0.055, 10, 8), color, { outline: 0 });
    petal.scale.set(1, 0.5, 1);
    petal.position.set(Math.cos(a) * 0.06, 0.23, Math.sin(a) * 0.06);
    group.add(petal);
  }
  const centre = part(new THREE.SphereGeometry(0.035, 10, 8), 0xffd23f, { outline: 0 });
  centre.position.y = 0.25;
  group.add(centre);
  return group;
}

function grassTuft() {
  const group = new THREE.Group();
  for (const [x, rz, h] of [[-0.05, 0.3, 0.28], [0, 0, 0.36], [0.05, -0.3, 0.26]]) {
    const blade = part(new THREE.ConeGeometry(0.035, h, 5), 0x5fae4e, { outline: 0 });
    blade.position.set(x, h / 2, 0);
    blade.rotation.z = rz;
    group.add(blade);
  }
  return group;
}

function mountain() {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.ConeGeometry(14, 9, 48, 1, true), new THREE.MeshBasicMaterial({ color: 0x8fa8d8, fog: false }));
  body.position.y = 4.5;
  const cap = new THREE.Mesh(new THREE.ConeGeometry(4.7, 3.05, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }));
  cap.position.y = 7.5;
  group.add(body, cap);
  group.position.set(-6, -1, -42);
  return group;
}

export function createGarden(scene) {
  scene.background = skyTexture();
  scene.fog = new THREE.Fog(0xfde2e4, 14, 34);

  const ground = new THREE.Mesh(new THREE.CircleGeometry(16, 64), toon(0x9fd48b));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  const path = new THREE.Group();
  for (let i = 0; i < 6; i++) {
    const stone = part(new THREE.CylinderGeometry(0.34, 0.38, 0.06, 10), 0xd8d2c4, { outline: 0.03 });
    stone.position.set(Math.sin(i * 1.3) * 0.25, 0.03, -0.9 - i * 0.75);
    stone.rotation.y = i;
    path.add(stone);
  }
  scene.add(path);

  const gate = torii();
  gate.position.set(0, 0, -5.6);
  scene.add(gate);

  for (const x of [-2.2, 2.2]) {
    const l = lantern();
    l.position.set(x, 0, -1.8);
    scene.add(l);
  }

  const bigTree = sakuraTree(1.15);
  bigTree.position.set(-3.6, 0, -3.2);
  scene.add(bigTree);
  const smallTree = sakuraTree(0.85);
  smallTree.position.set(3.9, 0, -4.4);
  scene.add(smallTree);

  for (const [x, z, r] of [[-1.6, 0.6, 0.35], [1.7, 0.4, 0.3], [-2.8, -1.0, 0.42], [2.9, -2.4, 0.4], [1.0, -3.6, 0.3]]) {
    const bush = part(new THREE.IcosahedronGeometry(r, 1), 0x6fb35a);
    bush.position.set(x, r * 0.7, z);
    scene.add(bush);
  }

  scene.add(mountain());

  const FLOWER_COLORS = [0xffffff, 0xff9ec7, 0xffd1dc, 0xc9a7ff];
  for (const [x, z] of [[-1.3, 1.6], [-1.05, 1.9], [-1.55, 2.0], [-2.6, 1.2], [-2.35, 1.5], [1.25, 1.7], [1.5, 2.05], [1.05, 2.15],
    [2.6, 0.9], [2.85, 1.25], [-0.75, 2.8], [0.9, 2.9], [-3.4, 2.4], [3.3, 2.2]]) {
    const f = flower(FLOWER_COLORS[Math.abs(Math.round(x * 7 + z * 3)) % FLOWER_COLORS.length]);
    f.position.set(x, 0, z);
    f.rotation.y = x * 3 + z;
    scene.add(f);
  }
  for (const [x, z] of [[-0.9, 1.2], [0.85, 1.1], [-2.0, 2.4], [2.1, 2.5], [-1.9, 0.2], [2.4, -0.3], [0.2, 3.2], [-3.0, 3.0], [3.1, 3.1]]) {
    const tuft = grassTuft();
    tuft.position.set(x, 0, z);
    tuft.rotation.y = x + z;
    scene.add(tuft);
  }

  // Falling sakura petals.
  const petals = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(0.11, 0.075),
    new THREE.MeshBasicMaterial({ color: 0xffb7c5, side: THREE.DoubleSide }),
    PETALS,
  );
  const pos = new Float32Array(PETALS * 3);
  const vel = new Float32Array(PETALS * 3);
  const spin = new Float32Array(PETALS * 3);
  const phase = new Float32Array(PETALS);
  const dummy = new THREE.Object3D();

  function reset(i, anywhere) {
    pos[i * 3] = (Math.random() * 2 - 1) * AREA.x;
    pos[i * 3 + 1] = anywhere ? Math.random() * AREA.yTop : AREA.yTop + Math.random();
    pos[i * 3 + 2] = AREA.zMin + Math.random() * (AREA.zMax - AREA.zMin);
    vel[i * 3] = 0;
    vel[i * 3 + 1] = -(0.35 + Math.random() * 0.4);
    vel[i * 3 + 2] = 0;
  }
  for (let i = 0; i < PETALS; i++) {
    reset(i, true);
    spin[i * 3] = Math.random() * 3;
    spin[i * 3 + 1] = Math.random() * 3;
    spin[i * 3 + 2] = Math.random() * 3;
    phase[i] = Math.random() * Math.PI * 2;
  }
  scene.add(petals);

  function update(t, dt) {
    const drag = Math.exp(-1.5 * dt);
    for (let i = 0; i < PETALS; i++) {
      const k = i * 3;
      vel[k] *= drag;
      vel[k + 2] *= drag;
      vel[k + 1] = Math.max(vel[k + 1] - 1.2 * dt, -(0.35 + (i % 5) * 0.08));
      pos[k] += (vel[k] + Math.sin(t * 0.8 + phase[i]) * 0.35 + 0.15) * dt;
      pos[k + 1] += vel[k + 1] * dt;
      pos[k + 2] += vel[k + 2] * dt;
      if (pos[k + 1] < 0.02 || Math.abs(pos[k]) > AREA.x + 2) reset(i, false);
      dummy.position.set(pos[k], pos[k + 1], pos[k + 2]);
      dummy.rotation.set(t * spin[k], t * spin[k + 1], t * spin[k + 2]);
      dummy.updateMatrix();
      petals.setMatrixAt(i, dummy.matrix);
    }
    petals.instanceMatrix.needsUpdate = true;
  }

  // Throws a handful of petals up around the mascot.
  function burst() {
    for (let n = 0; n < BURST; n++) {
      const i = Math.floor(Math.random() * PETALS);
      const k = i * 3;
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.5 + Math.random() * 2;
      pos[k] = 0;
      pos[k + 1] = 2.2;
      pos[k + 2] = 0.3;
      vel[k] = Math.cos(angle) * speed;
      vel[k + 1] = 1.5 + Math.random() * 1.5;
      vel[k + 2] = Math.sin(angle) * speed * 0.6;
    }
  }

  return { update, burst };
}
