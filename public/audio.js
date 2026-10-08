// Zero-dependency Web Audio: a procedural Japanese-garden soundtrack plus game-style UI sounds.
// Everything is synthesised at runtime, so there are no audio files to load.

const SFX_KEY = 'prompt_sensei_sound';
const MUSIC_KEY = 'prompt_sensei_music';
const MUSIC_LEVEL = 0.42;

const readPref = key => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const writePref = (key, value) => {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // Private mode: the setting just won't persist.
  }
};

let ctx = null;
let master, sfxBus, musicGain, duckGain, musicFilter, reverbSend, noiseBuf;
let soundEnabled = readPref(SFX_KEY) !== 'false';
let musicEnabled = readPref(MUSIC_KEY) !== 'false';

function buildGraph(c) {
  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.ratio.value = 4;
  master = c.createGain();
  master.gain.value = 0.9;
  master.connect(comp).connect(c.destination);

  // Shared hall reverb from a generated impulse: a garden courtyard rather than a dry studio.
  const seconds = 2.6;
  const impulse = c.createBuffer(2, Math.floor(c.sampleRate * seconds), c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 2.6);
    }
  }
  const reverb = c.createConvolver();
  reverb.buffer = impulse;
  reverbSend = c.createGain();
  reverbSend.gain.value = 0.32;
  reverbSend.connect(reverb).connect(master);

  sfxBus = c.createGain();
  sfxBus.gain.value = 0.8;
  sfxBus.connect(master);
  sfxBus.connect(reverbSend);

  musicGain = c.createGain();
  musicGain.gain.value = 0;
  duckGain = c.createGain();
  musicFilter = c.createBiquadFilter();
  musicFilter.type = 'lowpass';
  musicFilter.frequency.value = 2400;
  musicFilter.Q.value = 0.4;
  musicGain.connect(duckGain).connect(musicFilter);
  musicFilter.connect(master);
  musicFilter.connect(reverbSend);

  noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
  const n = noiseBuf.getChannelData(0);
  for (let i = 0; i < n.length; i++) n[i] = Math.random() * 2 - 1;
}

function getContext() {
  if (!ctx) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return null;
    ctx = new AudioContext();
    buildGraph(ctx);
  }
  if (ctx.state === 'suspended' && !document.hidden) ctx.resume();
  return ctx;
}

// Browsers only let audio start from a user gesture; call this from one.
let unlocked = false;
export function unlock() {
  const c = getContext();
  if (!c) return;
  const ready = () => {
    if (unlocked) return;
    unlocked = true;
    if (musicEnabled) startMusic();
  };
  if (c.state === 'running') ready();
  else c.resume().then(() => c.state === 'running' && ready(), () => {});
}
export const isUnlocked = () => unlocked;

document.addEventListener('visibilitychange', () => {
  if (!ctx || !unlocked) return;
  if (document.hidden) ctx.suspend();
  else ctx.resume();
});

// ---------------------------------------------------------------------------
// Synth building blocks

const midiToFreq = m => 440 * Math.pow(2, (m - 69) / 12);

function tone(type, freq, t, dur, out, { vel = 0.2, attack = 0.005, glide, glideAt, detune = 0 } = {}) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (glide) o.frequency.exponentialRampToValueAtTime(glide, t + (glideAt ?? dur * 0.8));
  o.detune.value = detune;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vel, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + dur + 0.05);
  return o;
}

function noise(t, dur, out, { vel = 0.2, type = 'highpass', freq = 6000, freqEnd, q = 1, attack = 0.003 } = {}) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(freq, t);
  if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vel, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(out);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.05);
}

// Koto-ish pluck: bright attack that darkens quickly, with a soft octave partial.
function pluck(t, freq, vel, out, decay = 1.3) {
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.Q.value = 3;
  f.frequency.setValueAtTime(Math.min(freq * 9, 10000), t);
  f.frequency.exponentialRampToValueAtTime(Math.max(freq * 1.4, 300), t + 0.35);
  f.connect(out);
  tone('triangle', freq, t, decay, f, { vel, attack: 0.003 });
  tone('sawtooth', freq, t, 0.12, f, { vel: vel * 0.35, attack: 0.002 });
  tone('sine', freq * 2, t, decay * 0.6, f, { vel: vel * 0.3, attack: 0.003 });
}

// Wind-chime / temple bell: inharmonic partials with a long tail.
function bell(t, freq, vel, out, decay = 1.8) {
  tone('sine', freq, t, decay, out, { vel, attack: 0.002 });
  tone('sine', freq * 2.76, t, decay * 0.5, out, { vel: vel * 0.35, attack: 0.002 });
  tone('sine', freq * 5.4, t, decay * 0.25, out, { vel: vel * 0.15, attack: 0.002 });
}

function taiko(t, vel, out) {
  tone('sine', 120, t, 0.5, out, { vel, attack: 0.004, glide: 48, glideAt: 0.3 });
  noise(t, 0.08, out, { vel: vel * 0.35, type: 'lowpass', freq: 900 });
}

function woodblock(t, vel, out, freq = 1100) {
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = 5;
  f.connect(out);
  tone('triangle', freq * 1.6, t, 0.07, f, { vel, attack: 0.001, glide: freq * 0.8, glideAt: 0.05 });
}

// ---------------------------------------------------------------------------
// Procedural soundtrack: pentatonic koto melody over a soft pad, mood-aware.

const ROOT = 62; // D4
const SCALES = {
  yo: [0, 2, 5, 7, 9], // bright Japanese pentatonic
  in: [0, 1, 5, 7, 8], // tense, mysterious
  hira: [0, 2, 3, 7, 8], // melancholic
};
const MOODS = {
  idle: { scale: 'yo', bpm: 76, density: 0.42, bright: 2400, perc: 'soft', prog: [0, 3, 4, 2] },
  neutral: { scale: 'yo', bpm: 84, density: 0.5, bright: 2800, perc: 'soft', prog: [0, 2, 3, 4] },
  thinking: { scale: 'in', bpm: 100, density: 0.58, bright: 1800, perc: 'clock', prog: [0, 0, 3, 3] },
  confused: { scale: 'in', bpm: 82, density: 0.34, bright: 1900, perc: 'soft', prog: [0, 3, 1, 3] },
  happy: { scale: 'yo', bpm: 108, density: 0.7, bright: 5200, perc: 'taiko', prog: [0, 3, 4, 2] },
  sad: { scale: 'hira', bpm: 64, density: 0.28, bright: 1300, perc: 'none', prog: [0, 3, 2, 3] },
};

let mood = MOODS.idle;
let musicTimer = null;
let nextTime = 0;
let step = 0;
let motif = [];
let melodyDegree = 7;

const degreeFreq = (scale, degree) => {
  const notes = SCALES[scale];
  const oct = Math.floor(degree / notes.length);
  const idx = ((degree % notes.length) + notes.length) % notes.length;
  return midiToFreq(ROOT + 12 * oct + notes[idx]);
};

function newMotif() {
  const notes = [];
  for (let i = 0; i < 16; i++) {
    const strong = i % 4 === 0 ? 0.25 : i % 2 === 0 ? 0.05 : -0.1;
    if (Math.random() < mood.density + strong) {
      const leap = [-2, -1, -1, 1, 1, 2, 0][Math.floor(Math.random() * 7)];
      melodyDegree = Math.max(3, Math.min(10, melodyDegree + leap));
      notes.push(melodyDegree);
    } else {
      notes.push(null);
    }
  }
  return notes;
}

function mutate(notes) {
  return notes.map(n => (n !== null && Math.random() < 0.15 ? Math.max(3, Math.min(10, n + (Math.random() < 0.5 ? -1 : 1))) : n));
}

function scheduleStep(t, beat) {
  const out = musicGain;
  const bar = Math.floor(step / 8);
  const pos = step % 8;
  const chord = mood.prog[bar % mood.prog.length];

  if (step % 16 === 0) motif = motif.length && Math.random() < 0.6 ? mutate(motif) : newMotif();

  if (pos === 0) {
    // Pad: stacked pentatonic tones (open, quartal-sounding), plus a sub bass.
    const barLen = beat * 8;
    for (const d of [chord, chord + 2, chord + 4]) {
      const freq = degreeFreq(mood.scale, d - 5);
      for (const detune of [-7, 7]) {
        tone('sawtooth', freq, t, barLen + 1.2, out, { vel: 0.018, attack: 0.9, detune });
      }
    }
    tone('sine', degreeFreq(mood.scale, chord - 10), t, barLen * 0.9, out, { vel: 0.16, attack: 0.08 });
  }
  if (pos === 4 && mood.perc !== 'none') {
    tone('sine', degreeFreq(mood.scale, chord - 5), t, beat * 3, out, { vel: 0.07, attack: 0.05 });
  }

  const note = motif[step % 16];
  if (note !== null && note !== undefined) {
    const vel = (pos % 2 === 0 ? 0.13 : 0.09) * (0.85 + Math.random() * 0.3);
    if (Math.random() < 0.14) pluck(t - 0.05, degreeFreq(mood.scale, note + 1), vel * 0.5, out, 0.3);
    pluck(t, degreeFreq(mood.scale, note), vel, out, mood === MOODS.sad ? 2 : 1.4);
  }

  if (mood.perc === 'soft') {
    if (pos % 2 === 1) noise(t, 0.05, out, { vel: 0.025, freq: 7000 });
    if (pos === 0) woodblock(t, 0.06, out, 700);
  } else if (mood.perc === 'clock') {
    noise(t, 0.04, out, { vel: pos % 2 ? 0.02 : 0.035, freq: 7500 });
    if (pos % 2 === 0) woodblock(t, 0.07, out, pos % 4 ? 1500 : 1100);
  } else if (mood.perc === 'taiko') {
    if (pos === 0 || pos === 3 || pos === 6) taiko(t, pos === 0 ? 0.32 : 0.2, out);
    noise(t, 0.05, out, { vel: pos % 2 ? 0.03 : 0.018, freq: 7000 });
    if (pos === 4) woodblock(t, 0.08, out, 900);
  }

  // Furin: an occasional wind chime drifting through the garden.
  if (mood !== MOODS.thinking && Math.random() < 0.025) {
    bell(t + Math.random() * beat, degreeFreq(mood.scale, 12 + Math.floor(Math.random() * 5)), 0.035, out, 2.5);
  }
  step++;
}

function scheduler() {
  if (!ctx || ctx.state !== 'running') return;
  const now = ctx.currentTime;
  if (nextTime < now - 0.1) nextTime = now + 0.05; // recover after the tab was throttled
  while (nextTime < now + 0.15) {
    const beat = 60 / mood.bpm / 2; // eighth notes
    scheduleStep(nextTime, beat);
    nextTime += beat;
  }
}

// Optional theme song: drop an audio file at public/audio/theme.mp3 (not committed) and it loops
// instead of the procedural soundtrack. Without the file, the generated music plays as before.
const THEME_URL = 'audio/theme.mp3';
let theme = null; // { el: HTMLAudioElement } once the file is known to exist
let themeCheck = null;

function findTheme() {
  themeCheck ??= fetch(THEME_URL, { method: 'HEAD' })
    .then(res => {
      if (!res.ok || !/^audio\//.test(res.headers.get('content-type') || '')) return null;
      const el = new Audio(THEME_URL);
      el.loop = true;
      el.preload = 'auto';
      ctx.createMediaElementSource(el).connect(musicGain);
      theme = { el };
      return theme;
    })
    .catch(() => null);
  return themeCheck;
}

let musicWanted = false;

function startMusic() {
  const c = getContext();
  if (!c || musicWanted) return;
  musicWanted = true;
  findTheme().then(found => {
    if (!musicWanted) return;
    if (found) {
      musicFilter.frequency.setTargetAtTime(18000, c.currentTime, 0.1); // the recording needs no muffling
      musicGain.gain.cancelScheduledValues(c.currentTime);
      musicGain.gain.setTargetAtTime(MUSIC_LEVEL, c.currentTime, 0.6);
      found.el.play().catch(() => {});
    } else {
      startGeneratedMusic(c);
    }
  });
}

function startGeneratedMusic(c) {
  if (musicTimer) return;
  nextTime = c.currentTime + 0.1;
  step = 0;
  motif = [];
  musicGain.gain.cancelScheduledValues(c.currentTime);
  musicGain.gain.setTargetAtTime(MUSIC_LEVEL, c.currentTime, 1.2);
  musicTimer = setInterval(scheduler, 25);
  scheduler();
}

function stopMusic() {
  if (!ctx || !musicWanted) return;
  musicWanted = false;
  musicGain.gain.cancelScheduledValues(ctx.currentTime);
  musicGain.gain.setTargetAtTime(0, ctx.currentTime, 0.25);
  if (theme) setTimeout(() => !musicWanted && theme.el.pause(), 800);
  clearInterval(musicTimer);
  musicTimer = null;
}

export function setMusicMood(name) {
  const next = MOODS[name] ?? MOODS.idle;
  if (next === mood) return;
  mood = next;
  motif = []; // new feeling, new tune
  if (ctx && !theme) musicFilter.frequency.setTargetAtTime(mood.bright, ctx.currentTime, 0.8);
}

// Pull the soundtrack down so a fanfare can shine.
function duck(level = 0.3, hold = 1.8) {
  const now = ctx.currentTime;
  duckGain.gain.cancelScheduledValues(now);
  duckGain.gain.setTargetAtTime(level, now, 0.04);
  duckGain.gain.setTargetAtTime(1, now + hold, 0.7);
}

// ---------------------------------------------------------------------------
// Settings

export const isSoundEnabled = () => soundEnabled;
export const isMusicEnabled = () => musicEnabled;

export function setSoundEnabled(val) {
  soundEnabled = val;
  writePref(SFX_KEY, val);
  if (val) unlock();
}

export function toggleSound() {
  setSoundEnabled(!soundEnabled);
  if (soundEnabled) playPop(520);
  return soundEnabled;
}

export function toggleMusic() {
  musicEnabled = !musicEnabled;
  writePref(MUSIC_KEY, musicEnabled);
  if (musicEnabled) {
    unlock();
    if (unlocked) startMusic();
  } else {
    stopMusic();
  }
  return musicEnabled;
}

// ---------------------------------------------------------------------------
// Sound effects

// Returns a start time when effects may play, otherwise null.
function sfx() {
  if (!soundEnabled || !unlocked || !ctx || ctx.state !== 'running') return null;
  return ctx.currentTime + 0.005;
}

function throttle(fn, ms) {
  let last = 0;
  return (...args) => {
    const now = performance.now();
    if (now - last < ms) return;
    last = now;
    fn(...args);
  };
}

const PENTA_HIGH = [74, 76, 79, 81, 83, 86, 88, 91, 93].map(midiToFreq); // D5..A6, yo scale

export function playClack() {
  const t = sfx();
  if (t === null) return;
  woodblock(t, 0.35, sfxBus, 800);
  noise(t, 0.04, sfxBus, { vel: 0.12, type: 'bandpass', freq: 2500, q: 2 });
}

export function playStamp() {
  const t = sfx();
  if (t === null) return;
  tone('sine', 180, t, 0.25, sfxBus, { vel: 0.6, attack: 0.004, glide: 42, glideAt: 0.2 });
  noise(t, 0.12, sfxBus, { vel: 0.25, type: 'lowpass', freq: 1200 });
  woodblock(t + 0.03, 0.3, sfxBus, 800);
}

export function playChime() {
  const t = sfx();
  if (t === null) return;
  [0, 1, 3, 4, 5].forEach((n, i) => bell(t + i * 0.07, PENTA_HIGH[n], 0.1, sfxBus, 1.2));
}

export function playPop(freq = 440) {
  const t = sfx();
  if (t === null) return;
  tone('sine', freq, t, 0.1, sfxBus, { vel: 0.22, attack: 0.004, glide: freq * 1.6, glideAt: 0.06 });
  tone('triangle', freq * 2, t, 0.05, sfxBus, { vel: 0.05, attack: 0.002 });
}

export const playHover = throttle(() => {
  const t = sfx();
  if (t === null) return;
  tone('sine', 2100 + Math.random() * 300, t, 0.04, sfxBus, { vel: 0.03, attack: 0.002, glide: 2700, glideAt: 0.03 });
}, 35);

export const playType = throttle(() => {
  const t = sfx();
  if (t === null) return;
  woodblock(t, 0.06 + Math.random() * 0.03, sfxBus, 1500 + Math.random() * 700);
}, 40);

// Soft teletype ticks while an answer streams in.
export const playStream = throttle(() => {
  const t = sfx();
  if (t === null) return;
  noise(t, 0.025, sfxBus, { vel: 0.04, freq: 4500 });
  tone('sine', 1300 + Math.random() * 500, t, 0.03, sfxBus, { vel: 0.02, attack: 0.002 });
}, 75);

// Rising tick for the score counter; progress is 0..1.
export const playCount = throttle(progress => {
  const t = sfx();
  if (t === null) return;
  tone('square', 520 + progress * 900, t, 0.035, sfxBus, { vel: 0.025, attack: 0.001 });
}, 45);

export function playWhoosh(strength = 1) {
  const t = sfx();
  if (t === null) return;
  const dur = 0.25 + strength * 0.2;
  noise(t, dur, sfxBus, { vel: 0.1 * strength, type: 'bandpass', freq: 350, freqEnd: 2600, q: 1.2, attack: dur * 0.45 });
}

export function playSparkle(count = 5) {
  const t = sfx();
  if (t === null) return;
  for (let i = 0; i < count; i++) {
    const freq = PENTA_HIGH[3 + Math.floor(Math.random() * 6)];
    bell(t + i * 0.055 + Math.random() * 0.02, freq, 0.05, sfxBus, 0.7);
  }
}

// A cheerful robot-cat chirp when Doraemon is petted, then a little sparkle.
export function playPet() {
  const t = sfx();
  if (t === null) return;
  const base = 760 + Math.random() * 160;
  const o = ctx.createOscillator();
  o.type = 'triangle';
  o.frequency.setValueAtTime(base, t);
  o.frequency.exponentialRampToValueAtTime(base * 1.9, t + 0.07);
  o.frequency.exponentialRampToValueAtTime(base * 1.4, t + 0.2);
  const vib = ctx.createOscillator();
  vib.frequency.value = 28;
  const vibDepth = ctx.createGain();
  vibDepth.gain.value = 35;
  vib.connect(vibDepth).connect(o.frequency);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.16, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
  o.connect(g).connect(sfxBus);
  o.start(t);
  vib.start(t);
  o.stop(t + 0.3);
  vib.stop(t + 0.3);
  setTimeout(() => playSparkle(3), 90);
}

// Magic charge-up when a prompt is sent to Sensei.
export function playCast() {
  const t = sfx();
  if (t === null) return;
  tone('sine', 300, t, 0.6, sfxBus, { vel: 0.08, attack: 0.25, glide: 1200, glideAt: 0.55 });
  tone('triangle', 450, t, 0.6, sfxBus, { vel: 0.04, attack: 0.25, glide: 1800, glideAt: 0.55 });
  noise(t, 0.6, sfxBus, { vel: 0.05, type: 'bandpass', freq: 600, freqEnd: 5000, q: 3, attack: 0.4 });
  [0, 2, 4, 6].forEach((n, i) => bell(t + 0.12 + i * 0.09, PENTA_HIGH[n], 0.05, sfxBus, 0.6));
}

// "Hm?" when Sensei needs to ask a question.
export function playQuestion() {
  const t = sfx();
  if (t === null) return;
  tone('triangle', 620, t, 0.12, sfxBus, { vel: 0.14, attack: 0.01, glide: 520, glideAt: 0.1 });
  tone('triangle', 500, t + 0.16, 0.22, sfxBus, { vel: 0.15, attack: 0.01, glide: 950, glideAt: 0.18 });
}

export function playError() {
  const t = sfx();
  if (t === null) return;
  tone('triangle', 330, t, 0.13, sfxBus, { vel: 0.16, attack: 0.005 });
  tone('triangle', 247, t + 0.14, 0.22, sfxBus, { vel: 0.16, attack: 0.005, glide: 220, glideAt: 0.2 });
}

export function playSuccess() {
  const t = sfx();
  if (t === null) return;
  bell(t, PENTA_HIGH[3], 0.09, sfxBus, 0.9);
  bell(t + 0.09, PENTA_HIGH[5], 0.09, sfxBus, 1.1);
}

// Scroll unrolling / rolling back up.
export function playOpen() {
  const t = sfx();
  if (t === null) return;
  noise(t, 0.35, sfxBus, { vel: 0.06, type: 'bandpass', freq: 700, freqEnd: 3200, q: 1.5, attack: 0.15 });
  [0, 2, 4].forEach((n, i) => pluck(t + 0.05 + i * 0.07, PENTA_HIGH[n], 0.09, sfxBus, 0.8));
}

export function playClose() {
  const t = sfx();
  if (t === null) return;
  [4, 1].forEach((n, i) => pluck(t + i * 0.07, PENTA_HIGH[n], 0.08, sfxBus, 0.6));
}

export function playCinema(on) {
  const t = sfx();
  if (t === null) return;
  playWhoosh(on ? 1.6 : 0.8);
  if (on) [0, 2, 4, 7].forEach((n, i) => bell(t + 0.15 + i * 0.1, PENTA_HIGH[n] / 2, 0.06, sfxBus, 1.6));
}

// Result fanfare scaled to the rank: S is a festival, C is a gentle "aww".
export function playFanfare(rank) {
  const t = sfx();
  if (t === null) return;
  if (rank === 'C') {
    duck(0.5, 1.2);
    [4, 2, 0].forEach((n, i) => pluck(t + i * 0.18, PENTA_HIGH[n] / 2, 0.12, sfxBus, i === 2 ? 1.6 : 0.6));
    tone('triangle', PENTA_HIGH[0] / 2, t + 0.36, 0.9, sfxBus, { vel: 0.06, attack: 0.05, glide: PENTA_HIGH[0] / 2.25, glideAt: 0.8 });
    return;
  }
  if (rank === 'B') {
    duck(0.45, 1.2);
    [1, 2, 5].forEach((n, i) => pluck(t + i * 0.1, PENTA_HIGH[n], 0.13, sfxBus, i === 2 ? 1.4 : 0.6));
    return;
  }
  const big = rank === 'S';
  duck(0.25, big ? 2.6 : 2);
  taiko(t, big ? 0.6 : 0.45, sfxBus);
  const run = big ? [0, 1, 2, 3, 4, 5, 6, 7, 8] : [0, 2, 3, 5];
  run.forEach((n, i) => pluck(t + 0.05 + i * 0.05, PENTA_HIGH[n], 0.12, sfxBus, 0.7));
  const end = t + 0.1 + run.length * 0.05;
  for (const n of big ? [0, 3, 5, 8] : [0, 3, 5]) bell(end, PENTA_HIGH[n], 0.07, sfxBus, 2);
  if (big) {
    taiko(end, 0.5, sfxBus);
    setTimeout(() => playSparkle(7), (end - ctx.currentTime) * 1000 + 250);
  }
}
