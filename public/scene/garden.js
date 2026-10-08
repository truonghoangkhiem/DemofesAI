// The floating shrine island: ground, cliffs, grass, shrine props, koi pond, magic circle and particles.
import * as THREE from 'three';
import { part, toon, canvasTexture, rng } from './toon.js';

const R = 8.6; // island radius
const CZ = -1.6; // island centre z
const TORII_Z = -6.2;
const POND = { x: -3.1, z: 1.3, r: 1.25 };
const PETALS = 260;
const SPARKS = 220;

const MOOD_FX = {
  idle: { color: 0xff86c0, power: 1.0, spin: 0.12, motes: 0.15, orbs: 1 },
  thinking: { color: 0x5fe6ff, power: 2.0, spin: 1.5, motes: 1, orbs: 2.6 },
  confused: { color: 0xc193ff, power: 1.6, spin: -0.45, motes: 0.4, orbs: 1.4 },
  happy: { color: 0xffcc4d, power: 2.2, spin: 0.9, motes: 0.8, orbs: 1.8 },
  neutral: { color: 0x7dffc6, power: 1.5, spin: 0.35, motes: 0.3, orbs: 1.1 },
  sad: { color: 0x7189ff, power: 0.6, spin: 0.06, motes: 0.05, orbs: 0.5 },
};

// World (x, z) on the island → pixel on the ground texture.
const toPx = (x, z, size) => [(0.5 + x / (2 * R)) * size, (0.5 + (z - CZ) / (2 * R)) * size];

function groundTexture() {
  const SIZE = 1024;
  const rand = rng(4);
  return canvasTexture(SIZE, SIZE, ctx => {
    const px = u => (u / (2 * R)) * SIZE;
    const g = ctx.createRadialGradient(SIZE / 2, SIZE / 2, 0, SIZE / 2, SIZE / 2, SIZE / 2);
    g.addColorStop(0, '#8fd166');
    g.addColorStop(0.75, '#74bd52');
    g.addColorStop(1, '#5a9d44');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, SIZE, SIZE);

    // Mottled grass patches.
    for (let i = 0; i < 260; i++) {
      ctx.fillStyle = rand() < 0.5 ? 'rgba(170, 225, 110, 0.18)' : 'rgba(60, 120, 50, 0.16)';
      ctx.beginPath();
      ctx.ellipse(rand() * SIZE, rand() * SIZE, 10 + rand() * 50, 8 + rand() * 30, rand() * 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Sandy shrine path from the dais to the torii, and the plaza around the dais.
    const sand = '#ead9b0';
    ctx.fillStyle = sand;
    ctx.strokeStyle = 'rgba(150, 120, 80, 0.35)';
    ctx.lineWidth = 6;
    const [cx, cy] = toPx(0, 0, SIZE);
    const [tx, ty] = toPx(0, TORII_Z - 0.6, SIZE);
    ctx.beginPath();
    ctx.moveTo(cx - px(0.75), cy);
    ctx.bezierCurveTo(cx - px(0.6), cy - px(2.5), tx - px(0.9), ty + px(1.6), tx - px(1.1), ty);
    ctx.lineTo(tx + px(1.1), ty);
    ctx.bezierCurveTo(tx + px(0.9), ty + px(1.6), cx + px(0.6), cy - px(2.5), cx + px(0.75), cy);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, px(1.95), 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Raked-gravel rings around the dais (karesansui).
    ctx.strokeStyle = 'rgba(160, 130, 90, 0.28)';
    ctx.lineWidth = 3;
    for (let r = 1.45; r < 1.95; r += 0.16) {
      ctx.beginPath();
      ctx.arc(cx, cy, px(r), 0, Math.PI * 2);
      ctx.stroke();
    }
    // Pond shore.
    const [pxx, pzz] = toPx(POND.x, POND.z, SIZE);
    ctx.fillStyle = '#c9b48a';
    ctx.beginPath();
    ctx.arc(pxx, pzz, px(POND.r + 0.3), 0, Math.PI * 2);
    ctx.fill();
  });
}

function createIsland() {
  const group = new THREE.Group();

  const top = new THREE.Mesh(new THREE.CircleGeometry(R, 72), toon(0xffffff, { map: groundTexture(), rim: 0 }));
  top.rotation.x = -Math.PI / 2;
  top.position.z = CZ;
  top.receiveShadow = true;
  group.add(top);

  // Dirt band, then a faceted rocky underside shaded from warm earth to deep violet.
  const band = part(new THREE.CylinderGeometry(R, R * 0.96, 0.8, 72, 1, true), 0x9a6446, { outline: 0, shadow: false });
  band.position.set(0, -0.4, CZ);
  group.add(band);

  const rand = rng(12);
  const rock = new THREE.ConeGeometry(R * 0.96, 8.5, 28, 6, true);
  rock.rotateX(Math.PI);
  const pos = rock.attributes.position;
  const colors = [];
  const top3 = new THREE.Color(0x8c5a52);
  const bottom = new THREE.Color(0x3d2a5c);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const k = (y + 4.25) / 8.5; // 1 at top, 0 at tip
    if (k < 0.98) {
      const n = 0.82 + rand() * 0.34;
      pos.setX(i, pos.getX(i) * n);
      pos.setZ(i, pos.getZ(i) * n);
      pos.setY(i, y + (rand() - 0.5) * 0.6);
    }
    const c = bottom.clone().lerp(top3, Math.pow(k, 0.7));
    colors.push(c.r, c.g, c.b);
  }
  rock.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  rock.computeVertexNormals();
  const underside = new THREE.Mesh(rock, toon(0xffffff, { vertexColors: true, side: THREE.DoubleSide }));
  underside.position.set(0, -0.8 - 4.25, CZ);
  group.add(underside);

  // Dangling boulders under the island.
  for (const [x, y, z, s] of [[-4, -6.5, -2, 0.9], [3.5, -7.4, 0, 0.7], [1, -9.2, -3, 0.6], [-1.6, -8.3, 2.5, 0.5]]) {
    const b = part(new THREE.DodecahedronGeometry(s, 0), 0x5a3c66, { outline: 0.05 });
    b.position.set(x, y, z + CZ);
    group.add(b);
  }
  return group;
}

// Thousands of wind-swept grass blades in one draw call.
function createGrass() {
  const rand = rng(31);
  const COUNT = 7000;
  const blade = new THREE.PlaneGeometry(0.07, 1, 1, 4);
  blade.translate(0, 0.5, 0);
  const bp = blade.attributes.position;
  for (let i = 0; i < bp.count; i++) {
    const y = bp.getY(i);
    bp.setX(i, bp.getX(i) * (1 - y * 0.92));
  }

  const material = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uTime: { value: 0 },
      uBase: { value: new THREE.Color(0x3f8a3a) },
      uTip: { value: new THREE.Color(0xc8f07a) },
      uWarm: { value: new THREE.Color(0xffc48a) },
    }]),
    vertexShader: /* glsl */ `
      uniform float uTime;
      varying float vH;
      varying vec3 vTint;
      #include <fog_pars_vertex>
      void main() {
        vec4 root = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
        float h = position.y;
        float gust = sin(uTime * 0.9 + root.x * 0.35 - root.z * 0.25);
        float w = sin(uTime * 2.1 + root.x * 0.8 + root.z * 0.5) * 0.35 + gust * 0.55 + 0.25;
        world.x += w * h * h * 0.22;
        world.z += w * h * h * 0.09;
        vH = h;
        vTint = instanceColor;
        vec4 mvPosition = viewMatrix * world;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uBase, uTip, uWarm;
      varying float vH;
      varying vec3 vTint;
      #include <common>
      #include <fog_pars_fragment>
      void main() {
        vec3 col = mix(uBase, uTip, smoothstep(0.0, 1.0, vH)) * vTint;
        col += uWarm * smoothstep(0.65, 1.0, vH) * 0.18;
        gl_FragColor = vec4(col, 1.0);
        #include <fog_fragment>
      }`,
  });

  const mesh = new THREE.InstancedMesh(blade, material, COUNT);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  let n = 0;
  while (n < COUNT) {
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(rand()) * (R - 0.25);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r + CZ;
    // Keep the plaza, the path and the pond clear.
    if (Math.hypot(x, z) < 2.1) continue;
    if (z < 0 && z > TORII_Z - 1 && Math.abs(x) < 1.25 + (z < -3 ? 0.4 : 0)) continue;
    if (Math.hypot(x - POND.x, z - POND.z) < POND.r + 0.4) continue;
    dummy.position.set(x, 0, z);
    dummy.rotation.set((rand() - 0.5) * 0.3, rand() * Math.PI, 0);
    const h = 0.18 + rand() * 0.3 + (r > R - 2 ? 0.12 : 0);
    dummy.scale.set(1 + rand() * 0.6, h, 1);
    dummy.updateMatrix();
    mesh.setMatrixAt(n, dummy.matrix);
    mesh.setColorAt(n, color.setHSL(0.27 + rand() * 0.06, 0.55, 0.42 + rand() * 0.16).multiplyScalar(2.1));
    n++;
  }
  mesh.frustumCulled = false;
  return { mesh, material };
}

function createTorii() {
  const gate = new THREE.Group();
  const RED = 0xe8283f;
  const DARK = 0x2a1a2e;
  for (const x of [-1.75, 1.75]) {
    const pillar = part(new THREE.CylinderGeometry(0.19, 0.24, 3.9, 20), RED, { outline: 0.05 });
    pillar.position.set(x, 1.95, 0);
    const foot = part(new THREE.CylinderGeometry(0.3, 0.32, 0.32, 20), DARK, { outline: 0.03 });
    foot.position.set(x, 0.16, 0);
    gate.add(pillar, foot);
  }
  // Kasagi with upswept ends.
  const kasagi = part(new THREE.BoxGeometry(4.6, 0.28, 0.48), DARK, { outline: 0.02 });
  kasagi.position.y = 4.05;
  gate.add(kasagi);
  for (const side of [-1, 1]) {
    const tip = part(new THREE.BoxGeometry(0.75, 0.26, 0.46), DARK, { outline: 0.02 });
    tip.position.set(side * 2.6, 4.16, 0);
    tip.rotation.z = side * 0.28;
    gate.add(tip);
  }
  const shimaki = part(new THREE.BoxGeometry(4.5, 0.22, 0.4), RED, { outline: 0.03 });
  shimaki.position.y = 3.8;
  const nuki = part(new THREE.BoxGeometry(4.2, 0.2, 0.26), RED, { outline: 0.03 });
  nuki.position.y = 3.05;
  gate.add(shimaki, nuki);

  // Glowing gold plaque (gakuzuka) with the 先 kanji.
  const plaqueTex = canvasTexture(128, 192, (ctx, w, h) => {
    ctx.fillStyle = '#2a1a2e';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#ffd36e';
    ctx.lineWidth = 8;
    ctx.strokeRect(8, 8, w - 16, h - 16);
    ctx.fillStyle = '#ffd36e';
    ctx.font = '900 92px "Baloo 2", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('先', w / 2, h / 2 + 4);
  });
  const plaque = new THREE.Mesh(
    new THREE.BoxGeometry(0.44, 0.66, 0.12),
    new THREE.MeshBasicMaterial({ map: plaqueTex, color: new THREE.Color(1.6, 1.4, 1.2) }),
  );
  plaque.position.set(0, 3.43, 0.15);
  gate.add(plaque);

  const rope = part(new THREE.TorusGeometry(1.7, 0.07, 8, 40, Math.PI), 0xe2c48a, { outline: 0.05 });
  rope.rotation.z = Math.PI;
  rope.scale.y = 0.18;
  rope.position.set(0, 2.92, 0.16);
  gate.add(rope);
  const shide = [];
  for (const x of [-1, -0.33, 0.33, 1]) {
    const paper = part(new THREE.BoxGeometry(0.13, 0.42, 0.02), 0xffffff, { outline: 0.04 });
    paper.geometry.translate(0, -0.21, 0);
    paper.position.set(x, 2.82 - (1 - Math.abs(x)) * 0.25, 0.18);
    gate.add(paper);
    shide.push(paper);
  }
  return { gate, shide };
}

function createStoneLantern() {
  const STONE = 0xb8b0b8;
  const group = new THREE.Group();
  const pieces = [
    [new THREE.CylinderGeometry(0.36, 0.42, 0.22, 8), 0.11],
    [new THREE.CylinderGeometry(0.12, 0.14, 0.85, 8), 0.64],
    [new THREE.BoxGeometry(0.66, 0.14, 0.66), 1.12],
  ];
  for (const [geo, y] of pieces) {
    const p = part(geo, STONE, { outline: 0.04 });
    p.position.y = y;
    group.add(p);
  }
  const light = new THREE.Mesh(
    new THREE.BoxGeometry(0.44, 0.4, 0.44),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 1.9, 0.8) }),
  );
  light.position.y = 1.4;
  const roof = part(new THREE.ConeGeometry(0.62, 0.42, 4), 0x8e8592, { outline: 0.04 });
  roof.rotation.y = Math.PI / 4;
  roof.position.y = 1.82;
  const finial = part(new THREE.SphereGeometry(0.09, 12, 8), 0x8e8592, { outline: 0.04 });
  finial.position.y = 2.1;
  group.add(light, roof, finial);
  const glow = new THREE.PointLight(0xffa04a, 2.2, 4.5, 1.6);
  glow.position.y = 1.4;
  group.add(glow);
  return { group, glow };
}

// Festival string of paper lanterns (chōchin) between two poles.
function createLanternString() {
  const group = new THREE.Group();
  const left = new THREE.Vector3(-4.6, 3.6, -3.4);
  const right = new THREE.Vector3(4.6, 3.6, -3.4);
  for (const p of [left, right]) {
    const pole = part(new THREE.CylinderGeometry(0.07, 0.09, 3.7, 8), 0x5a3b30, { outline: 0.06 });
    pole.position.set(p.x, 1.85, p.z);
    group.add(pole);
  }
  const mid = left.clone().lerp(right, 0.5);
  mid.y -= 0.75;
  const curve = new THREE.QuadraticBezierCurve3(left, mid, right);
  const rope = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.018, 5), new THREE.MeshBasicMaterial({ color: 0x2a1a2e }));
  group.add(rope);

  const lanterns = [];
  const COLORS = [new THREE.Color(3.4, 0.55, 0.45), new THREE.Color(3.4, 1.9, 0.6), new THREE.Color(3.2, 1.0, 1.6)];
  const bodyGeo = new THREE.SphereGeometry(0.17, 16, 12);
  const capGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.05, 12);
  const capMat = new THREE.MeshBasicMaterial({ color: 0x2a1a2e });
  for (let i = 1; i < 10; i++) {
    const t = i / 10;
    const anchor = curve.getPoint(t);
    const pivot = new THREE.Group();
    pivot.position.copy(anchor);
    const body = new THREE.Mesh(bodyGeo, new THREE.MeshBasicMaterial({ color: COLORS[i % 3] }));
    body.scale.set(1, 1.25, 1);
    body.position.y = -0.3;
    const capTop = new THREE.Mesh(capGeo, capMat);
    capTop.position.y = -0.09;
    const capBottom = new THREE.Mesh(capGeo, capMat);
    capBottom.position.y = -0.51;
    const string = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.1, 4), capMat);
    string.position.y = -0.04;
    pivot.add(body, capTop, capBottom, string);
    group.add(pivot);
    lanterns.push({ pivot, phase: i * 0.7 });
  }
  return { group, lanterns };
}

function createSakuraTree(seed, scale = 1) {
  const rand = rng(seed);
  const tree = new THREE.Group();
  const BARK = 0x5a3b33;
  const trunk = part(new THREE.CylinderGeometry(0.16, 0.32, 2.4, 9), BARK, { outline: 0.04 });
  trunk.position.y = 1.2;
  trunk.rotation.z = 0.06;
  tree.add(trunk);
  for (const [x, y, z, rz, rx] of [[-0.45, 2.25, 0, 0.8, 0.1], [0.5, 2.35, 0.1, -0.75, -0.1], [0.05, 2.55, -0.4, 0.1, 0.6]]) {
    const branch = part(new THREE.CylinderGeometry(0.06, 0.12, 1.2, 7), BARK, { outline: 0.05 });
    branch.position.set(x, y, z);
    branch.rotation.set(rx, 0, rz);
    tree.add(branch);
  }
  const canopy = new THREE.Group();
  const PINKS = [0xffb8cb, 0xffc9d8, 0xffa9c0, 0xffd6e2, 0xff9fb9];
  for (let i = 0; i < 15; i++) {
    const a = rand() * Math.PI * 2;
    const r = 0.3 + rand() * 1.05;
    const blob = part(new THREE.IcosahedronGeometry(0.5 + rand() * 0.42, 1), PINKS[i % PINKS.length], { outline: 0.03, rim: 1.4 });
    blob.position.set(Math.cos(a) * r, 2.7 + rand() * 1.15 - r * 0.25, Math.sin(a) * r * 0.85);
    blob.rotation.set(rand() * 3, rand() * 3, 0);
    canopy.add(blob);
  }
  tree.add(canopy);
  tree.scale.setScalar(scale);
  return { tree, canopy, phase: rand() * 6 };
}

function createPond() {
  const group = new THREE.Group();
  group.position.set(POND.x, 0, POND.z);

  const basin = new THREE.Mesh(new THREE.CircleGeometry(POND.r, 40), new THREE.MeshBasicMaterial({ color: 0x1d4f6a }));
  basin.rotation.x = -Math.PI / 2;
  basin.position.y = -0.22;
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(POND.r, POND.r, 0.24, 40, 1, true), new THREE.MeshBasicMaterial({ color: 0x245a73, side: THREE.BackSide }));
  wall.position.y = -0.11;
  group.add(basin, wall);

  const water = new THREE.Mesh(
    new THREE.CircleGeometry(POND.r, 48),
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uDeep: { value: new THREE.Color(0x2a8fb0) },
        uShallow: { value: new THREE.Color(0x8ff0e6) },
        uSky: { value: new THREE.Color(0xffc2a6) },
      },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform vec3 uDeep, uShallow, uSky;
        varying vec2 vUv;
        void main() {
          vec2 p = vUv - 0.5;
          float d = length(p) * 2.0;
          vec3 col = mix(uDeep, uShallow, smoothstep(0.55, 1.0, d));
          float w = sin(p.x * 22.0 + uTime * 1.3) * sin(p.y * 19.0 - uTime * 1.1) + sin((p.x + p.y) * 31.0 + uTime * 1.7) * 0.5;
          float lines = smoothstep(0.82, 0.98, w);
          col += uSky * lines * 0.55;
          col = mix(col, uSky, smoothstep(0.2, -0.45, p.y) * 0.28);
          col += vec3(1.0) * smoothstep(0.9, 0.97, d) * 0.55; // foam rim
          gl_FragColor = vec4(col * 1.05, 0.82);
        }`,
    }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.03;
  group.add(water);

  const rand = rng(8);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + rand() * 0.2;
    const s = 0.16 + rand() * 0.12;
    const stone = part(new THREE.DodecahedronGeometry(s, 0), 0xa59cab, { outline: 0.05 });
    stone.position.set(Math.cos(a) * (POND.r + 0.08), s * 0.4, Math.sin(a) * (POND.r + 0.08));
    stone.scale.y = 0.6;
    group.add(stone);
  }

  // Lily pads and a glowing lotus.
  const padMat = toon(0x4fae5a, { side: THREE.DoubleSide });
  for (const [x, z, s] of [[0.45, -0.3, 0.22], [-0.5, 0.35, 0.18], [0.2, 0.55, 0.15], [-0.3, -0.55, 0.2]]) {
    const pad = new THREE.Mesh(new THREE.CircleGeometry(s, 16, 0.4, Math.PI * 2 - 0.4), padMat);
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(x, 0.045, z);
    group.add(pad);
  }
  const lotus = new THREE.Group();
  for (let i = 0; i < 7; i++) {
    const petal = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.2, 1.7) }));
    const a = (i / 7) * Math.PI * 2;
    petal.scale.set(0.6, 1.4, 0.4);
    petal.position.set(Math.cos(a) * 0.06, 0.08, Math.sin(a) * 0.06);
    petal.rotation.set(Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6);
    lotus.add(petal);
  }
  lotus.position.set(0.45, 0.04, -0.3);
  group.add(lotus);

  // Koi swimming under the surface.
  const koi = [];
  for (const [color, spot, radius, speed, phase] of [[0xff7a2f, 0xffffff, 0.7, 0.55, 0], [0xffffff, 0xff3b30, 0.5, -0.7, 2], [0xffb52e, 0x2a1a2e, 0.85, 0.42, 4]]) {
    const fish = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.2, 4, 8), toon(color, { rim: 0 }));
    body.rotation.z = Math.PI / 2;
    const patch = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), toon(spot, { rim: 0 }));
    patch.position.set(0.02, 0.035, 0);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.12, 6), toon(color, { rim: 0 }));
    tail.rotation.z = Math.PI / 2;
    tail.position.x = -0.19;
    fish.add(body, patch, tail);
    fish.position.y = -0.07;
    group.add(fish);
    koi.push({ fish, tail, radius, speed, phase });
  }
  return { group, water, koi };
}

function createDais() {
  const group = new THREE.Group();
  const base = part(new THREE.CylinderGeometry(1.42, 1.55, 0.2, 40), 0xb3a9b9, { outline: 0.02 });
  base.position.y = 0.1;
  const step = part(new THREE.CylinderGeometry(1.15, 1.22, 0.14, 40), 0xd3cad6, { outline: 0.02 });
  step.position.y = 0.27;
  group.add(base, step);
  return group;
}

function magicCircleTexture() {
  const SIZE = 1024;
  return canvasTexture(SIZE, SIZE, (ctx, s) => {
    const c = s / 2;
    ctx.translate(c, c);
    ctx.strokeStyle = '#fff';
    ctx.fillStyle = '#fff';
    const ring = (r, w) => { ctx.lineWidth = w; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke(); };
    ring(500, 10);
    ring(468, 4);
    ring(360, 7);
    ring(336, 3);
    ring(150, 6);
    // Rune band.
    const RUNES = '先生火風水光道星夢言葉智心力未来創造学問';
    ctx.font = '700 40px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < 36; i++) {
      ctx.save();
      ctx.rotate((i / 36) * Math.PI * 2);
      ctx.fillText(RUNES[i % RUNES.length], 0, -418);
      ctx.restore();
    }
    // Hexagram.
    ctx.lineWidth = 6;
    for (const off of [0, Math.PI / 3]) {
      ctx.beginPath();
      for (let i = 0; i <= 3; i++) {
        const a = off + (i / 3) * Math.PI * 2 - Math.PI / 2;
        ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * 336, Math.sin(a) * 336);
      }
      ctx.stroke();
    }
    // Small orbit circles at the star points.
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * 360, Math.sin(a) * 360, 34, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Tick marks.
    ctx.lineWidth = 3;
    for (let i = 0; i < 120; i++) {
      const a = (i / 120) * Math.PI * 2;
      const r1 = i % 5 ? 478 : 470;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r1, Math.sin(a) * r1);
      ctx.lineTo(Math.cos(a) * 492, Math.sin(a) * 492);
      ctx.stroke();
    }
    // Soft inner glow.
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 360);
    g.addColorStop(0, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 360, 0, Math.PI * 2);
    ctx.fill();
  });
}

function createMagicCircle() {
  const texture = magicCircleTexture();
  const make = size => new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: 0xffffff }),
  );
  const outer = make(2.5);
  outer.rotation.x = -Math.PI / 2;
  outer.position.y = 0.35;
  const inner = make(1.35);
  inner.rotation.x = -Math.PI / 2;
  inner.position.y = 0.36;
  // Light column that flares up on big moments.
  const pillar = new THREE.Mesh(
    new THREE.CylinderGeometry(1.05, 1.15, 5, 40, 1, true),
    new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uColor: { value: new THREE.Color() }, uPower: { value: 0 }, uTime: { value: 0 } },
      vertexShader: /* glsl */ `
        varying vec2 vUv; varying float vEdge;
        void main() {
          vUv = uv;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          // Glow on the silhouette only, so the column never hides Sensei.
          vEdge = 1.0 - abs(dot(normalize(normalMatrix * normal), normalize(-mv.xyz)));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; uniform float uPower, uTime; varying vec2 vUv; varying float vEdge;
        void main() {
          float fade = pow(1.0 - vUv.y, 2.2);
          float streaks = 0.6 + 0.4 * sin(vUv.x * 60.0 + uTime * 3.0) * sin(vUv.x * 23.0 - uTime * 2.0);
          float edge = pow(vEdge, 2.5);
          gl_FragColor = vec4(uColor * fade * streaks * edge * uPower, 1.0);
        }`,
    }),
  );
  pillar.position.y = 0.35 + 2.5;
  return { outer, inner, pillar };
}

const ORB_VERTEX = /* glsl */ `
  uniform float uPhase, uPixelRatio, uTime;
  attribute vec4 aParams; // phase, speed, radius, size
  attribute vec3 aColor;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float t = uPhase * aParams.y + aParams.x;
    vec3 p = position + vec3(sin(t) * aParams.z, sin(t * 1.3 + 1.7) * 0.35 + sin(t * 0.45) * 0.25, cos(t * 0.8) * aParams.z);
    vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = min(aParams.w * uPixelRatio * (28.0 / -mvPosition.z), 90.0 * uPixelRatio);
    gl_Position = projectionMatrix * mvPosition;
    vColor = aColor;
    vAlpha = (0.55 + 0.45 * sin(uTime * 2.6 + aParams.x * 7.0)) * smoothstep(1.2, 4.0, -mvPosition.z);
  }`;

const GLOW_FRAGMENT = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    float a = smoothstep(0.5, 0.0, d);
    a *= a;
    float core = smoothstep(0.16, 0.0, d);
    gl_FragColor = vec4(vColor * (a + core * 2.5) * vAlpha, 1.0);
  }`;

function glowPointsMaterial(vertexShader, uniforms = {}) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uPhase: { value: 0 }, uTime: { value: 0 }, uPixelRatio: { value: 1 }, ...uniforms },
    vertexShader,
    fragmentShader: GLOW_FRAGMENT,
  });
}

// Kitsunebi: drifting spirit orbs animated entirely on the GPU.
function createSpiritOrbs() {
  const rand = rng(55);
  const COUNT = 140;
  const pos = new Float32Array(COUNT * 3);
  const params = new Float32Array(COUNT * 4);
  const colors = new Float32Array(COUNT * 3);
  const PALETTE = [[1.0, 0.85, 0.4], [0.45, 0.9, 1.0], [1.0, 0.55, 0.8]];
  for (let i = 0; i < COUNT; i++) {
    const a = rand() * Math.PI * 2;
    const r = 1.8 + rand() * 9;
    pos.set([Math.cos(a) * r, 0.4 + rand() * 4.2, Math.sin(a) * r * 0.8 - 2.5], i * 3);
    params.set([rand() * 20, 0.3 + rand() * 0.6, 0.3 + rand() * 0.8, 6 + rand() * 12], i * 4);
    colors.set(PALETTE[i % 3].map(v => v * (0.5 + rand() * 0.5)), i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aParams', new THREE.BufferAttribute(params, 4));
  geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
  const points = new THREE.Points(geo, glowPointsMaterial(ORB_VERTEX));
  points.frustumCulled = false;
  return points;
}

// Motes rising out of the magic circle while Sensei is thinking.
function createMotes() {
  const rand = rng(91);
  const COUNT = 70;
  const pos = new Float32Array(COUNT * 3);
  const params = new Float32Array(COUNT * 4);
  for (let i = 0; i < COUNT; i++) {
    const a = rand() * Math.PI * 2;
    const r = 0.3 + rand() * 0.85;
    pos.set([Math.cos(a) * r, 0.35, Math.sin(a) * r], i * 3);
    params.set([rand(), 0.25 + rand() * 0.5, rand() * 6.28, 5 + rand() * 8], i * 4);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aParams', new THREE.BufferAttribute(params, 4));
  const material = glowPointsMaterial(/* glsl */ `
    uniform float uPhase, uPixelRatio, uTime, uAmount;
    uniform vec3 uColor;
    attribute vec4 aParams;
    varying vec3 vColor;
    varying float vAlpha;
    void main() {
      float life = fract(aParams.x + uPhase * aParams.y);
      vec3 p = position;
      p.y += life * 3.0;
      p.x += sin(life * 6.0 + aParams.z) * 0.12;
      p.z += cos(life * 5.0 + aParams.z) * 0.12;
      vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
      gl_PointSize = aParams.w * uPixelRatio * (26.0 / -mvPosition.z) * (1.0 - life * 0.6);
      gl_Position = projectionMatrix * mvPosition;
      vColor = uColor;
      vAlpha = sin(life * 3.14159) * uAmount;
    }`, { uAmount: { value: 0 }, uColor: { value: new THREE.Color(0x5fe6ff) } });
  const points = new THREE.Points(geo, material);
  points.frustumCulled = false;
  return points;
}

// CPU sparkle burst for celebrations and petting.
function createSparks() {
  const pos = new Float32Array(SPARKS * 3);
  const colors = new Float32Array(SPARKS * 3);
  const sizes = new Float32Array(SPARKS);
  const vel = new Float32Array(SPARKS * 3);
  const life = new Float32Array(SPARKS);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uPixelRatio: { value: 1 } },
    vertexShader: /* glsl */ `
      uniform float uPixelRatio;
      attribute vec3 aColor; attribute float aSize;
      varying vec3 vColor;
      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * uPixelRatio * (26.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
        vColor = aColor;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float star = max(0.0, 1.0 - abs(c.x) * abs(c.y) * 90.0) * smoothstep(0.5, 0.0, length(c));
        float core = smoothstep(0.2, 0.0, length(c));
        gl_FragColor = vec4(vColor * (star + core * 2.0), 1.0);
      }`,
  });
  const points = new THREE.Points(geo, material);
  points.frustumCulled = false;
  const PALETTE = [[2.4, 1.7, 0.6], [2.4, 0.9, 1.6], [0.9, 2, 2.4], [2.2, 2.2, 2.2]];

  function emit(count, origin, power = 1) {
    let spawned = 0;
    for (let i = 0; i < SPARKS && spawned < count; i++) {
      if (life[i] > 0) continue;
      const a = Math.random() * Math.PI * 2;
      const up = Math.random();
      const speed = (1.5 + Math.random() * 3) * power;
      vel.set([Math.cos(a) * speed * 0.8, 2 + up * 4 * power, Math.sin(a) * speed * 0.6], i * 3);
      pos.set([origin.x, origin.y, origin.z], i * 3);
      colors.set(PALETTE[(Math.random() * 4) | 0], i * 3);
      life[i] = 1 + Math.random() * 0.8;
      spawned++;
    }
  }

  function update(dt) {
    for (let i = 0; i < SPARKS; i++) {
      if (life[i] <= 0) { sizes[i] = 0; continue; }
      life[i] -= dt;
      const k = i * 3;
      vel[k + 1] -= 5.5 * dt;
      const drag = Math.exp(-1.8 * dt);
      vel[k] *= drag;
      vel[k + 2] *= drag;
      pos[k] += vel[k] * dt;
      pos[k + 1] += vel[k + 1] * dt;
      pos[k + 2] += vel[k + 2] * dt;
      sizes[i] = Math.max(0, Math.min(1, life[i])) * 14;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.aSize.needsUpdate = true;
    geo.attributes.aColor.needsUpdate = true;
  }
  return { points, emit, update };
}

function createPetals() {
  const shape = new THREE.Shape();
  shape.moveTo(0, -0.07);
  shape.bezierCurveTo(0.07, -0.03, 0.06, 0.05, 0.015, 0.07);
  shape.lineTo(0, 0.05);
  shape.lineTo(-0.015, 0.07);
  shape.bezierCurveTo(-0.06, 0.05, -0.07, -0.03, 0, -0.07);
  const mesh = new THREE.InstancedMesh(
    new THREE.ShapeGeometry(shape),
    new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, color: 0xffffff }),
    PETALS,
  );
  const color = new THREE.Color();
  for (let i = 0; i < PETALS; i++) mesh.setColorAt(i, color.setHSL(0.94 + Math.random() * 0.04, 0.9, 0.82 + Math.random() * 0.1));
  mesh.frustumCulled = false;
  return mesh;
}

export function createGarden(scene) {
  const island = createIsland();
  scene.add(island);

  const grass = createGrass();
  scene.add(grass.mesh);

  scene.add(createDais());

  // Stepping stones along the path.
  const rand = rng(3);
  for (let i = 0; i < 6; i++) {
    const z = -2.1 - i * 0.68;
    const stone = part(new THREE.CylinderGeometry(0.34, 0.38, 0.08, 9), 0xc9c0cc, { outline: 0.03 });
    stone.position.set(Math.sin(i * 1.4) * 0.2, 0.04, z);
    stone.rotation.y = rand() * 3;
    scene.add(stone);
  }

  const { gate, shide } = createTorii();
  gate.position.set(0, 0, TORII_Z);
  scene.add(gate);

  const stoneLanterns = [];
  for (const x of [-2.5, 2.5]) {
    const lantern = createStoneLantern();
    lantern.group.position.set(x, 0, -2.4);
    scene.add(lantern.group);
    stoneLanterns.push(lantern);
  }

  const lanternString = createLanternString();
  scene.add(lanternString.group);

  const trees = [
    createSakuraTree(21, 1.3),
    createSakuraTree(42, 1.05),
    createSakuraTree(63, 1.55),
    createSakuraTree(84, 0.9),
  ];
  const treeSpots = [[-4.6, -3.8], [4.7, -4.4], [-5.8, -7.8], [6.4, -1.2]];
  trees.forEach((t, i) => {
    t.tree.position.set(treeSpots[i][0], 0, treeSpots[i][1]);
    scene.add(t.tree);
  });

  // Bushes, rocks and flower clumps.
  const BUSH = [0x5fae4e, 0x4f9a45, 0x6dbd58];
  for (const [x, z, r] of [[-2.0, 0.6, 0.42], [2.2, 0.4, 0.4], [-3.4, -1.6, 0.5], [3.4, -2.6, 0.48], [1.4, -4.4, 0.36], [-1.6, -4.8, 0.34], [5.4, -6.4, 0.6], [-7, -3.5, 0.55], [7.1, -4, 0.5]]) {
    const clump = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const blob = part(new THREE.IcosahedronGeometry(r * (0.7 + i * 0.15), 1), BUSH[i], { outline: 0.04 });
      blob.position.set((i - 1) * r * 0.7, r * 0.55, (rand() - 0.5) * r * 0.5);
      clump.add(blob);
    }
    clump.position.set(x, 0, z);
    scene.add(clump);
  }
  for (const [x, z, s] of [[3.0, 1.6, 0.35], [-5.2, -0.2, 0.45], [5.6, -3.0, 0.3], [-1.2, -6.8, 0.4], [2.6, -7.2, 0.5]]) {
    const rock = part(new THREE.DodecahedronGeometry(s, 0), 0x9d93a6, { outline: 0.05 });
    rock.position.set(x, s * 0.45, z);
    rock.rotation.set(rand(), rand() * 3, 0);
    scene.add(rock);
  }

  const FLOWER_COLORS = [0xffffff, 0xff9ec4, 0xffd7e4, 0xc9b2ff, 0xffe17a];
  const flowerMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.075, 1), toon(0xffffff, { rim: 0.6 }), 120);
  const dummy = new THREE.Object3D();
  const fColor = new THREE.Color();
  let f = 0;
  while (f < 120) {
    const cx = (rand() - 0.5) * 2 * (R - 1);
    const cz = (rand() - 0.5) * 2 * (R - 1) + CZ;
    if (Math.hypot(cx, cz - CZ) > R - 0.8 || Math.hypot(cx, cz) < 2.3 || Math.abs(cx) < 1.5) continue;
    const color = FLOWER_COLORS[(rand() * FLOWER_COLORS.length) | 0];
    for (let k = 0; k < 6 && f < 120; k++, f++) {
      dummy.position.set(cx + (rand() - 0.5) * 0.6, 0.24 + rand() * 0.1, cz + (rand() - 0.5) * 0.6);
      dummy.scale.set(1, 0.55, 1);
      dummy.updateMatrix();
      flowerMesh.setMatrixAt(f, dummy.matrix);
      flowerMesh.setColorAt(f, fColor.set(color));
    }
  }
  scene.add(flowerMesh);

  const pond = createPond();
  scene.add(pond.group);

  const circle = createMagicCircle();
  scene.add(circle.outer, circle.inner, circle.pillar);

  const orbs = createSpiritOrbs();
  const motes = createMotes();
  const sparks = createSparks();
  scene.add(orbs, motes, sparks.points);

  const petals = createPetals();
  scene.add(petals);
  const AREA = { x: 11, yTop: 8, zMin: -10, zMax: 4.5 };
  const pPos = new Float32Array(PETALS * 3);
  const pVel = new Float32Array(PETALS * 3);
  const pSpin = new Float32Array(PETALS * 3);
  const pPhase = new Float32Array(PETALS);
  function resetPetal(i, anywhere) {
    pPos[i * 3] = (Math.random() * 2 - 1) * AREA.x;
    pPos[i * 3 + 1] = anywhere ? Math.random() * AREA.yTop : AREA.yTop + Math.random();
    pPos[i * 3 + 2] = AREA.zMin + Math.random() * (AREA.zMax - AREA.zMin);
    pVel[i * 3] = 0;
    pVel[i * 3 + 1] = -(0.3 + Math.random() * 0.4);
    pVel[i * 3 + 2] = 0;
  }
  for (let i = 0; i < PETALS; i++) {
    resetPetal(i, true);
    pSpin.set([Math.random() * 3, Math.random() * 3, Math.random() * 3], i * 3);
    pPhase[i] = Math.random() * Math.PI * 2;
  }

  // Mood state, eased every frame.
  const fx = { color: new THREE.Color(MOOD_FX.idle.color), power: 1, spin: 0.12, motes: 0.15, orbs: 1, flare: 0 };
  let target = MOOD_FX.idle;
  let spinAngle = 0;
  let orbPhase = 0;
  let motePhase = 0;
  const targetColor = new THREE.Color(target.color);

  function setMood(mood) {
    target = MOOD_FX[mood] ?? MOOD_FX.idle;
    targetColor.set(target.color);
    if (mood === 'happy') fx.flare = 1;
  }

  function setPixelRatio(pr) {
    orbs.material.uniforms.uPixelRatio.value = pr;
    motes.material.uniforms.uPixelRatio.value = pr;
    sparks.points.material.uniforms.uPixelRatio.value = pr;
  }

  function update(t, dt) {
    const ease = 1 - Math.exp(-dt * 3);
    fx.color.lerp(targetColor, ease);
    fx.power += (target.power - fx.power) * ease;
    fx.spin += (target.spin - fx.spin) * ease;
    fx.motes += (target.motes - fx.motes) * ease;
    fx.orbs += (target.orbs - fx.orbs) * ease;
    fx.flare = Math.max(0, fx.flare - dt * 0.7);

    grass.material.uniforms.uTime.value = t;
    pond.water.material.uniforms.uTime.value = t;

    // Magic circle.
    spinAngle += fx.spin * dt;
    circle.outer.rotation.z = spinAngle;
    circle.inner.rotation.z = -spinAngle * 1.8;
    const pulse = 1 + Math.sin(t * 3) * 0.08;
    circle.outer.material.color.copy(fx.color).multiplyScalar(fx.power * pulse);
    circle.inner.material.color.copy(fx.color).multiplyScalar(fx.power * 0.9 * pulse);
    const pillarU = circle.pillar.material.uniforms;
    pillarU.uColor.value.copy(fx.color);
    pillarU.uPower.value = fx.flare * 1.6 + Math.max(0, fx.power - 2) * 0.12;
    pillarU.uTime.value = t;

    // Particles.
    orbPhase += dt * fx.orbs;
    motePhase += dt * (0.4 + fx.motes);
    orbs.material.uniforms.uPhase.value = orbPhase;
    orbs.material.uniforms.uTime.value = t;
    motes.material.uniforms.uPhase.value = motePhase;
    motes.material.uniforms.uAmount.value = fx.motes;
    motes.material.uniforms.uColor.value.copy(fx.color).multiplyScalar(1.6);
    sparks.update(dt);

    for (const tr of trees) {
      tr.canopy.rotation.z = Math.sin(t * 1.1 + tr.phase) * 0.025;
      tr.canopy.rotation.x = Math.cos(t * 0.9 + tr.phase) * 0.018;
    }
    for (let i = 0; i < shide.length; i++) shide[i].rotation.z = Math.sin(t * 2.2 + i * 0.7) * 0.12;
    for (const { pivot, phase } of lanternString.lanterns) {
      pivot.rotation.z = Math.sin(t * 1.4 + phase) * 0.12;
      pivot.rotation.x = Math.cos(t * 1.1 + phase) * 0.06;
    }
    for (const { glow } of stoneLanterns) {
      glow.intensity = 2.0 + Math.sin(t * 8) * 0.25 + Math.cos(t * 13) * 0.12;
    }
    for (const k of pond.koi) {
      const a = t * k.speed + k.phase;
      k.fish.position.x = Math.cos(a) * k.radius * 0.8;
      k.fish.position.z = Math.sin(a) * k.radius * 0.55;
      k.fish.rotation.y = -a - Math.sign(k.speed) * Math.PI / 2 + (k.speed < 0 ? Math.PI : 0);
      k.tail.rotation.y = Math.sin(t * 9 + k.phase) * 0.5;
    }

    // Falling petals.
    const drag = Math.exp(-1.5 * dt);
    for (let i = 0; i < PETALS; i++) {
      const k = i * 3;
      pVel[k] *= drag;
      pVel[k + 2] *= drag;
      pVel[k + 1] = Math.max(pVel[k + 1] - 1.2 * dt, -(0.3 + (i % 6) * 0.07));
      pPos[k] += (pVel[k] + Math.sin(t * 0.9 + pPhase[i]) * 0.36 + 0.2) * dt;
      pPos[k + 1] += pVel[k + 1] * dt;
      pPos[k + 2] += pVel[k + 2] * dt;
      if (pPos[k + 1] < 0.02 || Math.abs(pPos[k]) > AREA.x + 2) resetPetal(i, false);
      dummy.position.set(pPos[k], pPos[k + 1], pPos[k + 2]);
      dummy.rotation.set(t * pSpin[k], t * pSpin[k + 1], t * pSpin[k + 2]);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      petals.setMatrixAt(i, dummy.matrix);
    }
    petals.instanceMatrix.needsUpdate = true;
  }

  const burstOrigin = new THREE.Vector3(0, 1.6, 0.3);
  function burst(power = 1) {
    sparks.emit(Math.round(90 * power), burstOrigin, power);
    for (let n = 0; n < 70 * power; n++) {
      const i = Math.floor(Math.random() * PETALS);
      const k = i * 3;
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.8 + Math.random() * 2.6;
      pPos.set([0, 2, 0.4], k);
      pVel.set([Math.cos(angle) * speed, 1.8 + Math.random() * 2, Math.sin(angle) * speed * 0.7], k);
    }
  }

  return { update, burst, setMood, setPixelRatio };
}
