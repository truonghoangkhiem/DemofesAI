// Sensei: a chibi Doraemon with painted eyes and face, a 4D pocket, emote bubbles and a rank crest.
import * as THREE from 'three';
import { part, toon, canvasTexture, getGlowTexture } from './toon.js';
import { t, isLang, DEFAULT_LANG } from '../i18n.js';

const BLUE = 0x1ea0e8;
const WHITE = 0xffffff;
const RED = 0xe8282f;
const GOLD = 0xffc61a;
const DARK = 0x2a1a2e;
const BLUE_CSS = '#1ea0e8';
const INK = '#1c1420';
// Rounded Japanese font after the Latin ones so kana and kanji do not fall back to a system font.
const EMOTE_FONT = '"Baloo 2", "Be Vietnam Pro", "M PLUS Rounded 1c", sans-serif';

// armL / armR raise each arm sideways; fwdL / fwdR swing it forward.
const POSES = {
  idle: { tilt: 0, pitch: 0, yaw: 0, armL: 0, armR: 0, fwdL: 0, fwdR: 0 },
  thinking: { tilt: 0.12, pitch: -0.14, yaw: 0.1, armL: 0.1, armR: -0.75, fwdL: 0, fwdR: 2.05 },
  confused: { tilt: 0.24, pitch: 0.04, yaw: -0.1, armL: 0.5, armR: 0.5, fwdL: 0.35, fwdR: 0.35 },
  happy: { tilt: 0, pitch: -0.12, yaw: 0, armL: 1.85, armR: 1.85, fwdL: 0.45, fwdR: 0.45 },
  neutral: { tilt: 0, pitch: 0, yaw: 0, armL: 0.15, armR: 0.15, fwdL: 0, fwdR: 0 },
  sad: { tilt: -0.06, pitch: 0.2, yaw: 0, armL: -0.3, armR: -0.3, fwdL: 0.25, fwdR: 0.25 },
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

// ---------- Geometry helpers ----------
// Head-space (relative to the skull centre) measurements.
const SKULL = new THREE.Vector3(0.636, 0.576, 0.6);
const FACE_C = new THREE.Vector3(0, -0.03, 0.09);
const FACE_R = new THREE.Vector3(0.6, 0.54, 0.53);
const EYE_R = new THREE.Vector3(0.132, 0.182, 0.075);
const EYE_X = 0.124;
const EYE_Y = 0.29;

// Flat front projection UVs, so a canvas painted "as seen from the front" lands where expected.
function planarUV(geometry, minX, maxX, minY, maxY, u0 = 0, u1 = 1) {
  const pos = geometry.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = u0 + ((pos.getX(i) - minX) / (maxX - minX)) * (u1 - u0);
    uv[i * 2 + 1] = (pos.getY(i) - minY) / (maxY - minY);
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geometry;
}

function ellipsoid(r, ws = 32, hs = 24) {
  return new THREE.SphereGeometry(1, ws, hs).scale(r.x, r.y, r.z);
}

// Point on the skull surface (or the white face bulge, whichever is further out) plus its normal.
function onHead(x, y) {
  const z1 = SKULL.z * Math.sqrt(Math.max(0, 1 - (x / SKULL.x) ** 2 - (y / SKULL.y) ** 2));
  const dy = (y - FACE_C.y) / FACE_R.y;
  const z2 = FACE_C.z + FACE_R.z * Math.sqrt(Math.max(0, 1 - (x / FACE_R.x) ** 2 - dy ** 2));
  const p = new THREE.Vector3(x, y, Math.max(z1, z2));
  const n = z1 >= z2
    ? new THREE.Vector3(x / SKULL.x ** 2, y / SKULL.y ** 2, p.z / SKULL.z ** 2).normalize()
    : new THREE.Vector3(x / FACE_R.x ** 2, (y - FACE_C.y) / FACE_R.y ** 2, (p.z - FACE_C.z) / FACE_R.z ** 2).normalize();
  return { p, n };
}

function softMaterial(texture, extra = {}) {
  return toon(0xffffff, { map: texture, emissive: 0xffffff, emissiveMap: texture, emissiveIntensity: 0.22, ...extra });
}

// ---------- Painted eyes ----------
// One canvas for both eyes: the left eye uses the left half, the right eye the right half.
const EYE_W = 512;
const EYE_H = 360;

function drawEye(ctx, side, expr, gx, gy) {
  const ox = side < 0 ? 0 : EYE_W / 2;
  const ex = xn => ox + (xn * 0.5 + 0.5) * (EYE_W / 2);
  const ey = yn => (0.5 - yn * 0.5) * EYE_H;
  const rx = EYE_W / 4;
  const ry = EYE_H / 2;
  const cx = ex(0);
  const cy = ey(0);
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(ox, 0, EYE_W / 2, EYE_H);
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx * 0.93, ry * 0.93, 0, 0, Math.PI * 2);
  ctx.clip();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = INK;
  ctx.fillStyle = INK;

  if (expr === 'happy' || expr === 'pet') {
    // Smiling closed eyes: "∩".
    ctx.lineWidth = rx * 0.16;
    ctx.beginPath();
    ctx.ellipse(ex(0), ey(-0.28), rx * 0.42, ry * 0.42, 0, Math.PI * 1.05, Math.PI * 1.95);
    ctx.stroke();
  } else if (expr === 'blink') {
    // Relaxed closed eyes: "‿".
    ctx.lineWidth = rx * 0.14;
    ctx.beginPath();
    ctx.ellipse(ex(0), ey(0.12), rx * 0.48, ry * 0.3, 0, Math.PI * 0.15, Math.PI * 0.85);
    ctx.stroke();
  } else {
    const small = expr === 'confused';
    const sad = expr === 'sad';
    let px = small ? -side * 0.08 : sad ? -side * 0.18 : -side * 0.3 + gx * 0.36;
    let py = small ? 0.02 : sad ? -0.32 : -0.08 + gy * 0.38;
    const len = Math.hypot(px, py);
    if (len > 0.58) { px *= 0.58 / len; py *= 0.58 / len; }
    const pr = small ? 0.13 : 0.24;
    ctx.beginPath();
    ctx.ellipse(ex(px), ey(py), pr * rx, pr * 1.05 * ry * 0.72, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(ex(px + pr * 0.35), ey(py + pr * 0.4), pr * rx * 0.32, 0, Math.PI * 2);
    ctx.fill();
    if (sad) {
      // Heavy drooping lid: higher at the inner corner, lower at the outer corner.
      ctx.fillStyle = BLUE_CSS;
      ctx.beginPath();
      ctx.moveTo(ex(-side * 1.1), ey(0.42));
      ctx.lineTo(ex(side * 1.1), ey(0.02));
      ctx.lineTo(ex(side * 1.1), ey(1.2));
      ctx.lineTo(ex(-side * 1.1), ey(1.2));
      ctx.closePath();
      ctx.fill();
      ctx.lineWidth = rx * 0.12;
      ctx.beginPath();
      ctx.moveTo(ex(-side * 1.1), ey(0.42));
      ctx.lineTo(ex(side * 1.1), ey(0.02));
      ctx.stroke();
    }
  }
  ctx.restore();
  // Black rim around the white of the eye.
  ctx.save();
  ctx.strokeStyle = INK;
  ctx.lineWidth = rx * 0.13;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx * 0.9, ry * 0.9, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawEyes(ctx, expr, gx, gy) {
  ctx.clearRect(0, 0, EYE_W, EYE_H);
  drawEye(ctx, -1, expr, gx, gy);
  drawEye(ctx, 1, expr, gx, gy);
}

// ---------- Painted face: nose line, mouth and whiskers ----------
const FACE_W = 1024;
const FACE_H = Math.round(FACE_W * FACE_R.y / FACE_R.x);
const fx = x => (x / FACE_R.x * 0.5 + 0.5) * FACE_W;
const fy = y => (0.5 - (y - FACE_C.y) / FACE_R.y * 0.5) * FACE_H;
const fs = s => s / (2 * FACE_R.x) * FACE_W;

function drawFace(ctx, expr) {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, FACE_W, FACE_H);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = INK;
  ctx.lineWidth = fs(0.016);

  // Whiskers: three per side, fanning out.
  for (const side of [-1, 1]) {
    for (const [y0, y1] of [[0.04, 0.12], [-0.03, -0.03], [-0.1, -0.18]]) {
      ctx.beginPath();
      ctx.moveTo(fx(side * 0.15), fy(y0));
      ctx.lineTo(fx(side * 0.47), fy(y1));
      ctx.stroke();
    }
  }

  const line = bottom => {
    ctx.beginPath();
    ctx.moveTo(fx(0), fy(0.06));
    ctx.lineTo(fx(0), fy(bottom));
    ctx.stroke();
  };

  if (expr === 'happy' || expr === 'pet') {
    // Big open grin with a red tongue.
    const mouth = () => {
      ctx.beginPath();
      ctx.moveTo(fx(-0.31), fy(-0.08));
      ctx.quadraticCurveTo(fx(0), fy(-0.12), fx(0.31), fy(-0.08));
      ctx.bezierCurveTo(fx(0.29), fy(-0.52), fx(-0.29), fy(-0.52), fx(-0.31), fy(-0.08));
      ctx.closePath();
    };
    ctx.fillStyle = '#b3172b';
    mouth();
    ctx.fill();
    ctx.save();
    mouth();
    ctx.clip();
    ctx.fillStyle = '#ff6f61';
    ctx.beginPath();
    ctx.ellipse(fx(0), fy(-0.42), fs(0.17), fs(0.1), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    mouth();
    ctx.stroke();
    line(-0.1);
  } else if (expr === 'thinking') {
    line(-0.24);
    ctx.beginPath();
    ctx.moveTo(fx(-0.12), fy(-0.22));
    ctx.quadraticCurveTo(fx(0), fy(-0.27), fx(0.12), fy(-0.22));
    ctx.stroke();
  } else if (expr === 'confused') {
    line(-0.2);
    ctx.beginPath();
    for (let i = 0; i <= 24; i++) {
      const x = -0.2 + (i / 24) * 0.4;
      const y = -0.25 + Math.sin(i / 24 * Math.PI * 4) * 0.025;
      if (i === 0) ctx.moveTo(fx(x), fy(y));
      else ctx.lineTo(fx(x), fy(y));
    }
    ctx.stroke();
  } else if (expr === 'sad') {
    line(-0.22);
    ctx.beginPath();
    ctx.moveTo(fx(-0.25), fy(-0.34));
    ctx.quadraticCurveTo(fx(0), fy(-0.1), fx(0.25), fy(-0.34));
    ctx.stroke();
    // A tear under the outer corner of the right eye.
    ctx.fillStyle = '#8fd8ff';
    ctx.lineWidth = fs(0.008);
    const x = fx(0.25);
    const y = fy(0.09);
    ctx.beginPath();
    ctx.moveTo(x, y - fs(0.045));
    ctx.quadraticCurveTo(x + fs(0.035), y + fs(0.015), x, y + fs(0.028));
    ctx.quadraticCurveTo(x - fs(0.035), y + fs(0.015), x, y - fs(0.045));
    ctx.fill();
    ctx.stroke();
  } else {
    // The classic wide smile; the nose line meets its lowest point.
    line(-0.31);
    ctx.beginPath();
    ctx.moveTo(fx(-0.33), fy(-0.07));
    ctx.quadraticCurveTo(fx(0), fy(-0.55), fx(0.33), fy(-0.07));
    ctx.stroke();
  }
  ctx.restore();
}

// ---------- 4D pocket on the belly ----------
const BELLY_R = new THREE.Vector3(0.4, 0.38, 0.25);
function drawBelly(ctx, w, h) {
  const bx = x => (x / BELLY_R.x * 0.5 + 0.5) * w;
  const by = y => (0.5 - y / BELLY_R.y * 0.5) * h;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = INK;
  ctx.lineWidth = w * 0.03;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(bx(-0.2), by(-0.02));
  ctx.lineTo(bx(0.2), by(-0.02));
  ctx.ellipse(bx(0), by(-0.02), bx(0.2) - bx(0), by(-0.2) - by(0), 0, 0, Math.PI);
  ctx.stroke();
}

// ---------- Emote bubble ----------
function createEmote() {
  const tex = canvasTexture(512, 256, () => {});
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, fog: false, toneMapped: false }));
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
function createBell() {
  const bell = new THREE.Group();
  const ball = part(new THREE.SphereGeometry(0.09, 20, 14), GOLD, { outline: 0.07, emissive: 0x5a3c00 });
  // Raised band around the upper half.
  const band = part(new THREE.TorusGeometry(0.088, 0.011, 8, 32), 0xe9a800, { outline: 0 });
  band.rotation.x = Math.PI / 2;
  band.position.y = 0.022;
  // Round hole with a slit running down from it.
  const dir = new THREE.Vector3(0, -0.42, 0.91).normalize();
  const hole = new THREE.Mesh(new THREE.SphereGeometry(0.019, 10, 8), toon(DARK, { rim: 0 }));
  hole.position.copy(dir).multiplyScalar(0.085);
  hole.scale.set(1, 1, 0.5);
  hole.lookAt(dir.clone().multiplyScalar(2));
  const slit = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.05, 0.02), toon(DARK, { rim: 0 }));
  const slitDir = new THREE.Vector3(0, -0.78, 0.63).normalize();
  slit.position.copy(slitDir).multiplyScalar(0.084);
  slit.rotation.x = Math.atan2(-slitDir.y, slitDir.z); // long side follows the surface downward
  bell.add(ball, band, hole, slit);
  return bell;
}

function createTakecopter() {
  const g = new THREE.Group();
  const base = part(new THREE.SphereGeometry(0.06, 14, 10), GOLD, { outline: 0.08 });
  base.scale.set(1, 0.45, 1);
  const stick = part(new THREE.CylinderGeometry(0.017, 0.017, 0.13, 8), GOLD, { outline: 0.1 });
  stick.position.y = 0.07;
  const rotor = new THREE.Group();
  rotor.position.y = 0.14;
  const blade = part(new THREE.BoxGeometry(0.56, 0.018, 0.075), 0xffd84a, { outline: 0.05 });
  const hub = part(new THREE.SphereGeometry(0.028, 10, 8), 0xffb21e, { outline: 0.1 });
  rotor.add(blade, hub);
  g.add(base, stick, rotor);
  g.visible = false;
  return { group: g, rotor };
}

function createSweat() {
  const g = new THREE.Group();
  const drop = part(new THREE.SphereGeometry(0.06, 16, 12), 0x9fe2ff, { outline: 0.08, emissive: 0x1a4a66 });
  const tip = part(new THREE.ConeGeometry(0.052, 0.09, 16), 0x9fe2ff, { outline: 0.08, emissive: 0x1a4a66 });
  tip.position.y = 0.065;
  const shine = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  shine.position.set(-0.02, 0.01, 0.05);
  g.add(drop, tip, shine);
  g.visible = false;
  return g;
}

export function createMascot() {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);

  // Body: blue ball, white belly with the 4D pocket painted on.
  const torso = part(new THREE.SphereGeometry(0.45, 36, 26), BLUE);
  torso.scale.set(1.1, 0.97, 0.98); // round, a little wider than tall
  torso.position.y = 0.52;
  const bellyTex = canvasTexture(512, 512, drawBelly);
  const belly = part(planarUV(ellipsoid(BELLY_R), -BELLY_R.x, BELLY_R.x, -BELLY_R.y, BELLY_R.y), WHITE, {
    outline: 0, map: bellyTex, emissive: 0xffffff, emissiveMap: bellyTex, emissiveIntensity: 0.15,
  });
  belly.position.set(0, 0.49, 0.2);
  const POCKET = new THREE.Vector3(0, 0.4, 0.46);
  body.add(torso, belly);

  // Red collar with the golden bell.
  const collar = part(new THREE.TorusGeometry(0.35, 0.065, 14, 56), RED, { outline: 0.05 });
  collar.rotation.x = Math.PI / 2;
  collar.scale.set(1, 0.92, 1);
  // The collar and bell sit on a neck pivot that follows the head tilt, so the band never pokes out.
  const neck = new THREE.Group();
  neck.position.y = 0.83;
  const bell = createBell();
  const bellPivot = new THREE.Group();
  bellPivot.position.set(0, -0.01, 0.35);
  bell.position.set(0, -0.07, 0.07);
  bellPivot.add(bell);
  neck.add(collar, bellPivot);
  body.add(neck);

  // Short legs and flat round white feet.
  for (const x of [-0.21, 0.21]) {
    const leg = part(new THREE.SphereGeometry(0.17, 16, 12), BLUE, { outline: 0.04 });
    leg.position.set(x, 0.17, 0.0);
    const foot = part(new THREE.SphereGeometry(0.18, 20, 14), WHITE, { outline: 0.06 });
    foot.scale.set(1.12, 0.5, 1.3);
    foot.position.set(x * 1.05, 0.075, 0.06);
    body.add(leg, foot);
  }

  // Red ball tail on a thin stem.
  const tail = new THREE.Group();
  tail.position.set(0, 0.3, -0.42);
  const stem = part(new THREE.CylinderGeometry(0.014, 0.014, 0.12, 8), DARK, { outline: 0 });
  stem.rotation.x = Math.PI / 2 + 0.4;
  stem.position.set(0, -0.02, -0.05);
  const tailBall = part(new THREE.SphereGeometry(0.07, 16, 12), RED, { outline: 0.07 });
  tailBall.position.set(0, -0.05, -0.12);
  tail.add(stem, tailBall);
  body.add(tail);

  // Arms: stubby blue arms ending in round white hands (no fingers).
  function arm(side) {
    const g = new THREE.Group();
    g.position.set(0.42 * side, 0.7, 0.02);
    const hang = new THREE.Group();
    hang.rotation.z = side * 0.5;
    const limb = part(new THREE.CapsuleGeometry(0.11, 0.16, 6, 16), BLUE);
    limb.position.y = -0.14;
    const hand = part(new THREE.SphereGeometry(0.13, 18, 14), WHITE);
    hand.position.y = -0.33;
    hang.add(limb, hand);
    g.add(hang);
    body.add(g);
    return g;
  }
  const leftArm = arm(-1);
  const rightArm = arm(1);

  // Head: big blue ball, white face bulge, tall eyes, red nose, painted mouth and whiskers.
  const head = new THREE.Group();
  head.position.y = 0.86;
  body.add(head);
  const skullSpace = new THREE.Group();
  skullSpace.position.y = 0.5;
  head.add(skullSpace);
  const skull = part(ellipsoid(SKULL, 96, 72), BLUE);
  skullSpace.add(skull);

  const faceTex = canvasTexture(FACE_W, FACE_H, () => {});
  const face = part(planarUV(ellipsoid(FACE_R, 96, 72), -FACE_R.x, FACE_R.x, -FACE_R.y, FACE_R.y), WHITE, {
    outline: 0.025, map: faceTex, emissive: 0xffffff, emissiveMap: faceTex, emissiveIntensity: 0.18,
  });
  face.position.copy(FACE_C);
  skullSpace.add(face);

  const eyeTex = canvasTexture(EYE_W, EYE_H, () => {});
  const eyeMat = softMaterial(eyeTex, { emissiveIntensity: 0.3 });
  for (const side of [-1, 1]) {
    const geo = planarUV(ellipsoid(EYE_R, 32, 24), -EYE_R.x, EYE_R.x, -EYE_R.y, EYE_R.y, side < 0 ? 0 : 0.5, side < 0 ? 0.5 : 1);
    const eye = new THREE.Mesh(geo, eyeMat);
    const { p, n } = onHead(side * EYE_X, EYE_Y);
    eye.position.copy(p).addScaledVector(n, 0.012);
    // Lean the eye back with the head curve but keep it upright.
    eye.rotation.set(-Math.asin(n.y) * 0.85, Math.atan2(n.x, n.z) * 0.8, 0);
    eye.castShadow = true;
    skullSpace.add(eye);
  }

  const noseAt = onHead(0, 0.11);
  const nose = part(new THREE.SphereGeometry(0.072, 20, 14), RED, { outline: 0.07, emissive: 0x4a0008 });
  nose.position.copy(noseAt.p).addScaledVector(noseAt.n, 0.04);
  const noseShine = new THREE.Mesh(new THREE.SphereGeometry(0.02, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  noseShine.position.copy(nose.position).add(new THREE.Vector3(-0.024, 0.03, 0.055));
  skullSpace.add(nose, noseShine);

  const copter = createTakecopter();
  copter.group.position.set(0, SKULL.y - 0.015, 0);
  skullSpace.add(copter.group);

  const sweat = createSweat();
  sweat.position.set(0.56, 0.36, 0.28);
  sweat.rotation.z = -0.35;
  skullSpace.add(sweat);

  // Invisible hitbox for clicks.
  const hitbox = new THREE.Mesh(new THREE.SphereGeometry(0.95, 12, 8), new THREE.MeshBasicMaterial());
  hitbox.position.y = 1.05;
  hitbox.scale.set(1.1, 1.25, 1.1);
  hitbox.visible = false;
  group.add(hitbox);

  const emote = createEmote();
  emote.sprite.position.set(1.15, 2.35, 0.2);
  group.add(emote.sprite);

  const crest = createCrest();
  const CREST_POS = new THREE.Vector3(-1.35, 2.15, 0);
  crest.group.position.copy(CREST_POS);
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
  let nextBlink = 2.5;
  let blinkLeft = 0;
  let faceKey = '';
  let eyeKey = '';
  let copterScale = 0;
  let sweatScale = 0;
  let reach = 0;
  const pose = { ...POSES.idle };
  const pointerTarget = { x: 0, y: 0 };
  const pointerCurrent = { x: 0, y: 0 };
  const crestFrom = new THREE.Vector3();

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
    const confused = mood === 'confused';
    const speed = sad ? 1.4 : happy ? 3.4 : 2.2;

    // Body: breathe, hop, squash & stretch.
    const breathe = Math.sin(t * speed) * (sad ? 0.012 : 0.022);
    const petHop = Math.sin(petBounce * Math.PI) * 0.4;
    const happyHop = happy && moodAge < 3.5 ? Math.abs(Math.sin(moodAge * 6)) * 0.32 : 0;
    const hop = happyHop + petHop;
    body.position.y = breathe + hop;
    const squash = hop > 0.01 ? 1 + hop * 0.2 : 1 + Math.sin(t * speed * 2) * 0.012;
    body.scale.set(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash));

    const nod = mood === 'neutral' ? Math.sin(moodAge * 6) * 0.15 * Math.max(0, 1 - moodAge / 2) : 0;
    head.rotation.z = pose.tilt + (thinking ? Math.sin(t * 1.5) * 0.06 : 0);
    head.rotation.x = pose.pitch + nod - pointerCurrent.y * 0.2;
    head.rotation.y = pose.yaw + pointerCurrent.x * 0.42;
    neck.rotation.z = head.rotation.z * 0.85;
    neck.rotation.y = head.rotation.y * 0.3;

    bellPivot.rotation.z = Math.sin(t * speed * 1.5) * 0.25;
    bellPivot.rotation.x = -0.15 + Math.sin(t * speed * 1.1) * 0.08 - hop * 0.6;
    tail.rotation.y = Math.sin(t * (happy ? 9 : sad ? 1.5 : 3)) * (happy ? 0.5 : 0.2);

    // Pulling the score sign out of the 4D pocket: the left hand reaches up with it, then keeps
    // presenting it (a little lower when sad) for as long as the sign is shown.
    const reachTarget = !crest.group.visible ? 0 : crestAge < 2 ? 1 : sad ? 0.55 : 0.9;
    reach += (reachTarget - reach) * (1 - Math.exp(-dt * 8));
    const armL = pose.armL + reach * (1.75 - pose.armL);
    // Positive pose values raise each arm outward.
    leftArm.rotation.z = -armL - Math.sin(t * speed) * 0.08 - (happy ? Math.sin(t * 9) * 0.25 : 0);
    // A pat makes Doraemon wave back with his right hand.
    const wave = Math.sin(petBounce * Math.PI) * (2 + Math.sin(t * 14) * 0.3);
    rightArm.rotation.z = pose.armR + wave + Math.sin(t * speed) * 0.08 + (happy ? Math.sin(t * 9 + 1) * 0.25 : 0);
    leftArm.rotation.x = -(pose.fwdL + reach * (0.6 - pose.fwdL));
    rightArm.rotation.x = -pose.fwdR + (thinking ? Math.sin(t * 4) * 0.06 : 0);

    // Take-copter pops up when happy; sweat drop when confused.
    copterScale += ((happy ? 1 : 0) - copterScale) * (1 - Math.exp(-dt * 6));
    copter.group.visible = copterScale > 0.02;
    copter.group.scale.setScalar(copterScale);
    copter.rotor.rotation.y = t * 22;
    sweatScale += ((confused ? 1 : 0) - sweatScale) * (1 - Math.exp(-dt * 7));
    sweat.visible = sweatScale > 0.02;
    sweat.scale.setScalar(sweatScale);
    sweat.position.y = 0.36 - ((moodAge * 0.25) % 0.12);

    // Face: blink on a random timer, pupils follow the pointer.
    nextBlink -= dt;
    if (nextBlink <= 0) {
      blinkLeft = 0.13;
      nextBlink = 2 + Math.random() * 3.5;
    }
    blinkLeft = Math.max(0, blinkLeft - dt);
    const faceExpr = petBounce > 0.05 ? 'pet' : mood === 'idle' ? 'neutral' : mood;
    const eyeExpr = faceExpr === 'pet' || faceExpr === 'happy' ? faceExpr : blinkLeft > 0 ? 'blink' : faceExpr;
    const gx = thinking ? 0.7 : Math.round(pointerCurrent.x * 4) / 4;
    const gy = thinking ? 0.8 : Math.round(pointerCurrent.y * 4) / 4;
    const ek = `${eyeExpr}|${gx}|${gy}`;
    if (ek !== eyeKey) {
      eyeKey = ek;
      drawEyes(eyeTex.ctx, eyeExpr, gx, gy);
      eyeTex.needsUpdate = true;
    }
    if (faceExpr !== faceKey) {
      faceKey = faceExpr;
      drawFace(faceTex.ctx, faceExpr);
      faceTex.needsUpdate = true;
    }

    // Emote: pop in, then bob.
    if (emote.sprite.visible) {
      const pop = Math.min(1, emoteAge * 5);
      const s = pop < 1 ? 1 + Math.sin(pop * Math.PI) * 0.25 : 1;
      emote.sprite.scale.set(1.5 * s * pop, 0.75 * s * pop, 1);
      emote.sprite.position.y = 2.35 + Math.sin(t * 3.2) * 0.05;
    }

    // Crest: flies up out of the pocket, then an elastic pop, spinning rays and a gentle float.
    if (crest.group.visible) {
      const fly = Math.min(1, crestAge / 1.25);
      // Ease in-out: lingers at the pocket first so the pull reads, then glides up beside him.
      const e = fly < 0.5 ? 4 * fly ** 3 : 1 - (-2 * fly + 2) ** 3 / 2;
      crestFrom.copy(POCKET);
      crestFrom.y += body.position.y;
      crest.group.position.lerpVectors(crestFrom, CREST_POS, e);
      crest.group.position.y += Math.sin(e * Math.PI) * 0.5 + Math.sin(t * 1.8) * 0.06 * e;
      crest.group.position.z += Math.sin(e * Math.PI) * 0.7; // arc in front of the head, never behind it
      const k = Math.min(1, Math.max(0, crestAge - 1.0) * 1.8);
      const elastic = k >= 1 ? 1 : 1 - Math.pow(2, -10 * k) * Math.cos(k * Math.PI * 4.5);
      crest.group.scale.setScalar(0.12 + (0.5 * e) + 0.38 * elastic);
      crest.rays.material.rotation = t * 0.5;
    }
  }

  return { group, hitbox, update, setMood, setLang, showScore, hideScore, pet, setPointer };
}
