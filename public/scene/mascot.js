// Sensei: a chibi three-tailed kitsune with a painted anime face, foxfire, emote bubbles and a rank crest.
import * as THREE from 'three';
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';
import { part, toon, canvasTexture, getGlowTexture } from './toon.js';
import { t, isLang, DEFAULT_LANG } from '../i18n.js';

const ORANGE = 0xff9443;
const CREAM = 0xfff4e6;
const DARK = 0x2a1a2e;
const RED = 0xe8283f;
const GOLD = 0xffc83b;
const WOOD_DARK = 0x8a542b;
// Rounded Japanese font after the Latin ones so kana and kanji do not fall back to a system font.
const EMOTE_FONT = '"Baloo 2", "Be Vietnam Pro", "M PLUS Rounded 1c", sans-serif';

const POSES = {
  idle: { tilt: 0, pitch: 0, yaw: 0, ear: 0, armL: 0, armR: 0 },
  thinking: { tilt: 0.14, pitch: -0.16, yaw: 0.12, ear: 0.05, armL: 0.2, armR: 0.6 },
  confused: { tilt: 0.42, pitch: 0.05, yaw: -0.1, ear: 0.35, armL: -0.1, armR: 0.3 },
  happy: { tilt: 0, pitch: -0.1, yaw: 0, ear: -0.22, armL: 2.3, armR: 2.3 },
  neutral: { tilt: 0, pitch: 0, yaw: 0, ear: 0, armL: 0.1, armR: 0.1 },
  sad: { tilt: -0.08, pitch: 0.24, yaw: 0, ear: 0.9, armL: -0.2, armR: -0.2 },
};

// Speech-bubble accent colour per mood; the text comes from the shared dictionary (public/i18n.js).
const EMOTE_COLORS = {
  thinking: '#3aa9d8',
  confused: '#9a5cf0',
  happy: '#ff4f8b',
  neutral: '#2fae7c',
  sad: '#5a72e0',
  pet: '#ff4f8b',
};
const emoteFor = (lang, key) => [t(lang, `emote.${key}.title`), t(lang, `emote.${key}.sub`), EMOTE_COLORS[key]];

const RANKS = [
  { min: 90, letter: 'S', a: '#fff3a8', b: '#ffb21e', ray: [3, 2.3, 0.9] },
  { min: 80, letter: 'A', a: '#ffd0ec', b: '#ff4f9a', ray: [3, 1.1, 2.0] },
  { min: 60, letter: 'B', a: '#c9f4ff', b: '#2ab3ff', ray: [0.9, 2.2, 3] },
  { min: 0, letter: 'C', a: '#e4e2f5', b: '#8d8bb5', ray: [1.6, 1.6, 2.2] },
];
export const rankFor = score => RANKS.find(r => score >= r.min);

// ---------- Painted face (decal) ----------
// Face texture covers head-space x ∈ [-0.5, 0.5], y ∈ [0.05, 0.85].
const FACE_W = 512;
const FACE_H = 410;
const fx = x => (x + 0.5) * FACE_W;
const fy = y => (1 - (y - 0.05) / 0.8) * FACE_H;
const fs = s => s * FACE_W;

function drawEye(ctx, side, expr, gx, gy) {
  const cx = fx(side * 0.205);
  const cy = fy(0.53);
  const w = fs(0.075);
  const h = fs(0.1);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#2a1a2e';
  ctx.fillStyle = '#2a1a2e';

  if (expr === 'happy' || expr === 'pet') {
    ctx.lineWidth = fs(0.026);
    ctx.beginPath();
    ctx.arc(cx, cy + h * 0.25, w * 0.95, Math.PI * 1.1, Math.PI * 1.9);
    ctx.stroke();
    ctx.restore();
    return;
  }
  if (expr === 'blink') {
    ctx.lineWidth = fs(0.022);
    ctx.beginPath();
    ctx.arc(cx, cy - h * 0.6, w * 1.05, Math.PI * 0.18, Math.PI * 0.82);
    ctx.stroke();
    ctx.restore();
    return;
  }

  // Sclera + big glossy iris.
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(cx, cy, w, h, 0, 0, Math.PI * 2);
  ctx.fill();
  const small = expr === 'confused';
  const ix = cx + gx * w * 0.28 + side * w * 0.04;
  const iy = cy - gy * h * 0.22 + h * 0.06;
  const iw = w * (small ? 0.6 : 0.86);
  const ih = h * (small ? 0.64 : 0.9);
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, cy, w, h, 0, 0, Math.PI * 2);
  ctx.clip();
  const iris = ctx.createLinearGradient(0, iy - ih, 0, iy + ih);
  iris.addColorStop(0, '#3a1430');
  iris.addColorStop(0.45, '#b4325a');
  iris.addColorStop(1, '#ffb347');
  ctx.fillStyle = iris;
  ctx.beginPath();
  ctx.ellipse(ix, iy, iw, ih, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1a0a18';
  ctx.beginPath();
  ctx.ellipse(ix, iy + ih * 0.05, iw * 0.45, ih * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  // Catchlights.
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(ix + iw * 0.32, iy - ih * 0.42, iw * 0.34, ih * 0.27, -0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(ix - iw * 0.35, iy + ih * 0.42, iw * 0.15, 0, Math.PI * 2);
  ctx.fill();
  if (expr === 'sad') {
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.arc(ix + iw * 0.25, iy + ih * 0.2, iw * 0.12, 0, Math.PI * 2);
    ctx.arc(ix - iw * 0.1, iy + ih * 0.55, iw * 0.08, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  // Thick upper lash line with a flick at the outer corner.
  ctx.lineWidth = fs(0.02);
  ctx.beginPath();
  ctx.ellipse(cx, cy, w * 1.02, h * 1.02, 0, Math.PI * 1.08, Math.PI * 1.92);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx + side * w * 0.95, cy - h * 0.45);
  ctx.lineTo(cx + side * w * 1.35, cy - h * 0.75);
  ctx.stroke();
  ctx.lineWidth = fs(0.008);
  ctx.beginPath();
  ctx.ellipse(cx, cy, w, h, 0, Math.PI * 0.2, Math.PI * 0.8);
  ctx.stroke();

  // Brows for sad / confused / thinking.
  const by = cy - h * 1.55;
  const slope = expr === 'sad' ? -0.35 : expr === 'confused' ? (side < 0 ? 0.3 : -0.15) : expr === 'thinking' ? 0.15 : 0;
  if (slope) {
    ctx.lineWidth = fs(0.014);
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.8, by + side * slope * w);
    ctx.lineTo(cx + w * 0.8, by - side * slope * w);
    ctx.stroke();
  }
  ctx.restore();
}

function drawMouth(ctx, expr) {
  const cx = fx(0);
  const cy = fy(0.3);
  const s = fs(0.04);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#2a1a2e';
  ctx.lineWidth = fs(0.012);
  if (expr === 'happy' || expr === 'pet') {
    ctx.fillStyle = '#7a1b33';
    ctx.beginPath();
    ctx.moveTo(cx - s * 1.3, cy - s * 0.2);
    ctx.quadraticCurveTo(cx, cy - s * 0.5, cx + s * 1.3, cy - s * 0.2);
    ctx.quadraticCurveTo(cx + s * 1.1, cy + s * 1.6, cx, cy + s * 1.6);
    ctx.quadraticCurveTo(cx - s * 1.1, cy + s * 1.6, cx - s * 1.3, cy - s * 0.2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ff7f9f';
    ctx.beginPath();
    ctx.ellipse(cx, cy + s * 1.05, s * 0.7, s * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (expr === 'thinking' || expr === 'confused') {
    ctx.beginPath();
    ctx.ellipse(cx + (expr === 'confused' ? s * 0.4 : 0), cy + s * 0.4, s * 0.42, s * 0.5, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#7a1b33';
    ctx.fill();
    ctx.stroke();
  } else if (expr === 'sad') {
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.9, cy + s * 0.7);
    ctx.quadraticCurveTo(cx - s * 0.45, cy - s * 0.1, cx, cy + s * 0.45);
    ctx.quadraticCurveTo(cx + s * 0.45, cy - s * 0.1, cx + s * 0.9, cy + s * 0.7);
    ctx.stroke();
  } else {
    // Cat mouth "ω".
    ctx.beginPath();
    ctx.moveTo(cx - s * 1.0, cy);
    ctx.quadraticCurveTo(cx - s * 0.5, cy + s * 0.8, cx, cy);
    ctx.quadraticCurveTo(cx + s * 0.5, cy + s * 0.8, cx + s * 1.0, cy);
    ctx.stroke();
  }
  ctx.restore();
}

function drawFace(ctx, expr, gx, gy) {
  ctx.clearRect(0, 0, FACE_W, FACE_H);
  // Cream fox mask over the lower face and cheeks.
  ctx.fillStyle = '#fff4e6';
  ctx.beginPath();
  ctx.moveTo(fx(-0.5), fy(0.47));
  ctx.quadraticCurveTo(fx(-0.33), fy(0.43), fx(-0.17), fy(0.45));
  ctx.quadraticCurveTo(fx(-0.05), fy(0.46), fx(0), fy(0.39));
  ctx.quadraticCurveTo(fx(0.05), fy(0.46), fx(0.17), fy(0.45));
  ctx.quadraticCurveTo(fx(0.33), fy(0.43), fx(0.5), fy(0.47));
  ctx.lineTo(fx(0.5), fy(0.05));
  ctx.lineTo(fx(-0.5), fy(0.05));
  ctx.closePath();
  ctx.fill();

  // Kitsune shrine markings: forehead flame + brow dots.
  ctx.fillStyle = '#e8283f';
  ctx.beginPath();
  ctx.moveTo(fx(0), fy(0.84));
  ctx.quadraticCurveTo(fx(0.07), fy(0.74), fx(0), fy(0.66));
  ctx.quadraticCurveTo(fx(-0.07), fy(0.74), fx(0), fy(0.84));
  ctx.fill();
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(fx(side * 0.2), fy(0.7), fs(0.035), fs(0.018), side * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }

  // Blush with anime hatch strokes.
  for (const side of [-1, 1]) {
    const g = ctx.createRadialGradient(fx(side * 0.33), fy(0.4), 0, fx(side * 0.33), fy(0.4), fs(0.09));
    g.addColorStop(0, `rgba(255, 110, 150, ${expr === 'pet' || expr === 'happy' ? 0.85 : 0.55})`);
    g.addColorStop(1, 'rgba(255, 110, 150, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(fx(side * 0.33), fy(0.4), fs(0.1), fs(0.06), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(230, 70, 110, 0.7)';
    ctx.lineWidth = fs(0.007);
    for (let i = -1; i <= 1; i++) {
      const x = fx(side * 0.33 + i * 0.03);
      ctx.beginPath();
      ctx.moveTo(x + fs(0.012), fy(0.42));
      ctx.lineTo(x - fs(0.012), fy(0.38));
      ctx.stroke();
    }
  }

  drawEye(ctx, -1, expr, gx, gy);
  drawEye(ctx, 1, expr, gx, gy);
  drawMouth(ctx, expr);

  if (expr === 'sad') {
    // Single tear.
    ctx.fillStyle = '#8fd8ff';
    ctx.strokeStyle = '#2a1a2e';
    ctx.lineWidth = fs(0.006);
    const x = fx(0.27);
    const y = fy(0.44);
    ctx.beginPath();
    ctx.moveTo(x, y - fs(0.035));
    ctx.quadraticCurveTo(x + fs(0.025), y + fs(0.01), x, y + fs(0.02));
    ctx.quadraticCurveTo(x - fs(0.025), y + fs(0.01), x, y - fs(0.035));
    ctx.fill();
    ctx.stroke();
  }
}

// ---------- Emote bubble ----------
function createEmote() {
  const tex = canvasTexture(512, 256, () => {});
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, fog: false, toneMapped: false }));
  sprite.renderOrder = 10;
  sprite.renderOrder = 10;
  sprite.scale.set(1.5, 0.75, 1);
  sprite.visible = false;
  const { ctx } = tex;

  function draw(title, sub, color) {
    ctx.clearRect(0, 0, 512, 256);
    ctx.save();
    // Drop shadow.
    ctx.fillStyle = 'rgba(42, 26, 46, 0.35)';
    ctx.beginPath();
    ctx.roundRect(40, 40, 440, 150, 60);
    ctx.fill();
    // Bubble.
    const g = ctx.createLinearGradient(0, 24, 0, 180);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(1, '#ffeef6');
    ctx.fillStyle = g;
    ctx.strokeStyle = '#2a1a2e';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.roundRect(28, 24, 440, 150, 60);
    ctx.moveTo(110, 170);
    ctx.fill();
    ctx.stroke();
    // Tail pointing down-left toward Sensei.
    ctx.beginPath();
    ctx.moveTo(96, 166);
    ctx.lineTo(62, 236);
    ctx.lineTo(160, 170);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(96, 174);
    ctx.lineTo(62, 236);
    ctx.lineTo(160, 174);
    ctx.stroke();
    ctx.fillRect(98, 160, 58, 14);
    // Accent stripe.
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(52, 44, 16, 110, 8);
    ctx.fill();
    // Text.
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    // maxWidth squeezes long lines (e.g. Japanese) so they stay inside the bubble.
    ctx.font = `800 64px ${EMOTE_FONT}`;
    ctx.lineWidth = 8;
    ctx.strokeStyle = '#2a1a2e';
    ctx.strokeText(title, 90, 88, 360);
    ctx.fillStyle = color;
    ctx.fillText(title, 90, 88, 360);
    ctx.font = `700 32px ${EMOTE_FONT}`;
    ctx.fillStyle = '#5b4660';
    ctx.fillText(sub, 92, 140, 356);
    ctx.restore();
    tex.needsUpdate = true;
  }
  return { sprite, draw };
}

// ---------- Rank crest ----------
function createCrest() {
  const group = new THREE.Group();
  group.visible = false;

  const raysTex = canvasTexture(256, 256, (ctx, s) => {
    ctx.translate(s / 2, s / 2);
    for (let i = 0; i < 16; i++) {
      ctx.rotate(Math.PI / 8);
      const g = ctx.createLinearGradient(0, 0, 0, -s / 2);
      g.addColorStop(0, 'rgba(255,255,255,0.9)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-4, 0);
      ctx.lineTo(-14, -s / 2);
      ctx.lineTo(14, -s / 2);
      ctx.lineTo(4, 0);
      ctx.fill();
    }
  });
  const rays = new THREE.Sprite(new THREE.SpriteMaterial({ map: raysTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  rays.scale.setScalar(2.6);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: getGlowTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  halo.scale.setScalar(2.2);

  const emblemTex = canvasTexture(512, 512, () => {});
  const emblem = new THREE.Sprite(new THREE.SpriteMaterial({ map: emblemTex, transparent: true, depthWrite: false }));
  emblem.scale.setScalar(1.25);
  // Draw the emblem after every additive effect so glows never wash it out.
  for (const s of [halo, rays, emblem]) s.material.fog = false;
  emblem.material.toneMapped = false;
  halo.renderOrder = rays.renderOrder = 8;
  emblem.renderOrder = 9;
  group.add(halo, rays, emblem);

  function draw(score) {
    const rank = rankFor(score);
    const { ctx } = emblemTex;
    ctx.clearRect(0, 0, 512, 512);
    ctx.save();
    ctx.translate(256, 240);
    // Shield / diamond badge.
    const badge = () => {
      ctx.beginPath();
      ctx.moveTo(0, -200);
      ctx.lineTo(170, -110);
      ctx.lineTo(150, 90);
      ctx.lineTo(0, 200);
      ctx.lineTo(-150, 90);
      ctx.lineTo(-170, -110);
      ctx.closePath();
    };
    ctx.fillStyle = '#2a1a2e';
    ctx.save();
    ctx.scale(1.12, 1.1);
    badge();
    ctx.fill();
    ctx.restore();
    const g = ctx.createLinearGradient(0, -200, 0, 200);
    g.addColorStop(0, rank.a);
    g.addColorStop(1, rank.b);
    ctx.fillStyle = g;
    badge();
    ctx.fill();
    ctx.lineWidth = 10;
    ctx.strokeStyle = '#fff8dc';
    ctx.save();
    ctx.scale(0.86, 0.86);
    badge();
    ctx.stroke();
    ctx.restore();
    // Gloss.
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.moveTo(-160, -105);
    ctx.lineTo(0, -192);
    ctx.lineTo(160, -105);
    ctx.lineTo(150, -40);
    ctx.quadraticCurveTo(0, 10, -150, -40);
    ctx.fill();
    // Letter.
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '400 250px Bungee, "Baloo 2", sans-serif';
    ctx.lineWidth = 22;
    ctx.strokeStyle = '#2a1a2e';
    ctx.strokeText(rank.letter, 0, -10);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(rank.letter, 0, -10);
    // Score ribbon.
    ctx.fillStyle = '#2a1a2e';
    ctx.beginPath();
    ctx.roundRect(-120, 120, 240, 76, 38);
    ctx.fill();
    ctx.font = '800 54px "Baloo 2", sans-serif';
    ctx.fillStyle = '#ffd36e';
    ctx.fillText(`${score}`, 0, 160);
    ctx.restore();
    emblemTex.needsUpdate = true;

    const c = new THREE.Color(...rank.ray);
    rays.material.color.copy(c).multiplyScalar(0.45);
    halo.material.color.copy(c).multiplyScalar(0.3);
  }
  return { group, rays, draw };
}

// ---------- Body parts ----------
function createTail(spread) {
  const root = new THREE.Group();
  root.rotation.set(-0.75, 0, spread);
  const segments = [];
  const RADII = [0.13, 0.17, 0.2, 0.2, 0.17, 0.11];
  let parent = root;
  RADII.forEach((r, i) => {
    const seg = new THREE.Group();
    seg.position.y = i === 0 ? 0 : RADII[i - 1] * 1.05;
    const tip = i >= RADII.length - 2;
    const fluff = part(new THREE.SphereGeometry(r, 18, 14), tip ? CREAM : ORANGE, { outline: 0.06 });
    fluff.scale.set(1, 1.45, 1);
    fluff.position.y = r * 0.9;
    seg.add(fluff);
    parent.add(seg);
    segments.push(seg);
    parent = seg;
  });
  return { root, segments };
}

function faceDecal(skull) {
  // Project onto a stand-in skull in head space so the decal can live inside the head group.
  const proxy = new THREE.Mesh(skull.geometry);
  proxy.position.copy(skull.position);
  proxy.scale.copy(skull.scale);
  proxy.updateMatrixWorld(true);
  const geometry = new DecalGeometry(proxy, new THREE.Vector3(0, 0.45, 0.6), new THREE.Euler(0, 0, 0), new THREE.Vector3(1.0, 0.8, 1.2));
  const texture = canvasTexture(FACE_W, FACE_H, () => {});
  const material = toon(0xffffff, {
    rim: 0,
    map: texture,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    emissive: 0xffffff,
    emissiveMap: texture,
    emissiveIntensity: 0.22,
  });
  return { mesh: new THREE.Mesh(geometry, material), texture };
}

export function createMascot() {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);

  const torso = part(new THREE.SphereGeometry(0.44, 32, 24), ORANGE);
  torso.scale.set(1, 1.08, 0.92);
  torso.position.y = 0.46;
  const belly = part(new THREE.SphereGeometry(0.32, 24, 16), CREAM, { outline: 0 });
  belly.scale.set(0.95, 1.15, 0.65);
  belly.position.set(0, 0.44, 0.22);

  // Shrine-style scarf with a gold bell and a fluttering tail end.
  const scarf = part(new THREE.TorusGeometry(0.32, 0.085, 12, 32), RED, { outline: 0.06 });
  scarf.rotation.x = Math.PI / 2;
  scarf.position.y = 0.82;
  const scarfEnd = new THREE.Group();
  scarfEnd.position.set(0.24, 0.8, -0.18);
  const scarfTail = part(new THREE.BoxGeometry(0.14, 0.42, 0.04), RED, { outline: 0.08 });
  scarfTail.geometry.translate(0, -0.21, 0);
  scarfEnd.add(scarfTail);
  const bell = part(new THREE.SphereGeometry(0.085, 16, 12), GOLD, { outline: 0.06, emissive: 0x6a4200 });
  bell.position.set(0, 0.73, 0.38);
  body.add(torso, belly, scarf, scarfEnd, bell);

  for (const x of [-0.22, 0.22]) {
    const foot = part(new THREE.SphereGeometry(0.14, 16, 12), ORANGE);
    foot.scale.set(1, 0.65, 1.35);
    foot.position.set(x, 0.07, 0.12);
    const toe = part(new THREE.SphereGeometry(0.08, 12, 8), CREAM, { outline: 0 });
    toe.scale.set(0.9, 0.5, 0.9);
    toe.position.set(x, 0.06, 0.24);
    body.add(foot, toe);
  }

  function arm(side) {
    const g = new THREE.Group();
    g.position.set(0.38 * side, 0.64, 0.06);
    const paw = part(new THREE.SphereGeometry(0.11, 16, 12), ORANGE);
    paw.scale.set(0.85, 1.5, 0.85);
    paw.position.set(0.06 * side, -0.12, 0.08);
    const pawTip = part(new THREE.SphereGeometry(0.075, 12, 10), CREAM, { outline: 0.04 });
    pawTip.position.set(0.07 * side, -0.26, 0.1);
    g.add(paw, pawTip);
    body.add(g);
    return g;
  }
  const leftArm = arm(-1);
  const rightArm = arm(1);

  const brush = new THREE.Group();
  brush.position.set(0.12, -0.2, 0.18);
  brush.rotation.set(0.4, 0.2, -0.6);
  const handle = part(new THREE.CylinderGeometry(0.02, 0.02, 0.55, 10), WOOD_DARK, { outline: 0.04 });
  const ferrule = part(new THREE.CylinderGeometry(0.028, 0.028, 0.06, 10), GOLD, { outline: 0.04 });
  ferrule.position.y = 0.26;
  const tip = part(new THREE.ConeGeometry(0.045, 0.14, 12), DARK, { outline: 0.03 });
  tip.position.y = 0.34;
  const ink = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 2.4, 3) }));
  ink.position.y = 0.42;
  brush.add(handle, ferrule, tip, ink);
  rightArm.add(brush);

  // Three fluffy tails fanned out behind.
  const tails = [-0.62, 0, 0.62].map((spread, i) => {
    const t = createTail(spread);
    t.root.position.set(spread * 0.12, 0.28, -0.32);
    t.phase = i * 1.3;
    body.add(t.root);
    return t;
  });

  // Head.
  const head = new THREE.Group();
  head.position.y = 0.88;
  body.add(head);
  const skull = part(new THREE.SphereGeometry(0.56, 40, 30), ORANGE);
  skull.scale.set(1.15, 0.96, 1.05);
  skull.position.y = 0.46;
  head.add(skull);

  const face = faceDecal(skull);
  head.add(face.mesh);
  const nose = part(new THREE.SphereGeometry(0.042, 12, 8), DARK, { outline: 0 });
  nose.scale.set(1.35, 0.85, 1);
  nose.position.set(0, 0.365, 0.578);
  const noseShine = new THREE.Mesh(new THREE.SphereGeometry(0.013, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  noseShine.position.set(0.012, 0.38, 0.612);
  head.add(nose, noseShine);

  // Cheek fluff tufts.
  for (const side of [-1, 1]) {
    for (const [y, len, ang] of [[0.36, 0.26, 0.55], [0.22, 0.2, 0.95]]) {
      const tuft = part(new THREE.ConeGeometry(0.1, len, 10), CREAM, { outline: 0.06 });
      tuft.position.set(side * 0.66, y, 0.06);
      tuft.rotation.z = -side * (Math.PI / 2 + ang - 0.5);
      head.add(tuft);
    }
  }

  // Big ears with dark tips and pink inner fur.
  const ears = [];
  for (const side of [-1, 1]) {
    const earGroup = new THREE.Group();
    earGroup.position.set(0.34 * side, 0.88, 0.02);
    const outer = part(new THREE.ConeGeometry(0.23, 0.52, 16), ORANGE);
    outer.position.y = 0.24;
    const inner = part(new THREE.ConeGeometry(0.13, 0.34, 16), 0xffc6d2, { outline: 0 });
    inner.position.set(0, 0.18, 0.1);
    inner.scale.z = 0.5;
    const tipMesh = part(new THREE.ConeGeometry(0.098, 0.2, 16), 0x3d2433, { outline: 0 });
    tipMesh.position.y = 0.415;
    earGroup.add(outer, inner, tipMesh);
    head.add(earGroup);
    ears.push({ earGroup, side, twitch: 0 });
  }

  // Kitsunebi: three foxfire wisps orbiting Sensei.
  const foxfire = [];
  const fireMat = new THREE.SpriteMaterial({ map: getGlowTexture(), color: new THREE.Color(0.8, 2.2, 3.2), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  for (let i = 0; i < 3; i++) {
    const wisp = new THREE.Group();
    const outer = new THREE.Sprite(fireMat);
    outer.scale.setScalar(0.42);
    const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: getGlowTexture(), color: new THREE.Color(3, 3, 3), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    core.scale.setScalar(0.14);
    wisp.add(outer, core);
    group.add(wisp);
    foxfire.push({ wisp, outer, phase: (i / 3) * Math.PI * 2 });
  }

  // Invisible hitbox for clicks.
  const hitbox = new THREE.Mesh(new THREE.SphereGeometry(0.95, 12, 8), new THREE.MeshBasicMaterial());
  hitbox.position.y = 1.05;
  hitbox.scale.set(1, 1.25, 1);
  hitbox.visible = false;
  group.add(hitbox);

  const emote = createEmote();
  emote.sprite.position.set(1.15, 2.35, 0.2);
  group.add(emote.sprite);

  const crest = createCrest();
  crest.group.position.set(-1.35, 2.15, 0);
  group.add(crest.group);

  // ---------- State ----------
  let lang = DEFAULT_LANG;
  let mood = 'idle';
  let emoteKey = null;
  let emoteAge = 0;
  let emoteTimer = 0;
  let moodAge = 0;
  let crestAge = 0;
  let petBounce = 0;
  let nextTwitch = 2;
  let nextBlink = 2.5;
  let blinkLeft = 0;
  let faceKey = '';
  const pose = { ...POSES.idle };
  const pointerTarget = { x: 0, y: 0 };
  const pointerCurrent = { x: 0, y: 0 };

  function showEmote(key, seconds = 0) {
    if (!EMOTE_COLORS[key]) {
      emoteKey = null;
      emote.sprite.visible = false;
      return;
    }
    emoteKey = key;
    emote.draw(...emoteFor(lang, key));
    emote.sprite.visible = true;
    emoteAge = 0;
    emoteTimer = seconds;
  }

  function setMood(next) {
    if (next === mood) return;
    mood = next;
    moodAge = 0;
    showEmote(next === 'idle' ? null : next, next === 'neutral' ? 4 : 0);
  }

  function setLang(next) {
    lang = isLang(next) ? next : DEFAULT_LANG;
    if (emoteKey && emote.sprite.visible) emote.draw(...emoteFor(lang, emoteKey));
  }

  function showScore(score) {
    crest.draw(score);
    crest.group.visible = true;
    crestAge = 0;
  }

  function hideScore() {
    crest.group.visible = false;
  }

  function pet() {
    petBounce = 1;
    showEmote('pet', 2.8);
  }

  function setPointer(nx, ny) {
    pointerTarget.x = THREE.MathUtils.clamp(nx, -1, 1);
    pointerTarget.y = THREE.MathUtils.clamp(ny, -1, 1);
  }

  function update(t, dt) {
    moodAge += dt;
    crestAge += dt;
    emoteAge += dt;
    if (petBounce > 0) petBounce = Math.max(0, petBounce - dt * 2.2);
    if (emoteTimer > 0) {
      emoteTimer -= dt;
      if (emoteTimer <= 0) showEmote(mood === 'idle' || mood === 'neutral' ? null : mood);
    }

    const follow = 1 - Math.exp(-dt * 6);
    pointerCurrent.x += (pointerTarget.x - pointerCurrent.x) * follow;
    pointerCurrent.y += (pointerTarget.y - pointerCurrent.y) * follow;

    const blend = 1 - Math.exp(-dt / 0.12);
    const target = POSES[mood] ?? POSES.idle;
    for (const k of Object.keys(pose)) pose[k] += (target[k] - pose[k]) * blend;

    const sad = mood === 'sad';
    const happy = mood === 'happy';
    const thinking = mood === 'thinking';
    const speed = sad ? 1.4 : happy ? 3.4 : 2.2;

    // Body: breathe, hop, squash & stretch.
    const breathe = Math.sin(t * speed) * (sad ? 0.012 : 0.026);
    const petHop = Math.sin(petBounce * Math.PI) * 0.4;
    const happyHop = happy && moodAge < 3.5 ? Math.abs(Math.sin(moodAge * 6)) * 0.32 : 0;
    const hop = happyHop + petHop;
    body.position.y = breathe + hop;
    const squash = hop > 0.01 ? 1 + hop * 0.25 : 1 + Math.sin(t * speed * 2) * 0.015;
    body.scale.set(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash));

    const nod = mood === 'neutral' ? Math.sin(moodAge * 6) * 0.15 * Math.max(0, 1 - moodAge / 2) : 0;
    head.rotation.z = pose.tilt + (thinking ? Math.sin(t * 1.5) * 0.06 : 0);
    head.rotation.x = pose.pitch + nod - pointerCurrent.y * 0.22;
    head.rotation.y = pose.yaw + pointerCurrent.x * 0.45;

    bell.rotation.z = Math.sin(t * speed * 1.5) * 0.3;
    scarfEnd.rotation.x = 0.5 + Math.sin(t * 3.1) * 0.15;
    scarfEnd.rotation.z = Math.sin(t * 2.3) * 0.2;

    nextTwitch -= dt;
    if (nextTwitch <= 0) {
      ears[Math.random() < 0.5 ? 0 : 1].twitch = 0.5;
      nextTwitch = 1.5 + Math.random() * 3.5;
    }
    for (const ear of ears) {
      if (ear.twitch > 0) ear.twitch = Math.max(0, ear.twitch - dt * 4);
      ear.earGroup.rotation.z = -ear.side * (0.3 + pose.ear) + Math.sin(ear.twitch * Math.PI * 4) * 0.2;
    }

    // Tails: wave down the chain like a whip.
    const tailSpeed = happy ? 8 : sad ? 1.4 : thinking ? 4.5 : 2.6;
    const tailAmp = happy ? 0.3 : sad ? 0.06 : 0.17;
    for (const tail of tails) {
      tail.root.rotation.x = -0.75 + (sad ? 0.45 : 0) + Math.sin(t * tailSpeed * 0.5 + tail.phase) * 0.06;
      tail.segments.forEach((seg, i) => {
        seg.rotation.z = Math.sin(t * tailSpeed - i * 0.55 + tail.phase) * tailAmp * (0.4 + i * 0.25);
        seg.rotation.x = Math.cos(t * tailSpeed * 0.7 - i * 0.5 + tail.phase) * tailAmp * 0.5 - 0.06 * i;
      });
    }

    // Positive pose values raise each arm outward.
    leftArm.rotation.z = -pose.armL - Math.sin(t * speed) * 0.08 - (happy ? Math.sin(t * 9) * 0.25 : 0);
    rightArm.rotation.z = pose.armR + Math.sin(t * speed) * 0.08 + (happy ? Math.sin(t * 9 + 1) * 0.25 : 0);
    brush.rotation.x = thinking ? 0.8 + Math.sin(t * 4) * 0.25 : 0.4;

    // Face: blink on a random timer, pupils follow the pointer.
    nextBlink -= dt;
    if (nextBlink <= 0) {
      blinkLeft = 0.13;
      nextBlink = 2 + Math.random() * 3.5;
    }
    blinkLeft = Math.max(0, blinkLeft - dt);
    const expr = petBounce > 0.05 ? 'pet' : blinkLeft > 0 && mood !== 'happy' ? 'blink' : mood === 'idle' ? 'neutral' : mood;
    const gx = thinking ? 0.7 : Math.round(pointerCurrent.x * 4) / 4;
    const gy = thinking ? 0.8 : Math.round(pointerCurrent.y * 4) / 4;
    const key = `${expr}|${gx}|${gy}`;
    if (key !== faceKey) {
      faceKey = key;
      drawFace(face.texture.ctx, expr, gx, gy);
      face.texture.needsUpdate = true;
    }

    // Foxfire orbit; flares bright when thinking.
    const orbitSpeed = thinking ? 2.6 : happy ? 1.8 : 0.8;
    const glow = thinking ? 1.6 : sad ? 0.6 : 1;
    foxfire.forEach(({ wisp, outer, phase }, i) => {
      const a = t * orbitSpeed + phase;
      wisp.position.set(Math.cos(a) * 1.05, 1.15 + Math.sin(t * 2 + i * 2) * 0.22, Math.sin(a) * 0.75);
      outer.scale.setScalar((0.36 + Math.sin(t * 9 + i) * 0.05) * glow);
    });

    // Emote: pop in, then bob.
    if (emote.sprite.visible) {
      const pop = Math.min(1, emoteAge * 5);
      const s = pop < 1 ? 1 + Math.sin(pop * Math.PI) * 0.25 : 1;
      emote.sprite.scale.set(1.5 * s * pop, 0.75 * s * pop, 1);
      emote.sprite.position.y = 2.35 + Math.sin(t * 3.2) * 0.05;
    }

    // Crest: elastic pop-in, spinning rays, gentle float.
    if (crest.group.visible) {
      const k = Math.min(1, crestAge * 1.8);
      const elastic = k >= 1 ? 1 : 1 - Math.pow(2, -10 * k) * Math.cos(k * Math.PI * 4.5);
      crest.group.scale.setScalar(elastic);
      crest.group.position.y = 2.15 + Math.sin(t * 1.8) * 0.06;
      crest.rays.material.rotation = t * 0.5;
    }
  }

  return { group, hitbox, update, setMood, setLang, showScore, hideScore, pet, setPointer };
}
