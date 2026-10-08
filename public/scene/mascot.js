import * as THREE from 'three';
import { part } from './toon.js';

const ORANGE = 0xf28c38;
const CREAM = 0xfff3e0;
const DARK = 0x2b1d1a;
const PINK = 0xff8fa3;
const RED = 0xd7263d;

// Per-mood pose targets: head tilt (z), head pitch (x), ear droop.
const POSES = {
  idle: { tilt: 0, pitch: 0, ear: 0 },
  thinking: { tilt: 0.12, pitch: -0.12, ear: 0 },
  confused: { tilt: 0.38, pitch: 0, ear: 0.25 },
  happy: { tilt: 0, pitch: -0.08, ear: -0.15 },
  neutral: { tilt: 0, pitch: 0, ear: 0 },
  sad: { tilt: -0.06, pitch: 0.22, ear: 0.95 },
};

function bubbleSprite(text) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#2b1d1a';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(64, 64, 52, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#2b1d1a';
  ctx.font = '800 64px "M PLUS Rounded 1c", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 64, 68);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false }));
  sprite.scale.setScalar(0.5);
  sprite.visible = false;
  return sprite;
}

export function createMascot() {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);

  const torso = part(new THREE.SphereGeometry(0.42, 32, 24), ORANGE);
  torso.scale.set(1, 1.05, 0.9);
  torso.position.y = 0.45;
  const belly = part(new THREE.SphereGeometry(0.3, 24, 16), CREAM, { outline: 0 });
  belly.scale.set(1, 1.1, 0.6);
  belly.position.set(0, 0.42, 0.22);
  const scarf = part(new THREE.TorusGeometry(0.3, 0.07, 12, 32), RED, { outline: 0.08 });
  scarf.rotation.x = Math.PI / 2;
  scarf.position.y = 0.8;
  body.add(torso, belly, scarf);
  for (const x of [-0.2, 0.2]) {
    const foot = part(new THREE.SphereGeometry(0.13, 16, 12), ORANGE);
    foot.scale.set(1, 0.6, 1.3);
    foot.position.set(x, 0.07, 0.12);
    body.add(foot);
  }

  const tail = new THREE.Group();
  tail.position.set(0, 0.3, -0.32);
  const tailMain = part(new THREE.SphereGeometry(0.3, 24, 16), ORANGE);
  tailMain.scale.set(0.8, 1.4, 0.8);
  tailMain.position.set(0.25, 0.35, -0.15);
  tailMain.rotation.z = -0.6;
  const tailTip = part(new THREE.SphereGeometry(0.2, 20, 14), CREAM);
  tailTip.position.set(0.5, 0.72, -0.2);
  tail.add(tailMain, tailTip);
  body.add(tail);

  // Head pivots at the neck so tilts and nods look natural.
  const head = new THREE.Group();
  head.position.y = 0.85;
  body.add(head);
  const skull = part(new THREE.SphereGeometry(0.55, 32, 24), ORANGE);
  skull.scale.set(1.1, 0.95, 1);
  skull.position.y = 0.45;
  const muzzle = part(new THREE.SphereGeometry(0.28, 24, 16), CREAM, { outline: 0.03 });
  muzzle.scale.set(1.2, 0.75, 0.8);
  muzzle.position.set(0, 0.3, 0.42);
  const nose = part(new THREE.SphereGeometry(0.06, 12, 8), DARK, { outline: 0 });
  nose.position.set(0, 0.38, 0.64);
  head.add(skull, muzzle, nose);

  const eyes = [];
  for (const x of [-0.22, 0.22]) {
    const eye = part(new THREE.SphereGeometry(0.085, 16, 12), DARK, { outline: 0 });
    eye.scale.set(1, 1.35, 0.6);
    eye.position.set(x, 0.53, 0.5);
    const shine = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    shine.position.set(0.03, 0.035, 0.07);
    eye.add(shine);
    head.add(eye);
    eyes.push(eye);
  }
  for (const x of [-0.36, 0.36]) {
    const blush = new THREE.Mesh(new THREE.CircleGeometry(0.07, 20), new THREE.MeshBasicMaterial({ color: PINK, transparent: true, opacity: 0.75 }));
    blush.position.set(x, 0.36, 0.45);
    blush.lookAt(x * 2.2, 0.36, 2);
    head.add(blush);
  }

  const ears = [];
  for (const side of [-1, 1]) {
    const ear = new THREE.Group();
    ear.position.set(0.32 * side, 0.85, 0);
    const outer = part(new THREE.ConeGeometry(0.2, 0.45, 16), ORANGE);
    outer.position.y = 0.2;
    const inner = part(new THREE.ConeGeometry(0.11, 0.28, 16), CREAM, { outline: 0 });
    inner.position.set(0, 0.16, 0.08);
    ear.add(outer, inner);
    head.add(ear);
    ears.push({ ear, side });
  }

  const thinkingBubble = bubbleSprite('…');
  thinkingBubble.position.set(0.75, 2.45, 0);
  const questionBubble = bubbleSprite('?');
  questionBubble.position.set(0.75, 2.45, 0);
  group.add(thinkingBubble, questionBubble);

  // Wooden score sign held in front of the body.
  const sign = new THREE.Group();
  sign.position.set(0, 0.55, 0.58);
  sign.visible = false;
  const board = part(new THREE.BoxGeometry(0.9, 0.6, 0.05), 0xe8c48a, { outline: 0.04 });
  const signCanvas = document.createElement('canvas');
  signCanvas.width = 256;
  signCanvas.height = 170;
  const signTexture = new THREE.CanvasTexture(signCanvas);
  signTexture.colorSpace = THREE.SRGBColorSpace;
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.84, 0.54), new THREE.MeshBasicMaterial({ map: signTexture }));
  face.position.z = 0.03;
  const stick = part(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 8), 0x8b5a2b);
  stick.position.y = -0.5;
  sign.add(board, face, stick);
  for (const x of [-0.44, 0.44]) {
    const paw = part(new THREE.SphereGeometry(0.1, 14, 10), ORANGE);
    paw.position.set(x, -0.05, 0.04);
    sign.add(paw);
  }
  body.add(sign);

  function drawScore(score) {
    const ctx = signCanvas.getContext('2d');
    ctx.fillStyle = '#fdf6e3';
    ctx.fillRect(0, 0, 256, 170);
    ctx.strokeStyle = '#d7263d';
    ctx.lineWidth = 10;
    ctx.strokeRect(8, 8, 240, 154);
    ctx.fillStyle = '#2b1d1a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '800 88px "M PLUS Rounded 1c", sans-serif';
    ctx.fillText(String(score), 128, 72);
    ctx.font = '800 26px Nunito, sans-serif';
    ctx.fillText('/ 100', 128, 136);
    signTexture.needsUpdate = true;
  }

  let mood = 'idle';
  let moodAge = 0;
  let signAge = 0;
  const pose = { ...POSES.idle };

  function update(t, dt) {
    moodAge += dt;
    signAge += dt;
    const blend = 1 - Math.exp(-dt / 0.1); // ~0.3 s to settle
    const target = POSES[mood];
    for (const key of Object.keys(pose)) pose[key] += (target[key] - pose[key]) * blend;

    const sad = mood === 'sad';
    const speed = sad ? 1.2 : 2.2;
    body.position.y = Math.sin(t * speed) * (sad ? 0.015 : 0.03);
    body.scale.y = 1 + Math.sin(t * speed * 2) * 0.012;

    const nod = mood === 'neutral' ? Math.sin(moodAge * 7) * 0.18 * Math.max(0, 1 - moodAge / 1.8) : 0;
    head.rotation.z = pose.tilt;
    head.rotation.x = pose.pitch + nod;
    for (const { ear, side } of ears) ear.rotation.z = -side * (0.35 + pose.ear);

    group.position.y = mood === 'happy' && moodAge < 2.4 ? Math.abs(Math.sin(moodAge * 5)) * 0.3 : 0;

    tail.rotation.z = Math.sin(t * (mood === 'happy' ? 9 : 3)) * (sad ? 0.08 : 0.25);
    tail.rotation.y = mood === 'thinking' ? Math.sin(t * 6) * 0.6 : 0;

    const blinking = t % 3.7 < 0.12;
    const open = blinking ? 0.1 : mood === 'happy' ? 0.45 : 1;
    for (const eye of eyes) eye.scale.y = 1.35 * open;

    thinkingBubble.visible = mood === 'thinking';
    questionBubble.visible = mood === 'confused';
    const pulse = 0.5 + Math.sin(t * 5) * 0.03;
    thinkingBubble.scale.setScalar(pulse);
    questionBubble.scale.setScalar(pulse);
    questionBubble.position.y = 2.45 + Math.sin(t * 3) * 0.05;

    if (sign.visible) {
      const s = Math.min(1, signAge * 4);
      sign.scale.setScalar(1 - (1 - s) ** 3);
    }
  }

  function setMood(next) {
    if (!(next in POSES) || next === mood) return;
    mood = next;
    moodAge = 0;
  }

  function showScore(score) {
    drawScore(score);
    sign.visible = true;
    signAge = 0;
  }

  function hideScore() {
    sign.visible = false;
  }

  return { group, update, setMood, showScore, hideScore };
}
