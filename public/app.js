import { marked } from 'marked';
import DOMPurify from 'dompurify';

const $ = id => document.getElementById(id);
const NO_SCENE = { setMood() {}, showScore() {}, hideScore() {} };
const MAX_CHARS = 4000;

const scene = await import('./scene/index.js')
  .then(module => module.initScene($('scene')))
  .catch(err => {
    console.error('3D scene unavailable:', err);
    return NO_SCENE;
  });

const state = { prompt: '', questions: [], result: null, busy: false };

const moodFor = score => (score >= 80 ? 'happy' : score >= 50 ? 'neutral' : 'sad');
const titleFor = score => (score >= 80 ? 'Excellent prompt!' : score >= 50 ? 'Good start' : 'Needs work');

function show(view) {
  for (const section of document.querySelectorAll('[data-view]')) section.hidden = section.dataset.view !== view;
  $('panel').classList.toggle('wide', view === 'compare');
  $('panel').scrollTop = 0;
  if (window.matchMedia('(max-width: 800px)').matches) $('panel').scrollIntoView({ block: 'start' });
}

function setBusy(on, text = 'Sensei is thinking…') {
  state.busy = on;
  $('status').hidden = !on;
  $('status-text').textContent = text;
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
  scene.setMood(moodFor(data.overall));
  scene.showScore(data.overall);
}

function renderAnswer(el, side) {
  if (side?.text) {
    el.innerHTML = DOMPurify.sanitize(marked.parse(side.text));
  } else {
    const p = document.createElement('p');
    p.className = 'error';
    p.textContent = side?.error || 'No answer.';
    el.replaceChildren(p);
  }
}

function placeholder(el, text) {
  const p = document.createElement('p');
  p.className = 'placeholder';
  p.textContent = text;
  el.replaceChildren(p);
}

async function tryIt() {
  if (state.busy || !state.result) return;
  hideToast();
  $('compare-original-prompt').textContent = state.prompt;
  $('compare-improved-prompt').textContent = state.result.improvedPrompt;
  placeholder($('compare-original'), 'Asking Gemini…');
  placeholder($('compare-improved'), 'Asking Gemini…');
  show('compare');
  scene.setMood('thinking');
  setBusy(true, 'Running both prompts…');
  try {
    const data = await api('/api/try', { original: state.prompt, improved: state.result.improvedPrompt });
    renderAnswer($('compare-original'), data.original);
    renderAnswer($('compare-improved'), data.improved);
    scene.setMood(data.improved?.text ? 'happy' : 'sad');
  } catch (err) {
    renderAnswer($('compare-original'), { error: err.message });
    renderAnswer($('compare-improved'), { error: err.message });
    fail(err);
  } finally {
    setBusy(false);
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

$('prompt-input').addEventListener('input', updateCount);
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
  $('prompt-input').value = state.result.improvedPrompt.slice(0, MAX_CHARS);
  goToInput();
});
$('try-btn').addEventListener('click', tryIt);
$('back-btn').addEventListener('click', () => {
  show('result');
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
