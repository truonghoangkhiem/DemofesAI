import * as THREE from 'three';
import { part } from './toon.js';

const ORANGE = 0xf58c38;
const ORANGE_DARK = 0xd96f1d;
const CREAM = 0xfff6e9;
const DARK = 0x241816;
const PINK = 0xff8fa3;
const RED = 0xd7263d;
const GOLD = 0xffc83b;
const WOOD = 0xe0b882;
const WOOD_DARK = 0x8a542b;

// Mood poses: target rotations & offsets
const POSES = {
  idle: { tilt: 0, pitch: 0, yaw: 0, ear: 0, hop: 0, armL: 0, armR: 0 },
  thinking: { tilt: 0.14, pitch: -0.16, yaw: 0.12, ear: 0.05, hop: 0.05, armL: 0.2, armR: 0.6 },
  confused: { tilt: 0.42, pitch: 0.05, yaw: -0.1, ear: 0.35, hop: 0, armL: -0.1, armR: 0.3 },
  happy: { tilt: 0, pitch: -0.1, yaw: 0, ear: -0.22, hop: 0.22, armL: 1.2, armR: 1.2 },
  neutral: { tilt: 0, pitch: 0, yaw: 0, ear: 0, hop: 0, armL: 0.1, armR: 0.1 },
  sad: { tilt: -0.08, pitch: 0.24, yaw: 0, ear: 0.9, hop: -0.04, armL: -0.2, armR: -0.2 },
};

function createEmoteSprite() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 140;
  const ctx = canvas.getContext('2d');

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false }));
  sprite.scale.set(1.4, 0.77, 1);
  sprite.visible = false;

  function updateText(text, sub = '', color = '#d7263d') {
    ctx.clearRect(0, 0, 256, 140);

    // Bubble background
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#2b1d1a';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.roundRect(14, 12, 228, 96, 26);
    ctx.fill();
    ctx.stroke();

    // Bubble tail
    ctx.beginPath();
    ctx.moveTo(110, 108);
    ctx.lineTo(128, 130);
    ctx.lineTo(146, 108);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = '#2b1d1a';
    ctx.lineWidth = 6;
    ctx.stroke();
    // Re-fill interior gap of tail
    ctx.fillRect(114, 104, 28, 8);

    // Text
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '800 36px "M PLUS Rounded 1c", sans-serif';
    ctx.fillText(text, 128, sub ? 50 : 60);

    if (sub) {
      ctx.fillStyle = '#6b5a52';
      ctx.font = '700 18px Nunito, sans-serif';
      ctx.fillText(sub, 128, 82);
    }

    texture.needsUpdate = true;
  }

  return { sprite, updateText };
}

export function createMascot() {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);

  // Torso & cute cream belly
  const torso = part(new THREE.SphereGeometry(0.44, 32, 24), ORANGE);
  torso.scale.set(1, 1.08, 0.92);
  torso.position.y = 0.46;

  const belly = part(new THREE.SphereGeometry(0.32, 24, 16), CREAM, { outline: 0 });
  belly.scale.set(0.95, 1.15, 0.65);
  belly.position.set(0, 0.44, 0.23);

  // Traditional Japanese crimson scarf + gold bell (Suzu)
  const scarf = part(new THREE.TorusGeometry(0.32, 0.08, 12, 32), RED, { outline: 0.06 });
  scarf.rotation.x = Math.PI / 2;
  scarf.position.y = 0.82;

  const bell = part(new THREE.SphereGeometry(0.08, 16, 12), GOLD, { outline: 0.05 });
  bell.position.set(0, 0.74, 0.38);

  const bellRing = part(new THREE.TorusGeometry(0.04, 0.015, 8, 16), DARK, { outline: 0 });
  bellRing.position.set(0, 0.82, 0.38);

  body.add(torso, belly, scarf, bell, bellRing);

  // Chubby paws / feet
  for (const x of [-0.22, 0.22]) {
    const foot = part(new THREE.SphereGeometry(0.14, 16, 12), ORANGE);
    foot.scale.set(1, 0.65, 1.35);
    foot.position.set(x, 0.07, 0.12);

    const toe = part(new THREE.SphereGeometry(0.08, 12, 8), CREAM, { outline: 0 });
    toe.scale.set(0.9, 0.5, 0.9);
    toe.position.set(x, 0.06, 0.24);

    body.add(foot, toe);
  }

  // Arms / Front paws (Left & Right)
  const leftArm = new THREE.Group();
  leftArm.position.set(-0.38, 0.62, 0.08);
  const leftPaw = part(new THREE.SphereGeometry(0.11, 16, 12), ORANGE);
  leftPaw.scale.set(0.85, 1.5, 0.85);
  leftPaw.position.set(-0.06, -0.12, 0.08);
  leftArm.add(leftPaw);
  body.add(leftArm);

  const rightArm = new THREE.Group();
  rightArm.position.set(0.38, 0.62, 0.08);
  const rightPaw = part(new THREE.SphereGeometry(0.11, 16, 12), ORANGE);
  rightPaw.scale.set(0.85, 1.5, 0.85);
  rightPaw.position.set(0.06, -0.12, 0.08);
  rightArm.add(rightPaw);

  // Calligraphy brush (Fude 筆) held in right paw
  const brush = new THREE.Group();
  brush.position.set(0.12, -0.14, 0.18);
  brush.rotation.set(0.4, 0.2, -0.6);
  const brushHandle = part(new THREE.CylinderGeometry(0.02, 0.02, 0.55, 10), WOOD_DARK, { outline: 0.02 });
  const brushFerrule = part(new THREE.CylinderGeometry(0.028, 0.028, 0.06, 10), GOLD, { outline: 0.02 });
  brushFerrule.position.y = 0.26;
  const brushTip = part(new THREE.ConeGeometry(0.045, 0.14, 12), DARK, { outline: 0.02 });
  brushTip.position.y = 0.34;
  brush.add(brushHandle, brushFerrule, brushTip);
  rightArm.add(brush);
  body.add(rightArm);

  // Luxuriously fluffy 3-segment Fox Tail
  const tailGroup = new THREE.Group();
  tailGroup.position.set(0, 0.32, -0.34);

  const tailSeg1 = new THREE.Group();
  const tailMesh1 = part(new THREE.SphereGeometry(0.24, 20, 16), ORANGE);
  tailMesh1.scale.set(1, 1.4, 1);
  tailMesh1.position.set(0.1, 0.22, -0.12);
  tailSeg1.add(tailMesh1);

  const tailSeg2 = new THREE.Group();
  tailSeg2.position.set(0.18, 0.44, -0.16);
  const tailMesh2 = part(new THREE.SphereGeometry(0.28, 20, 16), ORANGE);
  tailMesh2.scale.set(1.1, 1.5, 1.1);
  tailMesh2.position.set(0.1, 0.24, -0.08);
  tailSeg2.add(tailMesh2);

  const tailSeg3 = new THREE.Group();
  tailSeg3.position.set(0.18, 0.46, -0.1);
  const tailMesh3 = part(new THREE.SphereGeometry(0.22, 20, 14), CREAM);
  tailMesh3.scale.set(0.9, 1.4, 0.9);
  tailMesh3.position.set(0.06, 0.22, 0);
  tailSeg3.add(tailMesh3);

  tailSeg2.add(tailSeg3);
  tailSeg1.add(tailSeg2);
  tailGroup.add(tailSeg1);
  body.add(tailGroup);

  // Head group pivots at neck
  const head = new THREE.Group();
  head.position.y = 0.88;
  body.add(head);

  const skull = part(new THREE.SphereGeometry(0.56, 32, 24), ORANGE);
  skull.scale.set(1.15, 0.96, 1.05);
  skull.position.y = 0.46;

  const muzzle = part(new THREE.SphereGeometry(0.28, 24, 16), CREAM, { outline: 0.02 });
  muzzle.scale.set(1.22, 0.78, 0.85);
  muzzle.position.set(0, 0.32, 0.45);

  const nose = part(new THREE.SphereGeometry(0.055, 12, 8), DARK, { outline: 0 });
  nose.position.set(0, 0.39, 0.68);

  head.add(skull, muzzle, nose);

  // Expressive Anime Eyes
  const eyes = [];
  const happyEyes = [];

  for (const x of [-0.22, 0.22]) {
    // Normal eye
    const eyeGroup = new THREE.Group();
    eyeGroup.position.set(x, 0.54, 0.52);

    const eyeIris = part(new THREE.SphereGeometry(0.09, 16, 12), DARK, { outline: 0 });
    eyeIris.scale.set(1, 1.35, 0.5);

    // Big shiny anime sparkle catchlights
    const shineMain = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    shineMain.position.set(0.025, 0.04, 0.07);

    const shineSub = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    shineSub.position.set(-0.025, -0.03, 0.07);

    eyeIris.add(shineMain, shineSub);
    eyeGroup.add(eyeIris);
    head.add(eyeGroup);
    eyes.push(eyeGroup);

    // Happy eyes (^ ^ curved arcs)
    const happyCurve = part(new THREE.TorusGeometry(0.075, 0.022, 8, 16, Math.PI), DARK, { outline: 0 });
    happyCurve.rotation.z = Math.PI;
    happyCurve.position.set(x, 0.54, 0.54);
    happyCurve.visible = false;
    head.add(happyCurve);
    happyEyes.push(happyCurve);
  }

  // Soft pink anime cheek blush
  const blushes = [];
  for (const x of [-0.38, 0.38]) {
    const blush = new THREE.Mesh(
      new THREE.CircleGeometry(0.08, 20),
      new THREE.MeshBasicMaterial({ color: PINK, transparent: true, opacity: 0.82 }),
    );
    blush.position.set(x, 0.36, 0.48);
    blush.lookAt(x * 2.5, 0.36, 2.5);
    head.add(blush);
    blushes.push(blush);
  }

  // Big fluffy anime fox ears with independent twitch physics
  const ears = [];
  for (const side of [-1, 1]) {
    const earGroup = new THREE.Group();
    earGroup.position.set(0.34 * side, 0.88, 0.02);

    const outer = part(new THREE.ConeGeometry(0.22, 0.48, 16), ORANGE);
    outer.position.y = 0.22;
    outer.rotation.y = side * 0.2;

    const inner = part(new THREE.ConeGeometry(0.13, 0.32, 16), CREAM, { outline: 0 });
    inner.position.set(0, 0.17, 0.09);
    inner.rotation.y = side * 0.2;

    earGroup.add(outer, inner);
    head.add(earGroup);
    ears.push({ earGroup, side, twitch: 0 });
  }

  // Emote sprite
  const { sprite: emoteSprite, updateText: updateEmote } = createEmoteSprite();
  emoteSprite.position.set(0.85, 2.45, 0.2);
  group.add(emoteSprite);

  // Japanese wooden Ema shrine score plaque
  const sign = new THREE.Group();
  sign.position.set(0, 0.58, 0.62);
  sign.visible = false;

  const board = part(new THREE.BoxGeometry(1.05, 0.72, 0.06), WOOD, { outline: 0.04 });
  const signCanvas = document.createElement('canvas');
  signCanvas.width = 380;
  signCanvas.height = 260;
  const signTexture = new THREE.CanvasTexture(signCanvas);
  signTexture.colorSpace = THREE.SRGBColorSpace;

  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.98, 0.65), new THREE.MeshBasicMaterial({ map: signTexture }));
  face.position.z = 0.035;

  const cord = part(new THREE.TorusGeometry(0.12, 0.025, 8, 16), RED, { outline: 0 });
  cord.position.set(0, 0.36, 0);

  sign.add(board, face, cord);

  for (const x of [-0.5, 0.5]) {
    const pawGrip = part(new THREE.SphereGeometry(0.11, 14, 10), ORANGE);
    pawGrip.position.set(x, -0.06, 0.05);
    sign.add(pawGrip);
  }
  body.add(sign);

  function drawScorePlaque(score) {
    const ctx = signCanvas.getContext('2d');
    // Parchment paper background
    ctx.fillStyle = '#fffdf7';
    ctx.fillRect(0, 0, 380, 260);

    // Decorative Japanese Hanko frame
    ctx.strokeStyle = '#d7263d';
    ctx.lineWidth = 10;
    ctx.strokeRect(12, 12, 356, 236);

    ctx.strokeStyle = '#e8cfa6';
    ctx.lineWidth = 3;
    ctx.strokeRect(20, 20, 340, 220);

    // Header kanji stamp: 合格 / 評価
    ctx.fillStyle = '#d7263d';
    ctx.font = '800 24px "M PLUS Rounded 1c", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('先 生 評 価', 190, 48);

    // Main Score Number
    ctx.fillStyle = '#241816';
    ctx.font = '800 105px "M PLUS Rounded 1c", sans-serif';
    ctx.fillText(String(score), 190, 145);

    // Max score & Rank badge
    const rank = score >= 90 ? 'RANK S 🌸' : score >= 80 ? 'RANK A ✨' : score >= 60 ? 'RANK B 👍' : 'RANK C 💧';
    ctx.fillStyle = score >= 80 ? '#5f9a4a' : score >= 60 ? '#d99a2b' : '#d7263d';
    ctx.font = '800 28px "M PLUS Rounded 1c", Nunito, sans-serif';
    ctx.fillText(rank, 190, 218);

    signTexture.needsUpdate = true;
  }

  // Animation & Interactive State
  let mood = 'idle';
  let moodAge = 0;
  let signAge = 0;
  let petBounce = 0;
  let nextTwitch = 2;
  const pose = { ...POSES.idle };
  const pointerTarget = { x: 0, y: 0 };
  const pointerCurrent = { x: 0, y: 0 };

  function setMood(next) {
    if (next === mood) return;
    mood = next;
    moodAge = 0;

    if (mood === 'thinking') {
      updateEmote('💭 …', 'Đang phân tích...', '#6b5a52');
      emoteSprite.visible = true;
    } else if (mood === 'confused') {
      updateEmote('❓ …', 'Cần làm rõ!', '#d7263d');
      emoteSprite.visible = true;
    } else if (mood === 'happy') {
      updateEmote('🌸 Tuyệt vời!', 'Sugoi!', '#5f9a4a');
      emoteSprite.visible = true;
    } else if (mood === 'sad') {
      updateEmote('💧 Cố lên!', 'Hãy thử lại nhé', '#d7263d');
      emoteSprite.visible = true;
    } else {
      emoteSprite.visible = false;
    }
  }

  function showScore(score) {
    drawScorePlaque(score);
    sign.visible = true;
    signAge = 0;
  }

  function hideScore() {
    sign.visible = false;
  }

  // Petting / Click reaction
  function pet() {
    petBounce = 1.0;
    updateEmote('💖 Ganbatte!', 'Sensei ủng hộ bạn!', '#d7263d');
    emoteSprite.visible = true;
    setTimeout(() => {
      if (mood === 'idle') emoteSprite.visible = false;
    }, 2800);
  }

  function setPointer(nx, ny) {
    pointerTarget.x = THREE.MathUtils.clamp(nx, -1, 1);
    pointerTarget.y = THREE.MathUtils.clamp(ny, -1, 1);
  }

  function update(t, dt) {
    moodAge += dt;
    signAge += dt;
    if (petBounce > 0) petBounce = Math.max(0, petBounce - dt * 2.5);

    // Smooth pointer damping
    pointerCurrent.x += (pointerTarget.x - pointerCurrent.x) * (1 - Math.exp(-dt * 6));
    pointerCurrent.y += (pointerTarget.y - pointerCurrent.y) * (1 - Math.exp(-dt * 6));

    // Smooth mood pose transition
    const blend = 1 - Math.exp(-dt / 0.12);
    const target = POSES[mood] || POSES.idle;
    for (const key of Object.keys(pose)) {
      pose[key] += (target[key] - pose[key]) * blend;
    }

    const sad = mood === 'sad';
    const happy = mood === 'happy';
    const thinking = mood === 'thinking';
    const speed = sad ? 1.4 : happy ? 3.4 : 2.2;

    // Body breathing & bouncy hop
    const breathe = Math.sin(t * speed) * (sad ? 0.012 : 0.026);
    const petHop = Math.sin(petBounce * Math.PI) * 0.35;
    const happyHop = happy && moodAge < 3.2 ? Math.abs(Math.sin(moodAge * 6)) * 0.28 : 0;
    body.position.y = breathe + happyHop + petHop;
    body.scale.y = 1 + Math.sin(t * speed * 2) * 0.015;

    // Head rotation: combination of mood pose + pointer look-at
    const nod = mood === 'neutral' ? Math.sin(moodAge * 6) * 0.15 * Math.max(0, 1 - moodAge / 2) : 0;
    const lookYaw = -pointerCurrent.x * 0.45;
    const lookPitch = pointerCurrent.y * 0.25;

    head.rotation.z = pose.tilt;
    head.rotation.x = pose.pitch + nod + lookPitch;
    head.rotation.y = pose.yaw + lookYaw;

    // Bell swings gently with body motion
    bell.rotation.z = Math.sin(t * speed * 1.5) * 0.25;

    // Ears twitch physics
    nextTwitch -= dt;
    if (nextTwitch <= 0) {
      const idx = Math.random() < 0.5 ? 0 : 1;
      ears[idx].twitch = 0.5;
      nextTwitch = 1.5 + Math.random() * 3.5;
    }
    for (const ear of ears) {
      if (ear.twitch > 0) ear.twitch = Math.max(0, ear.twitch - dt * 4);
      const twitchOffset = Math.sin(ear.twitch * Math.PI * 4) * 0.2;
      ear.earGroup.rotation.z = -ear.side * (0.34 + pose.ear) + twitchOffset;
    }

    // Fluffy tail wave physics (harmonic chain)
    const tailSpeed = happy ? 9.5 : sad ? 1.6 : 3.2;
    const tailAmp = happy ? 0.38 : sad ? 0.09 : 0.26;
    tailSeg1.rotation.z = Math.sin(t * tailSpeed) * tailAmp;
    tailSeg2.rotation.z = Math.sin(t * tailSpeed - 0.5) * tailAmp * 1.35;
    tailSeg3.rotation.z = Math.sin(t * tailSpeed - 1.0) * tailAmp * 1.6;
    tailGroup.rotation.y = thinking ? Math.sin(t * 5) * 0.5 : 0;

    // Arms / Calligraphy brush gesturing
    leftArm.rotation.z = pose.armL + Math.sin(t * speed) * 0.08;
    rightArm.rotation.z = -pose.armR - Math.sin(t * speed) * 0.08;

    if (thinking) {
      brush.rotation.x = 0.8 + Math.sin(t * 4) * 0.2;
    } else {
      brush.rotation.x = 0.4;
    }

    // Eyes: blinking & happy state
    const blinkCycle = t % 3.6;
    const blinking = blinkCycle < 0.14 || (blinkCycle > 0.24 && blinkCycle < 0.35 && Math.sin(t) > 0.4);
    const eyeScaleY = blinking ? 0.08 : happy ? 0 : 1.35;

    for (const eye of eyes) {
      eye.scale.y = eyeScaleY;
      // Pupil tracks pointer slightly
      eye.position.x = (eye === eyes[0] ? -0.22 : 0.22) + pointerCurrent.x * 0.02;
      eye.position.y = 0.54 + pointerCurrent.y * 0.02;
    }

    for (const hEye of happyEyes) {
      hEye.visible = happy;
    }

    // Emote bubble floating
    if (emoteSprite.visible) {
      const bubbleFloat = Math.sin(t * 3.5) * 0.04;
      emoteSprite.position.y = 2.45 + bubbleFloat;
    }

    // Score sign elastic pop-in
    if (sign.visible) {
      const s = Math.min(1, signAge * 4.5);
      // Elastic spring ease-out
      const scale = 1 - Math.pow(1 - s, 3);
      sign.scale.setScalar(scale);
    }
  }

  return {
    group,
    update,
    setMood,
    showScore,
    hideScore,
    pet,
    setPointer,
  };
}
