import * as THREE from 'three';
import { part, toon } from './toon.js';

const PETALS = 280;
const BURST = 90;
const AREA = { x: 10, yTop: 8, zMin: -9, zMax: 4.5 };

function skyTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, 512);
  gradient.addColorStop(0, '#90c6f8'); // Soft anime sky blue
  gradient.addColorStop(0.42, '#ffd5df'); // Sakura blush
  gradient.addColorStop(0.78, '#ffe7cf'); // Warm sunrise peach
  gradient.addColorStop(1, '#ffcfa8'); // Golden morning horizon
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 2, 512);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// 3D Fluffy Anime Cloud
function createCloud(scale = 1) {
  const group = new THREE.Group();
  const CLOUD_COLOR = 0xffffff;
  const puffs = [
    [0, 0, 0, 1.2],
    [-0.9, -0.2, 0.1, 0.85],
    [0.9, -0.15, -0.1, 0.9],
    [-0.4, 0.45, 0.1, 0.75],
    [0.5, 0.4, -0.05, 0.8],
    [1.4, -0.3, 0, 0.65],
    [-1.4, -0.3, 0, 0.6],
  ];

  for (const [x, y, z, r] of puffs) {
    const puff = part(new THREE.SphereGeometry(r, 16, 12), CLOUD_COLOR, { outline: 0 });
    puff.position.set(x, y, z);
    group.add(puff);
  }

  group.scale.setScalar(scale);
  return group;
}

// Iconic Mount Fuji with snow cap
function createMountFuji() {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.ConeGeometry(16, 10, 48, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x7e94be, fog: false }),
  );
  body.position.y = 5.0;

  const snowCap = new THREE.Mesh(
    new THREE.ConeGeometry(5.4, 3.4, 48),
    new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }),
  );
  snowCap.position.y = 8.3;

  group.add(body, snowCap);
  group.position.set(-6.5, -0.8, -45);
  return group;
}

// Vermillion Japanese Torii Gate with Shimenawa sacred rope
function createTorii() {
  const gate = new THREE.Group();
  const RED = 0xd7263d;
  const DARK = 0x241816;
  const GOLD = 0xffc83b;

  // Twin pillars
  for (const x of [-1.6, 1.6]) {
    const pillar = part(new THREE.CylinderGeometry(0.18, 0.22, 3.5, 20), RED, { outline: 0.05 });
    pillar.position.set(x, 1.75, 0);
    gate.add(pillar);

    // Stone foot (Kamebara)
    const foot = part(new THREE.CylinderGeometry(0.28, 0.28, 0.28, 20), DARK, { outline: 0 });
    foot.position.set(x, 0.14, 0);
    gate.add(foot);

    // Gold collar ring
    const collar = part(new THREE.CylinderGeometry(0.23, 0.23, 0.06, 16), GOLD, { outline: 0 });
    collar.position.set(x, 3.25, 0);
    gate.add(collar);
  }

  // Kasagi (top beam with gentle curve)
  const kasagi = part(new THREE.BoxGeometry(4.7, 0.26, 0.44), DARK, { outline: 0.02 });
  kasagi.position.y = 3.65;
  gate.add(kasagi);

  // Shimaki (second top beam)
  const shimaki = part(new THREE.BoxGeometry(4.25, 0.22, 0.38), RED, { outline: 0.03 });
  shimaki.position.y = 3.42;
  gate.add(shimaki);

  // Nuki (tie beam)
  const nuki = part(new THREE.BoxGeometry(3.85, 0.2, 0.25), RED, { outline: 0.03 });
  nuki.position.y = 2.75;
  gate.add(nuki);

  // Gakuzuka plaque
  const gakuzuka = part(new THREE.BoxGeometry(0.24, 0.65, 0.22), RED, { outline: 0.04 });
  gakuzuka.position.y = 3.08;
  gate.add(gakuzuka);

  // Shimenawa (sacred twisted rope with paper tassels)
  const shimenawa = part(new THREE.CylinderGeometry(0.06, 0.09, 3.2, 12), 0xd6ba85, { outline: 0 });
  shimenawa.rotation.z = Math.PI / 2;
  shimenawa.position.set(0, 2.52, 0.12);
  gate.add(shimenawa);

  // Shide paper zigzags hanging from rope
  const shideTassels = [];
  for (const x of [-0.8, 0, 0.8]) {
    const shide = part(new THREE.BoxGeometry(0.12, 0.38, 0.02), 0xffffff, { outline: 0.02 });
    shide.position.set(x, 2.26, 0.14);
    gate.add(shide);
    shideTassels.push(shide);
  }

  return { gate, shideTassels };
}

// Japanese Stone Lantern (Tōrō 石灯籠) with glowing paper windows
function createLantern() {
  const STONE = 0xada89e;
  const group = new THREE.Group();

  const base = part(new THREE.CylinderGeometry(0.34, 0.4, 0.22, 8), STONE);
  base.position.y = 0.11;

  const pole = part(new THREE.CylinderGeometry(0.11, 0.13, 0.85, 8), STONE);
  pole.position.y = 0.64;

  const deck = part(new THREE.BoxGeometry(0.64, 0.14, 0.64), STONE);
  deck.position.y = 1.12;

  // Glowing shoji light window
  const lightBox = part(new THREE.BoxGeometry(0.44, 0.42, 0.44), 0xffe099, {
    emissive: 0xffaa33,
    emissiveIntensity: 0.95,
  });
  lightBox.position.y = 1.4;

  const roof = part(new THREE.ConeGeometry(0.6, 0.4, 4), STONE);
  roof.rotation.y = Math.PI / 4;
  roof.position.y = 1.82;

  const finial = part(new THREE.SphereGeometry(0.09, 12, 8), STONE);
  finial.position.y = 2.08;

  group.add(base, pole, deck, lightBox, roof, finial);

  // Warm glowing point light
  const glow = new THREE.PointLight(0xffae52, 1.4, 3.8, 2);
  glow.position.y = 1.4;
  group.add(glow);

  return { group, glow };
}

// Sculpted Cherry Blossom (Sakura 桜) Tree with animated canopy puffs
function createSakuraTree(scale = 1) {
  const tree = new THREE.Group();
  const BARK = 0x614132;

  const trunk = part(new THREE.CylinderGeometry(0.18, 0.3, 2.4, 10), BARK);
  trunk.position.y = 1.2;
  trunk.rotation.z = 0.08;
  tree.add(trunk);

  // Main twisting branches
  const branches = [
    [-0.5, 2.2, 0.05, 0.75],
    [0.55, 2.3, 0.12, -0.68],
    [0.05, 2.5, -0.45, 0.15],
  ];
  for (const [x, y, z, rz] of branches) {
    const branch = part(new THREE.CylinderGeometry(0.07, 0.12, 1.1, 8), BARK);
    branch.position.set(x, y, z);
    branch.rotation.z = rz;
    tree.add(branch);
  }

  // Lush anime cherry blossom canopy puffs
  const canopyGroup = new THREE.Group();
  const blossomClusters = [
    [0, 3.1, 0, 1.05, 0xffc4d0],
    [-0.95, 2.8, 0.15, 0.8, 0xffb5c3],
    [0.98, 2.85, 0.22, 0.82, 0xffd2dd],
    [-0.45, 3.65, -0.22, 0.75, 0xffd4de],
    [0.55, 3.55, -0.32, 0.78, 0xffb8c6],
    [0.15, 2.7, 0.68, 0.7, 0xffc8d3],
    [-0.75, 2.45, -0.55, 0.6, 0xffd2dc],
    [0.72, 2.4, -0.45, 0.58, 0xffb8c6],
  ];

  const puffMeshes = [];
  for (const [x, y, z, r, color] of blossomClusters) {
    const puff = part(new THREE.IcosahedronGeometry(r, 1), color, { outline: 0.035 });
    puff.position.set(x, y, z);
    canopyGroup.add(puff);
    puffMeshes.push(puff);
  }

  tree.add(canopyGroup);
  tree.scale.setScalar(scale);

  return { tree, canopyGroup, puffMeshes };
}

// Wildflowers & Grass
function createFlower(color) {
  const group = new THREE.Group();
  const stem = part(new THREE.CylinderGeometry(0.015, 0.015, 0.24, 6), 0x4f9a45, { outline: 0 });
  stem.position.y = 0.12;
  group.add(stem);

  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const petal = part(new THREE.SphereGeometry(0.06, 10, 8), color, { outline: 0 });
    petal.scale.set(1, 0.45, 1);
    petal.position.set(Math.cos(a) * 0.065, 0.24, Math.sin(a) * 0.065);
    group.add(petal);
  }

  const centre = part(new THREE.SphereGeometry(0.038, 10, 8), 0xffd23f, { outline: 0 });
  centre.position.y = 0.26;
  group.add(centre);
  return group;
}

function createGrassTuft() {
  const group = new THREE.Group();
  for (const [x, rz, h] of [
    [-0.06, 0.32, 0.3],
    [0, 0, 0.38],
    [0.06, -0.32, 0.28],
    [-0.03, 0.15, 0.34],
  ]) {
    const blade = part(new THREE.ConeGeometry(0.035, h, 5), 0x5ea848, { outline: 0 });
    blade.position.set(x, h / 2, 0);
    blade.rotation.z = rz;
    group.add(blade);
  }
  return group;
}

// Floating Spirit Fireflies (Kitsunebi 狐火)
function createSpiritFireflies() {
  const group = new THREE.Group();
  const fireflies = [];
  const COUNT = 8;

  for (let i = 0; i < COUNT; i++) {
    const color = i % 2 === 0 ? 0xffea78 : 0x78eaff;
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 12, 8),
      new THREE.MeshBasicMaterial({ color }),
    );
    const light = new THREE.PointLight(color, 0.8, 2.5);
    mesh.add(light);
    group.add(mesh);

    fireflies.push({
      mesh,
      light,
      baseX: (Math.random() - 0.5) * 7,
      baseY: 0.8 + Math.random() * 2.5,
      baseZ: -1.5 - Math.random() * 5,
      speed: 0.8 + Math.random() * 0.8,
      phase: Math.random() * Math.PI * 2,
    });
  }

  return { group, fireflies };
}

export function createGarden(scene) {
  scene.background = skyTexture();
  scene.fog = new THREE.Fog(0xfde2e4, 15, 38);

  // Mount Fuji in the distance
  scene.add(createMountFuji());

  // Fleet of Drifting 3D Anime Clouds
  const clouds = [];
  const cloudConfigs = [
    { x: -8, y: 7.2, z: -28, scale: 2.2, speed: 0.22 },
    { x: 2, y: 8.5, z: -32, scale: 2.6, speed: 0.18 },
    { x: 10, y: 6.8, z: -25, scale: 2.0, speed: 0.25 },
    { x: -14, y: 6.0, z: -20, scale: 1.8, speed: 0.3 },
  ];

  for (const cfg of cloudConfigs) {
    const cloud = createCloud(cfg.scale);
    cloud.position.set(cfg.x, cfg.y, cfg.z);
    scene.add(cloud);
    clouds.push({ ...cfg, obj: cloud });
  }

  // Grassy Shrine Island ground
  const ground = new THREE.Mesh(new THREE.CircleGeometry(16, 64), toon(0x9bd186));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  // Stepping stones path
  const path = new THREE.Group();
  for (let i = 0; i < 7; i++) {
    const stone = part(new THREE.CylinderGeometry(0.36, 0.4, 0.07, 10), 0xdcd6c8, { outline: 0.03 });
    stone.position.set(Math.sin(i * 1.25) * 0.28, 0.035, -0.8 - i * 0.72);
    stone.rotation.y = i * 0.8;
    path.add(stone);
  }
  scene.add(path);

  // Torii gate
  const { gate, shideTassels } = createTorii();
  gate.position.set(0, 0, -5.8);
  scene.add(gate);

  // Twin Stone Lanterns
  const lanterns = [];
  for (const x of [-2.4, 2.4]) {
    const lantern = createLantern();
    lantern.group.position.set(x, 0, -1.9);
    scene.add(lantern.group);
    lanterns.push(lantern);
  }

  // Sakura Trees (Left & Right)
  const trees = [];
  const bigTree = createSakuraTree(1.2);
  bigTree.tree.position.set(-3.8, 0, -3.4);
  scene.add(bigTree.tree);
  trees.push(bigTree);

  const smallTree = createSakuraTree(0.92);
  smallTree.tree.position.set(4.1, 0, -4.5);
  scene.add(smallTree.tree);
  trees.push(smallTree);

  // Bushes
  for (const [x, z, r] of [
    [-1.7, 0.7, 0.38],
    [1.8, 0.5, 0.34],
    [-2.9, -1.1, 0.44],
    [3.1, -2.5, 0.42],
    [1.1, -3.8, 0.32],
  ]) {
    const bush = part(new THREE.IcosahedronGeometry(r, 1), 0x6db558);
    bush.position.set(x, r * 0.7, z);
    scene.add(bush);
  }

  // Wildflowers & Grass
  const FLOWER_COLORS = [0xffffff, 0xffa3cb, 0xffd2dd, 0xd0b4ff];
  const flowers = [];
  for (const [x, z] of [
    [-1.3, 1.6],
    [-1.05, 1.9],
    [-1.55, 2.0],
    [-2.6, 1.2],
    [-2.35, 1.5],
    [1.25, 1.7],
    [1.5, 2.05],
    [1.05, 2.15],
    [2.6, 0.9],
    [2.85, 1.25],
    [-0.75, 2.8],
    [0.9, 2.9],
    [-3.4, 2.4],
    [3.3, 2.2],
  ]) {
    const f = createFlower(FLOWER_COLORS[Math.abs(Math.round(x * 7 + z * 3)) % FLOWER_COLORS.length]);
    f.position.set(x, 0, z);
    f.rotation.y = x * 3 + z;
    scene.add(f);
    flowers.push(f);
  }

  for (const [x, z] of [
    [-0.9, 1.2],
    [0.85, 1.1],
    [-2.0, 2.4],
    [2.1, 2.5],
    [-1.9, 0.2],
    [2.4, -0.3],
    [0.2, 3.2],
    [-3.0, 3.0],
    [3.1, 3.1],
  ]) {
    const tuft = createGrassTuft();
    tuft.position.set(x, 0, z);
    tuft.rotation.y = x + z;
    scene.add(tuft);
  }

  // Floating Spirit Fireflies (Kitsunebi)
  const { group: firefliesGroup, fireflies } = createSpiritFireflies();
  scene.add(firefliesGroup);

  // Falling Sakura Petals
  const petals = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(0.12, 0.08),
    new THREE.MeshBasicMaterial({ color: 0xffb7c5, side: THREE.DoubleSide }),
    PETALS,
  );
  const pos = new Float32Array(PETALS * 3);
  const vel = new Float32Array(PETALS * 3);
  const spin = new Float32Array(PETALS * 3);
  const phase = new Float32Array(PETALS);
  const dummy = new THREE.Object3D();

  function resetPetal(i, anywhere) {
    pos[i * 3] = (Math.random() * 2 - 1) * AREA.x;
    pos[i * 3 + 1] = anywhere ? Math.random() * AREA.yTop : AREA.yTop + Math.random();
    pos[i * 3 + 2] = AREA.zMin + Math.random() * (AREA.zMax - AREA.zMin);
    vel[i * 3] = 0;
    vel[i * 3 + 1] = -(0.32 + Math.random() * 0.42);
    vel[i * 3 + 2] = 0;
  }

  for (let i = 0; i < PETALS; i++) {
    resetPetal(i, true);
    spin[i * 3] = Math.random() * 3.5;
    spin[i * 3 + 1] = Math.random() * 3.5;
    spin[i * 3 + 2] = Math.random() * 3.5;
    phase[i] = Math.random() * Math.PI * 2;
  }
  scene.add(petals);

  // Update loop
  function update(t, dt) {
    // 1. Drifting anime clouds
    for (const c of clouds) {
      c.obj.position.x -= c.speed * dt;
      if (c.obj.position.x < -24) {
        c.obj.position.x = 24;
      }
    }

    // 2. Sakura tree branches gentle sway in the wind
    for (const { canopyGroup } of trees) {
      canopyGroup.rotation.z = Math.sin(t * 1.5) * 0.035;
      canopyGroup.rotation.x = Math.cos(t * 1.2) * 0.025;
    }

    // 3. Torii gate shide paper tassels sway
    for (let i = 0; i < shideTassels.length; i++) {
      shideTassels[i].rotation.z = Math.sin(t * 2.2 + i * 0.6) * 0.08;
    }

    // 4. Lantern flicker
    for (const { glow } of lanterns) {
      glow.intensity = 1.3 + Math.sin(t * 8) * 0.2 + Math.cos(t * 14) * 0.1;
    }

    // 5. Spirit Fireflies float along 3D Lissajous paths
    for (const ff of fireflies) {
      ff.mesh.position.x = ff.baseX + Math.sin(t * ff.speed + ff.phase) * 0.8;
      ff.mesh.position.y = ff.baseY + Math.cos(t * ff.speed * 1.3 + ff.phase) * 0.45;
      ff.mesh.position.z = ff.baseZ + Math.sin(t * ff.speed * 0.7 + ff.phase) * 0.8;
      ff.light.intensity = 0.6 + Math.sin(t * 4 + ff.phase) * 0.3;
    }

    // 6. Falling sakura petals aerodynamics
    const drag = Math.exp(-1.5 * dt);
    for (let i = 0; i < PETALS; i++) {
      const k = i * 3;
      vel[k] *= drag;
      vel[k + 2] *= drag;
      vel[k + 1] = Math.max(vel[k + 1] - 1.2 * dt, -(0.32 + (i % 6) * 0.07));

      pos[k] += (vel[k] + Math.sin(t * 0.9 + phase[i]) * 0.36 + 0.16) * dt;
      pos[k + 1] += vel[k + 1] * dt;
      pos[k + 2] += vel[k + 2] * dt;

      if (pos[k + 1] < 0.02 || Math.abs(pos[k]) > AREA.x + 2) {
        resetPetal(i, false);
      }

      dummy.position.set(pos[k], pos[k + 1], pos[k + 2]);
      dummy.rotation.set(t * spin[k], t * spin[k + 1], t * spin[k + 2]);
      dummy.updateMatrix();
      petals.setMatrixAt(i, dummy.matrix);
    }
    petals.instanceMatrix.needsUpdate = true;
  }

  // Celebratory Sakura & Star Burst
  function burst() {
    for (let n = 0; n < BURST; n++) {
      const i = Math.floor(Math.random() * PETALS);
      const k = i * 3;
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.8 + Math.random() * 2.6;
      pos[k] = 0;
      pos[k + 1] = 2.0;
      pos[k + 2] = 0.4;
      vel[k] = Math.cos(angle) * speed;
      vel[k + 1] = 1.8 + Math.random() * 2.0;
      vel[k + 2] = Math.sin(angle) * speed * 0.7;
    }
  }

  return { update, burst };
}
