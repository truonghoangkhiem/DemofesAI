import { marked } from 'marked';
import DOMPurify from 'dompurify';

const $ = id => document.getElementById(id);
const NO_SCENE = { setMood() {}, showScore() {}, hideScore() {} };
const MAX_CHARS = 4000;

// The 3D scene loads in the background so a slow or failing CDN never blocks the UI.
// Until it is ready, calls go to a stub; the latest mood/score is replayed once it loads.
let realScene = NO_SCENE;
const sceneState = { mood: 'idle', score: null };
const scene = {
  setMood(mood) { sceneState.mood = mood; realScene.setMood(mood); },
  showScore(score) { sceneState.score = score; realScene.showScore(score); },
  hideScore() { sceneState.score = null; realScene.hideScore(); },
};
import('./scene/index.js')
  .then(module => module.initScene($('scene')))
  .then(loaded => {
    realScene = loaded;
    realScene.setMood(sceneState.mood);
    if (sceneState.score !== null) realScene.showScore(sceneState.score);
  })
  .catch(err => console.error('3D scene unavailable:', err));

const state = { prompt: '', questions: [], result: null, busy: false };

const moodFor = score => (score >= 80 ? 'happy' : score >= 50 ? 'neutral' : 'sad');
const titleFor = score => (score >= 80 ? 'Excellent prompt!' : score >= 50 ? 'Good start' : 'Needs work');

function show(view) {
  for (const section of document.querySelectorAll('[data-view]')) section.hidden = section.dataset.view !== view;
  $('panel').classList.toggle('wide', view === 'compare');
  $('panel').scrollTop = 0;
  if (window.matchMedia('(max-width: 800px)').matches) $('panel').scrollIntoView({ block: 'start' });
}

// #status stays in the accessibility tree (only visually hidden when idle) so its live region is announced.
// While busy, a visible seconds counter shows the demo is still working (Gemini can take 10–20 s).
let busyTimer;
function setBusy(on, text = 'Sensei is thinking…') {
  state.busy = on;
  clearInterval(busyTimer);
  $('status').classList.toggle('sr-only', !on);
  $('status-text').textContent = on ? text : '';
  $('status-seconds').textContent = '';
  if (on) {
    const started = Date.now();
    busyTimer = setInterval(() => {
      $('status-seconds').textContent = `${Math.floor((Date.now() - started) / 1000)} s`;
    }, 1000);
  }
  for (const el of $('panel').querySelectorAll('button, textarea')) el.disabled = on;
}

let toastTimer;
function showToast(text, kind = 'error') {
  clearTimeout(toastTimer);
  $('toast-text').textContent = text;
  $('toast').classList.toggle('success', kind === 'success');
  $('toast').hidden = false;
  if (kind === 'success') toastTimer = setTimeout(hideToast, 2000);
}
function hideToast() {
  $('toast').hidden = true;
}

function fail(err) {
  showToast(err.message || 'Something went wrong.');
  scene.setMood('sad');
}

async function api(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status}).`);
  return data;
}

function fillList(list, items) {
  list.replaceChildren(...items.map(text => {
    const li = document.createElement('li');
    li.textContent = text;
    return li;
  }));
}

async function evaluate(clarifications) {
  if (state.busy) return;
  hideToast();
  scene.hideScore();
  scene.setMood('thinking');
  setBusy(true);
  try {
    const data = await api('/api/evaluate', clarifications ? { prompt: state.prompt, clarifications } : { prompt: state.prompt });
    setBusy(false);
    if (data.status === 'needs_clarification') renderClarify(data);
    else renderResult(data);
  } catch (err) {
    setBusy(false);
    fail(err);
  }
}

function renderClarify(data) {
  state.questions = data.questions;
  $('clarify-reason').textContent = data.reason;
  $('clarify-list').replaceChildren(...data.questions.map((question, i) => {
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
  }));
  show('clarify');
  scene.setMood('confused');
  $('answer-0')?.focus();
}

function countUp(el, target) {
  const start = performance.now();
  const duration = 900;
  const step = now => {
    const t = Math.min(1, (now - start) / duration);
    el.textContent = String(Math.round(target * (1 - (1 - t) ** 3)));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function renderResult(data) {
  state.result = data;
  const hanko = $('overall-score');
  hanko.style.animation = 'none';
  void hanko.offsetWidth; // restart the stamp animation
  hanko.style.animation = '';
  countUp(hanko, data.overall);
  hanko.setAttribute('aria-label', `Overall score: ${data.overall} out of 100`);
  $('score-title').textContent = titleFor(data.overall);
  $('score-subtitle').textContent = `${data.overall} / 100`;

  $('criteria-list').replaceChildren(...data.criteria.map(c => {
    const li = document.createElement('li');
    li.className = 'criterion';
    const head = document.createElement('div');
    head.className = 'criterion-head';
    const name = document.createElement('span');
    name.textContent = c.name;
    const score = document.createElement('span');
    score.textContent = `${c.score} / ${c.max}`;
    head.append(name, score);
    const ratio = c.max ? c.score / c.max : 0;
    const bar = document.createElement('div');
    bar.className = `bar ${ratio >= 0.8 ? '' : ratio >= 0.5 ? 'mid' : 'low'}`;
    const fill = document.createElement('span');
    bar.append(fill);
    requestAnimationFrame(() => requestAnimationFrame(() => { fill.style.width = `${ratio * 100}%`; }));
    const feedback = document.createElement('p');
    feedback.textContent = c.feedback;
    li.append(head, bar, feedback);
    return li;
  }));

  fillList($('strengths-list'), data.strengths.length ? data.strengths : ['Keep going — every prompt is practice.']);
  fillList($('tips-list'), data.tips.length ? data.tips : ['No extra tips this time.']);
  $('improved-prompt').textContent = data.improvedPrompt;

  show('result');
  $('score-title').focus();
  scene.setMood(moodFor(data.overall));
  scene.showScore(data.overall);
}

// Renders markdown answer text (sanitized), an optional error line, and a typing cursor while streaming.
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
    p.textContent = side?.error || 'No answer.';
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

// Reads the NDJSON stream from /api/try and calls onEvent for each parsed line.
async function streamEvents(path, body, onEvent) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Request failed (${res.status}).`);
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

async function tryIt() {
  if (state.busy || !state.result) return;
  hideToast();
  $('compare-original-prompt').textContent = state.prompt;
  $('compare-improved-prompt').textContent = state.result.improvedPrompt;
  placeholder($('compare-original'), 'Gemini is thinking…');
  placeholder($('compare-improved'), 'Gemini is thinking…');
  show('compare');
  scene.setMood('thinking');
  setBusy(true, 'Running both prompts…');

  const sides = {
    original: { el: $('compare-original'), text: '', status: 'pending' },
    improved: { el: $('compare-improved'), text: '', status: 'pending' },
  };
  // Markdown is re-rendered at most once per frame while text streams in.
  let frame = 0;
  const render = () => {
    frame = 0;
    for (const side of Object.values(sides)) {
      if (side.text) renderAnswer(side.el, { text: side.text }, side.status === 'streaming');
    }
  };

  try {
    await streamEvents('/api/try', { original: state.prompt, improved: state.result.improvedPrompt }, event => {
      const side = sides[event.side];
      if (!side) return;
      if (event.text) {
        side.text += event.text;
        side.status = 'streaming';
        frame ||= requestAnimationFrame(render);
      } else if (event.done) {
        side.status = 'done';
      } else if (event.error) {
        side.status = 'error';
        side.error = event.error;
      }
    });
    cancelAnimationFrame(frame);
    for (const side of Object.values(sides)) {
      if (side.status === 'error' && !side.text) renderAnswer(side.el, { error: side.error });
      else if (side.text) renderAnswer(side.el, { text: side.text, error: side.status === 'error' ? side.error : null });
      else renderAnswer(side.el, { error: 'The answer was cut off. Please try again.' });
    }
    scene.setMood(sides.improved.status === 'done' ? 'happy' : 'sad');
  } catch (err) {
    cancelAnimationFrame(frame);
    for (const side of Object.values(sides)) renderAnswer(side.el, { text: side.text, error: err.message });
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
    showToast('Write a prompt first.');
    return;
  }
  state.prompt = prompt;
  evaluate();
}

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
  const clarifications = state.questions.map((question, i) => ({ question, answer: $(`answer-${i}`).value.trim() }));
  evaluate(clarifications);
});
$('skip-btn').addEventListener('click', () => evaluate([]));

$('copy-btn').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(state.result.improvedPrompt);
    showToast('Copied!', 'success');
  } catch {
    showToast('Could not copy. Select the text and copy it manually.');
  }
});
$('use-btn').addEventListener('click', () => {
  const improved = state.result.improvedPrompt;
  $('prompt-input').value = improved.slice(0, MAX_CHARS);
  goToInput();
  if (improved.length > MAX_CHARS) {
    showToast(`The improved prompt was cut to ${MAX_CHARS} characters. Check the end before evaluating.`);
  }
});
$('try-btn').addEventListener('click', tryIt);
$('back-btn').addEventListener('click', () => {
  show('result');
  $('score-title').focus();
  scene.setMood(moodFor(state.result.overall));
});
for (const button of document.querySelectorAll('.restart')) {
  button.addEventListener('click', () => {
    state.prompt = '';
    state.questions = [];
    state.result = null;
    $('prompt-input').value = '';
    hideToast();
    goToInput();
  });
}
$('toast-close').addEventListener('click', hideToast);

updateCount();
scene.setMood('idle');
