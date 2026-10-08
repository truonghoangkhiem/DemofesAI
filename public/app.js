import { marked } from 'marked';
import DOMPurify from 'dompurify';
import * as audio from './audio.js';
import { t, isLang, findPreset, LANGS, DEFAULT_LANG, PRESETS } from './i18n.js';

const $ = id => document.getElementById(id);
const NO_SCENE = {
  setMood() {},
  showScore() {},
  hideScore() {},
  setView() {},
  toggleCinema() {},
  pet() {},
  burst() {},
  setLang() {},
};
const MAX_CHARS = 4000;

const LANG_KEY = 'prompt_sensei_lang';

// Storage can throw (private mode, blocked site data); the page must still work without it.
function loadLang() {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    return isLang(saved) ? saved : DEFAULT_LANG;
  } catch {
    return DEFAULT_LANG;
  }
}
function saveLang(lang) {
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {
    // Not saved; the choice still applies to this visit.
  }
}

let currentLang = loadLang();
// Text in the current UI language (see public/i18n.js).
const tr = (key, params) => t(currentLang, key, params);

// 3D Scene setup and state
let realScene = NO_SCENE;
const sceneState = { mood: 'idle', score: null, view: 'input', cinema: false };

const scene = {
  setMood(mood) {
    sceneState.mood = mood;
    realScene.setMood(mood);
    audio.setMusicMood(mood);
  },
  showScore(score) {
    sceneState.score = score;
    realScene.showScore(score);
  },
  hideScore() {
    sceneState.score = null;
    realScene.hideScore();
  },
  setView(view) {
    sceneState.view = view;
    realScene.setView(view);
  },
  toggleCinema(isCinema) {
    sceneState.cinema = realScene.toggleCinema(isCinema);
    return sceneState.cinema;
  },
  pet() {
    realScene.pet();
  },
  burst() {
    realScene.burst();
  },
  setLang(lang) {
    realScene.setLang(lang);
  },
};

const sceneLoadStart = performance.now();
import('./scene/index.js')
  .then(module => {
    console.info(`[scene] modules loaded in ${Math.round(performance.now() - sceneLoadStart)} ms`);
    return module.initScene($('scene'), $('panel'));
  })
  .then(loaded => {
    realScene = loaded;
    realScene.setLang(currentLang);
    realScene.setMood(sceneState.mood);
    realScene.setView(sceneState.view);
    if (sceneState.score !== null) realScene.showScore(sceneState.score);
  })
  .catch(err => {
    console.error('3D scene unavailable:', err);
    document.body.classList.add('no-webgl');
  })
  .finally(() => document.body.classList.add('scene-ready'));

const state = { prompt: '', questions: [], result: null, busy: false, compare: null };

const rankFor = score => (score >= 90 ? 'S' : score >= 80 ? 'A' : score >= 60 ? 'B' : 'C');
const moodFor = score => (score >= 80 ? 'happy' : score >= 50 ? 'neutral' : 'sad');
const titleFor = score => tr(score >= 80 ? 'titleExcellent' : score >= 50 ? 'titleGood' : 'titleNeedsWork');

// Fills every element marked with data-i18n (text), data-i18n-html (trusted markup from i18n.js),
// data-i18n-placeholder, data-i18n-title or data-i18n-aria-label.
const I18N_ATTRIBUTES = [
  ['data-i18n-placeholder', 'placeholder'],
  ['data-i18n-title', 'title'],
  ['data-i18n-aria-label', 'aria-label'],
];
function translatePage() {
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = tr(el.dataset.i18n);
  for (const el of document.querySelectorAll('[data-i18n-html]')) el.innerHTML = tr(el.dataset.i18nHtml);
  for (const [marker, attribute] of I18N_ATTRIBUTES) {
    for (const el of document.querySelectorAll(`[${marker}]`)) el.setAttribute(attribute, tr(el.getAttribute(marker)));
  }
}

function applyLanguage(lang) {
  const previous = currentLang;
  currentLang = isLang(lang) ? lang : DEFAULT_LANG;
  saveLang(currentLang);
  document.documentElement.lang = currentLang;
  translatePage();

  // Texts that depend on state rather than on a fixed key.
  $('cinema-btn-text').textContent = tr(sceneState.cinema ? 'cinemaExit' : 'cinemaBtn');
  syncAudioButtons();
  $('lang-btn-text').textContent = LANGS.find(l => l.code === currentLang).pill;
  for (const item of $('lang-menu').querySelectorAll('[data-lang]')) {
    item.setAttribute('aria-checked', String(item.dataset.lang === currentLang));
  }
  if (state.busy) $('status-text').textContent = tr(busyKey);
  if (state.result) renderScore(state.result);
  if (state.compare) renderCompare(state.compare);
  if (!$('toast').hidden) $('toast-text').textContent = toastMessage();
  swapPresetText(previous);
  scene.setLang(currentLang);
}

// An unedited preset in the textarea follows the UI language; edited text is left alone.
function swapPresetText(previous) {
  const input = $('prompt-input');
  const key = findPreset(input.value);
  if (!key || previous === currentLang || input.value.trim() === PRESETS[currentLang][key]) return;
  input.value = PRESETS[currentLang][key];
  updateCount();
}

function syncAudioButtons() {
  const sound = audio.isSoundEnabled();
  const music = audio.isMusicEnabled();
  $('sound-btn-text').textContent = tr(sound ? 'soundBtn' : 'soundMuted');
  $('sound-btn').querySelector('.ctrl-icon').textContent = sound ? '🔊' : '🔇';
  $('sound-btn').classList.toggle('active', sound);
  $('sound-btn').classList.toggle('off', !sound);
  $('music-btn-text').textContent = tr(music ? 'musicBtn' : 'musicMuted');
  $('music-btn').classList.toggle('active', music);
  $('music-btn').classList.toggle('off', !music);
}

function show(view) {
  const current = document.querySelector('[data-view]:not([hidden])')?.dataset.view;
  if (current && current !== view) audio.playWhoosh(view === 'compare' ? 1.3 : 1);
  for (const section of document.querySelectorAll('[data-view]')) {
    section.hidden = section.dataset.view !== view;
  }
  $('panel').classList.toggle('wide', view === 'compare');
  $('panel').scrollTop = 0;
  scene.setView(view);

  if (window.matchMedia('(max-width: 800px)').matches) {
    $('panel').scrollIntoView({ block: 'start', behavior: 'smooth' });
  }
}

let busyTimer;
let busyKey = 'busyThinking';
function setBusy(on, textKey = 'busyThinking') {
  state.busy = on;
  busyKey = textKey;
  clearInterval(busyTimer);
  $('status').classList.toggle('sr-only', !on);
  $('status-text').textContent = on ? tr(textKey) : '';
  $('status-seconds').textContent = '';
  if (on) {
    const started = Date.now();
    busyTimer = setInterval(() => {
      $('status-seconds').textContent = tr('seconds', { n: Math.floor((Date.now() - started) / 1000) });
    }, 1000);
  }
  for (const el of $('panel').querySelectorAll('button, textarea')) {
    el.disabled = on;
  }
}

let toastTimer;
let toastMessage = () => '';
// `message` is a function returning the text, so an open toast can be re-translated by applyLanguage().
function showToast(message, kind = 'error') {
  clearTimeout(toastTimer);
  toastMessage = message;
  $('toast-text').textContent = message();
  $('toast').classList.toggle('success', kind === 'success');
  $('toast').hidden = false;
  if (kind === 'success') {
    audio.playSuccess();
    toastTimer = setTimeout(hideToast, 2400);
  } else {
    audio.playError();
  }
}
function hideToast() {
  $('toast').hidden = true;
}

// Error carrying the server's stable code (see lib/app.js) so its message can be shown translated.
class ApiError extends Error {
  constructor({ error, code, params } = {}, status) {
    super(error || `Request failed (${status}).`);
    this.code = code || (error ? 'UNKNOWN' : 'REQUEST_FAILED');
    this.params = { status, ...params };
  }
}

// User-facing text for an error: the translated message for its code, plus the technical detail
// when the server sent one (only GEMINI_FAILED does: the raw Gemini API message).
function errorText(err) {
  const code = err?.code;
  if (!code) return err?.message || tr('error.UNKNOWN');
  const key = `error.${code}`;
  const text = tr(key, err.params);
  if (text === key) return err.message || tr('error.UNKNOWN');
  return code === 'GEMINI_FAILED' && err.params?.detail ? `${text} (${err.params.detail})` : text;
}

function fail(err) {
  console.warn(err);
  showToast(() => errorText(err));
  scene.setMood('sad');
}

async function post(path, body) {
  try {
    return await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    // fetch() itself failed: the server is down or unreachable.
    throw Object.assign(new Error(err.message), { code: 'NETWORK' });
  }
}

async function api(path, body) {
  const res = await post(path, body);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data, res.status);
  return data;
}

function fillList(list, items) {
  list.replaceChildren(
    ...items.map(text => {
      const li = document.createElement('li');
      li.textContent = text;
      return li;
    }),
  );
}

async function evaluate(clarifications) {
  if (state.busy) return;
  hideToast();
  scene.hideScore();
  scene.setMood('thinking');
  audio.playClack();
  audio.playCast();
  setBusy(true, 'busyThinking');

  try {
    const data = await api(
      '/api/evaluate',
      clarifications ? { prompt: state.prompt, clarifications } : { prompt: state.prompt },
    );
    setBusy(false);
    if (data.status === 'needs_clarification') {
      renderClarify(data);
    } else {
      renderResult(data);
    }
  } catch (err) {
    setBusy(false);
    fail(err);
  }
}

function renderClarify(data) {
  state.questions = data.questions;
  $('clarify-reason').textContent = data.reason;
  $('clarify-list').replaceChildren(
    ...data.questions.map((question, i) => {
      const li = document.createElement('li');
      const label = document.createElement('label');
      label.htmlFor = `answer-${i}`;
      label.textContent = question;
      const input = document.createElement('textarea');
      input.id = `answer-${i}`;
      input.rows = 2;
      input.maxLength = 1000;
      li.append(label, input);
      return li;
    }),
  );
  show('clarify');
  scene.setMood('confused');
  audio.playQuestion();
  $('answer-0')?.focus();
}

function countUp(el, target, onDone) {
  const start = performance.now();
  const duration = 950;
  const step = now => {
    const t = Math.min(1, (now - start) / duration);
    // Smooth cubic ease-out
    const value = String(Math.round(target * (1 - Math.pow(1 - t, 3))));
    if (value !== el.textContent) audio.playCount(target ? Number(value) / 100 : 0);
    el.textContent = value;
    if (t < 1) requestAnimationFrame(step);
    else onDone?.();
  };
  requestAnimationFrame(step);
}

function renderResult(data) {
  state.result = data;
  const hanko = $('overall-score');
  const crest = $('score-crest');
  crest.dataset.rank = rankFor(data.overall);
  $('rank-letter').textContent = rankFor(data.overall);
  for (const el of [crest, hanko]) {
    el.style.animation = 'none';
    void el.offsetWidth; // restart pop-in animation
    el.style.animation = '';
  }
  const xp = $('xp-fill');
  xp.style.width = '0';
  requestAnimationFrame(() => requestAnimationFrame(() => {
    xp.style.width = `${data.overall}%`;
  }));
  const flash = $('flash');
  flash.classList.remove('on');
  void flash.offsetWidth;
  flash.classList.add('on');

  audio.playStamp();
  countUp(hanko, data.overall, () => audio.playFanfare(rankFor(data.overall)));

  $('score-subtitle').textContent = `${data.overall} / 100`;
  renderScore(data);

  show('result');
  $('score-title').focus();
  scene.setMood(moodFor(data.overall));
  scene.showScore(data.overall);
}

// The parts of the result that follow the UI language (Gemini's own text stays as written).
function renderScore(data) {
  $('overall-score').setAttribute('aria-label', tr('overallScoreAria', { score: data.overall }));
  $('score-title').textContent = titleFor(data.overall);

  $('criteria-list').replaceChildren(
    ...data.criteria.map(c => {
      const li = document.createElement('li');
      li.className = 'criterion';
      const head = document.createElement('div');
      head.className = 'criterion-head';
      const name = document.createElement('span');
      const nameKey = `criterion.${c.id}`;
      name.textContent = tr(nameKey) === nameKey ? c.name : tr(nameKey);
      const score = document.createElement('span');
      score.textContent = `${c.score} / ${c.max}`;
      head.append(name, score);

      const ratio = c.max ? c.score / c.max : 0;
      const bar = document.createElement('div');
      bar.className = `bar ${ratio >= 0.8 ? '' : ratio >= 0.5 ? 'mid' : 'low'}`;
      const fill = document.createElement('span');
      bar.append(fill);
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          fill.style.width = `${ratio * 100}%`;
        }),
      );

      const feedback = document.createElement('p');
      feedback.textContent = c.feedback || tr('notAssessed');
      li.append(head, bar, feedback);
      return li;
    }),
  );

  fillList($('strengths-list'), data.strengths.length ? data.strengths : [tr('defaultStrength')]);
  fillList($('tips-list'), data.tips.length ? data.tips : [tr('defaultTip')]);
  $('improved-prompt').textContent = data.improvedPrompt;
}

function renderAnswer(el, side, streaming = false) {
  const nodes = [];
  if (side?.text) {
    const answer = document.createElement('div');
    answer.innerHTML = DOMPurify.sanitize(marked.parse(side.text));
    nodes.push(answer);
  }
  if (streaming) {
    const cursor = document.createElement('span');
    cursor.className = 'typing-cursor';
    cursor.setAttribute('aria-hidden', 'true');
    nodes.push(cursor);
  }
  if (side?.error || !side?.text) {
    const p = document.createElement('p');
    p.className = 'error';
    p.textContent = side?.error ? errorText(side.error) : tr('noAnswer');
    nodes.push(p);
  }
  el.replaceChildren(...nodes);
}

function placeholder(el, text) {
  const p = document.createElement('p');
  p.className = 'placeholder';
  p.textContent = text;
  el.replaceChildren(p);
}

async function streamEvents(path, body, onEvent) {
  const res = await post(path, body);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(data, res.status);
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) if (line.trim()) onEvent(JSON.parse(line));
  }
  if (buffer.trim()) onEvent(JSON.parse(buffer));
}

// Draws both compare columns from state.compare, so applyLanguage() can redraw them in a new language.
// While streaming, a side without text keeps its placeholder; once finished, errors and cut-off
// answers are shown.
function renderCompare({ sides, finished }) {
  for (const side of Object.values(sides)) {
    const el = $(`compare-${side.name}`);
    if (!finished) {
      if (side.text) renderAnswer(el, { text: side.text }, side.status === 'streaming');
      else placeholder(el, tr(side.placeholderKey));
    } else if (side.status === 'error') {
      renderAnswer(el, { text: side.text, error: side.error });
    } else if (side.text) {
      renderAnswer(el, { text: side.text });
    } else {
      renderAnswer(el, { error: { message: tr('answerCutOff') } });
    }
  }
}

async function tryIt() {
  if (state.busy || !state.result) return;
  hideToast();
  audio.playClack();

  $('compare-original-prompt').textContent = state.prompt;
  $('compare-improved-prompt').textContent = state.result.improvedPrompt;
  const sides = {
    original: { name: 'original', placeholderKey: 'placeholderOriginal', text: '', status: 'pending' },
    improved: { name: 'improved', placeholderKey: 'placeholderImproved', text: '', status: 'pending' },
  };
  const compare = (state.compare = { sides, finished: false });
  renderCompare(compare);

  show('compare');
  scene.setMood('thinking');
  setBusy(true, 'busyComparing');

  let frame = 0;
  const render = () => {
    frame = 0;
    renderCompare(compare);
  };

  try {
    await streamEvents(
      '/api/try',
      { original: state.prompt, improved: state.result.improvedPrompt },
      event => {
        const side = sides[event.side];
        if (!side) return;
        if (event.text) {
          side.text += event.text;
          side.status = 'streaming';
          audio.playStream();
          frame ||= requestAnimationFrame(render);
        } else if (event.done) {
          side.status = 'done';
        } else if (event.error) {
          side.status = 'error';
          side.error = new ApiError(event);
        }
      },
    );
    cancelAnimationFrame(frame);
    compare.finished = true;
    renderCompare(compare);
    const success = sides.improved.status === 'done';
    scene.setMood(success ? 'happy' : 'sad');
    if (success) {
      audio.playChime();
      setTimeout(() => audio.playSparkle(6), 350);
    } else {
      audio.playError();
    }
  } catch (err) {
    cancelAnimationFrame(frame);
    for (const side of Object.values(sides)) Object.assign(side, { status: 'error', error: err });
    compare.finished = true;
    renderCompare(compare);
    fail(err);
  } finally {
    setBusy(false);
    $('compare-title').focus();
  }
}

function updateCount() {
  $('char-count').textContent = `${$('prompt-input').value.length} / ${MAX_CHARS}`;
}

function goToInput() {
  show('input');
  scene.hideScore();
  scene.setMood('idle');
  updateCount();
  $('prompt-input').focus();
}

function submitPrompt() {
  const prompt = $('prompt-input').value.trim();
  if (!prompt) {
    showToast(() => tr('toastPromptEmpty'));
    return;
  }
  state.prompt = prompt;
  evaluate();
}

// Preset Pills click handler
for (const pill of document.querySelectorAll('.preset-pill')) {
  pill.addEventListener('click', () => {
    const text = PRESETS[currentLang][pill.dataset.preset];
    if (text) {
      $('prompt-input').value = text;
      updateCount();
      hideToast();
      audio.playPop(520);
      scene.setMood('neutral');
      $('prompt-input').focus();
    }
  });
}

// Topbar controls
$('sound-btn').addEventListener('click', () => {
  audio.toggleSound();
  syncAudioButtons();
});

$('music-btn').addEventListener('click', () => {
  audio.toggleMusic();
  audio.playPop(audio.isMusicEnabled() ? 660 : 380);
  syncAudioButtons();
});

$('cinema-btn').addEventListener('click', () => {
  const isCinema = document.body.classList.toggle('cinema-mode');
  scene.toggleCinema(isCinema);
  $('cinema-btn-text').textContent = tr(isCinema ? 'cinemaExit' : 'cinemaBtn');
  $('cinema-btn').classList.toggle('active', isCinema);
  audio.playCinema(isCinema);
});

$('guide-btn').addEventListener('click', () => {
  $('guide-modal').hidden = false;
  audio.playOpen();
});
for (const id of ['guide-close', 'guide-ok']) {
  $(id).addEventListener('click', () => {
    $('guide-modal').hidden = true;
    audio.playClose();
  });
}

// Language menu: the pill opens a small menu with one item per language.
function setLangMenu(open, { focus = false } = {}) {
  $('lang-menu').hidden = !open;
  $('lang-btn').setAttribute('aria-expanded', String(open));
  if (open && focus) $('lang-menu').querySelector('[aria-checked="true"]')?.focus();
}
$('lang-btn').addEventListener('click', event => {
  const open = $('lang-menu').hidden;
  setLangMenu(open, { focus: event.detail === 0 }); // keyboard activation moves focus into the menu
  audio.playPop(open ? 600 : 420);
});
$('lang-menu').addEventListener('click', event => {
  const item = event.target.closest('[data-lang]');
  if (!item) return;
  setLangMenu(false);
  $('lang-btn').focus();
  if (item.dataset.lang === currentLang) return;
  applyLanguage(item.dataset.lang);
  audio.playPop(600);
  setTimeout(() => audio.playPop(800), 70);
});
$('lang-menu').addEventListener('keydown', event => {
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
  event.preventDefault();
  const items = [...$('lang-menu').querySelectorAll('[data-lang]')];
  const step = event.key === 'ArrowDown' ? 1 : -1;
  items[(items.indexOf(document.activeElement) + step + items.length) % items.length].focus();
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !$('lang-menu').hidden) {
    setLangMenu(false);
    $('lang-btn').focus();
  }
});
document.addEventListener('pointerdown', event => {
  if (!$('lang-menu').hidden && !event.target.closest('.lang-wrap')) setLangMenu(false);
});

// Audio can only start after a user gesture; keep trying until the browser allows it.
const unlockAudio = () => {
  audio.unlock();
  if (audio.isUnlocked()) {
    for (const type of ['pointerdown', 'pointerup', 'keydown']) window.removeEventListener(type, unlockAudio, true);
  }
};
for (const type of ['pointerdown', 'pointerup', 'keydown']) window.addEventListener(type, unlockAudio, true);

$('scene').addEventListener('pet', audio.playPet);

// Soft tick when the mouse moves onto a button.
document.addEventListener('pointerover', event => {
  if (event.pointerType !== 'mouse') return;
  const button = event.target.closest('button');
  if (button && !button.disabled && !button.contains(event.relatedTarget)) audio.playHover();
});
document.addEventListener('input', event => {
  if (event.target.matches('textarea')) audio.playType();
});

$('prompt-input').addEventListener('input', () => {
  updateCount();
  hideToast();
});
$('prompt-input').addEventListener('keydown', event => {
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    submitPrompt();
  }
});
$('evaluate-btn').addEventListener('click', submitPrompt);

$('clarify-form').addEventListener('submit', event => {
  event.preventDefault();
  const clarifications = state.questions.map((question, i) => ({
    question,
    answer: $(`answer-${i}`).value.trim(),
  }));
  evaluate(clarifications);
});
$('skip-btn').addEventListener('click', () => evaluate([]));

$('copy-btn').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(state.result.improvedPrompt);
    showToast(() => tr('toastCopied'), 'success');
  } catch {
    showToast(() => tr('toastCopyError'));
  }
});

$('use-btn').addEventListener('click', () => {
  const improved = state.result.improvedPrompt;
  $('prompt-input').value = improved.slice(0, MAX_CHARS);
  audio.playPop(520);
  goToInput();
  if (improved.length > MAX_CHARS) {
    showToast(() => tr('toastTruncated', { max: MAX_CHARS }));
  }
});

$('try-btn').addEventListener('click', tryIt);
$('back-btn').addEventListener('click', () => {
  show('result');
  $('score-title').focus();
  scene.setMood(moodFor(state.result.overall));
  audio.playPop(480);
});

for (const button of document.querySelectorAll('.restart')) {
  button.addEventListener('click', () => {
    state.prompt = '';
    state.questions = [];
    state.result = null;
    $('prompt-input').value = '';
    hideToast();
    audio.playPop(400);
    goToInput();
  });
}

$('toast-close').addEventListener('click', hideToast);

// Initial initialization
applyLanguage(currentLang);
updateCount();
scene.setMood('idle');
scene.setView('input');
