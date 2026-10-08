// Zero-dependency Web Audio synthesizer for Japanese anime UI sound effects.
let ctx = null;
let soundEnabled = localStorage.getItem('prompt_sensei_sound') === 'true';

function getContext() {
  if (!ctx && (window.AudioContext || window.webkitAudioContext)) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (ctx && ctx.state === 'suspended') {
    ctx.resume();
  }
  return ctx;
}

export function isSoundEnabled() {
  return soundEnabled;
}

export function setSoundEnabled(val) {
  soundEnabled = !!val;
  localStorage.setItem('prompt_sensei_sound', soundEnabled ? 'true' : 'false');
  if (soundEnabled) getContext();
}

export function toggleSound() {
  setSoundEnabled(!soundEnabled);
  if (soundEnabled) playPop(520);
  return soundEnabled;
}

// Japanese wooden clack (Hyoshigi / Mokugyo)
export function playClack() {
  if (!soundEnabled) return;
  const audio = getContext();
  if (!audio) return;
  const now = audio.currentTime;

  const osc = audio.createOscillator();
  const gain = audio.createGain();
  const filter = audio.createBiquadFilter();

  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(800, now);
  filter.Q.setValueAtTime(4.0, now);

  osc.type = 'triangle';
  osc.frequency.setValueAtTime(560, now);
  osc.frequency.exponentialRampToValueAtTime(140, now + 0.08);

  gain.gain.setValueAtTime(0.4, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(audio.destination);

  osc.start(now);
  osc.stop(now + 0.1);
}

// Hanko stamp impact
export function playStamp() {
  if (!soundEnabled) return;
  const audio = getContext();
  if (!audio) return;
  const now = audio.currentTime;

  const osc = audio.createOscillator();
  const gain = audio.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(180, now);
  osc.frequency.exponentialRampToValueAtTime(42, now + 0.18);

  gain.gain.setValueAtTime(0.6, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

  osc.connect(gain);
  gain.connect(audio.destination);

  osc.start(now);
  osc.stop(now + 0.25);

  // Secondary wooden knock
  setTimeout(playClack, 30);
}

// Pentatonic anime bell/chime (Koto / Wind chime celebration)
export function playChime() {
  if (!soundEnabled) return;
  const audio = getContext();
  if (!audio) return;

  const freqs = [587.33, 659.25, 880.0, 987.77, 1174.66]; // D5, E5, A5, B5, D6
  freqs.forEach((freq, idx) => {
    const now = audio.currentTime + idx * 0.07;
    const osc = audio.createOscillator();
    const gain = audio.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);

    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

    osc.connect(gain);
    gain.connect(audio.destination);

    osc.start(now);
    osc.stop(now + 0.65);
  });
}

// Cute soft anime bubble pop / button sound
export function playPop(freq = 440) {
  if (!soundEnabled) return;
  const audio = getContext();
  if (!audio) return;
  const now = audio.currentTime;

  const osc = audio.createOscillator();
  const gain = audio.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, now);
  osc.frequency.exponentialRampToValueAtTime(freq * 1.5, now + 0.06);

  gain.gain.setValueAtTime(0.2, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

  osc.connect(gain);
  gain.connect(audio.destination);

  osc.start(now);
  osc.stop(now + 0.09);
}

