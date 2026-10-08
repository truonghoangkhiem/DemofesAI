import { marked } from 'marked';
import DOMPurify from 'dompurify';
import * as audio from './audio.js';

const $ = id => document.getElementById(id);
const NO_SCENE = {
  setMood() {},
  showScore() {},
  hideScore() {},
  setView() {},
  toggleCinema() {},
  pet() {},
  burst() {},
};
const MAX_CHARS = 4000;

// Presets in both Vietnamese and English
const PRESETS = {
  vi: {
    blog: 'Viết một bài blog ngắn về trí tuệ nhân tạo (AI).',
    email: 'Viết email xin nghỉ phép gửi sếp.',
    marketing:
      'Đóng vai Giám đốc Marketing, hãy lập kế hoạch ra mắt sản phẩm nước ép organic cho sinh viên tại TP.HCM trong 3 tháng tới theo cấu trúc: Mục tiêu, Khách hàng mục tiêu, Kênh truyền thông, và Dự toán ngân sách.',
    coding:
      'Bạn là Senior Python Engineer. Hãy viết hàm tối ưu đọc file CSV 500MB và tính tổng doanh thu theo từng tháng bằng Pandas/Polars, xử lý ngoại lệ dữ liệu bị thiếu và có kèm docstring chuẩn.',
  },
  en: {
    blog: 'Write a short blog post about artificial intelligence (AI).',
    email: 'Write an email requesting sick leave to my manager.',
    marketing:
      'Act as a Marketing Director. Create a 3-month launch plan for a new organic juice targeting college students in Ho Chi Minh City, structured into: Objectives, Audience, Channels, and Budget.',
    coding:
      'You are a Senior Python Engineer. Write an optimized function to parse a 500MB CSV and aggregate monthly revenue with Pandas/Polars, handling missing values with type hints.',
  },
};

// UI Translations
const I18N = {
  vi: {
    brandSub: 'Trợ lý Tối ưu Prompt AI · Phong cách Anime 3D',
    cinemaBtn: 'Toàn cảnh 3D',
    cinemaExit: 'Xem bảng UI',
    soundBtn: 'Âm thanh',
    soundMuted: 'Tắt tiếng',
    guideBtn: 'Workshop',
    langPill: '🇻🇳 VI',
    mascotTip: 'Nhấp vào Sensei để tương tác & nhận lời chúc! 💖',
    inputTitle: 'Viết Prompt của bạn',
    inputHint: 'Sensei sẽ chấm điểm theo quy tắc 3C (Rõ ràng · Ngắn gọn · Nhất quán) và khung Role · Task · Context · Format.',
    presetsLabel: 'Prompt mẫu thử nhanh cho Workshop:',
    evaluateBtn: 'Đánh giá ngay',
    clarifyTitle: 'Sensei cần hỏi rõ thêm một chút',
    skipBtn: 'Bỏ qua & Chấm điểm luôn',
    submitAnswers: 'Gửi câu trả lời',
    scoreHeading: 'Điểm số',
    rubricHeading: 'Chi tiết 9 tiêu chí đánh giá',
    strengthsHeading: '🌸 Điểm bạn làm rất tốt',
    tipsHeading: '✨ Lời khuyên vàng từ Sensei',
    improvedHeading: '📜 Prompt đã được tối ưu hóa',
    copyBtn: '📋 Sao chép',
    useBtn: '✨ Dùng prompt này',
    tryBtn: '⚔️ Chạy thử so sánh',
    restartBtn: '↩ Bắt đầu lại với prompt khác',
    compareTitle: 'Cùng một AI, hai kết quả khác biệt!',
    backBtn: '⬅ Quay lại kết quả',
    busyThinking: 'Sensei đang suy nghĩ & phân tích prompt…',
    busyComparing: 'Đang chạy song song cả 2 prompt với Gemini…',
    toastPromptEmpty: 'Vui lòng nhập prompt trước.',
    toastCopied: 'Đã sao chép prompt cải tiến!',
    toastCopyError: 'Không thể tự động sao chép. Vui lòng bôi đen và nhấn Ctrl+C.',
    placeholderOriginal: 'Gemini đang trả lời prompt ban đầu…',
    placeholderImproved: 'Gemini đang trả lời prompt đã tối ưu…',
    titleExcellent: 'Xuất sắc! (Sugoi)',
    titleGood: 'Khá tốt, hãy tiếp tục!',
    titleNeedsWork: 'Cần hoàn thiện thêm',
  },
  en: {
    brandSub: 'Your AI Prompt Coach · 3D Anime Edition',
    cinemaBtn: '3D Scenic',
    cinemaExit: 'Show UI',
    soundBtn: 'Sound',
    soundMuted: 'Muted',
    guideBtn: 'Workshop',
    langPill: '🇬🇧 EN',
    mascotTip: 'Click on Sensei to interact & get cheer! 💖',
    inputTitle: 'Write your prompt',
    inputHint: 'Sensei scores it with the 3C rule (Concise · Clear · Consistent) and the Role · Task · Context · Format framework.',
    presetsLabel: 'Quick Workshop Demo Presets:',
    evaluateBtn: 'Evaluate',
    clarifyTitle: 'Sensei has a few questions',
    skipBtn: 'Skip & score anyway',
    submitAnswers: 'Submit answers',
    scoreHeading: 'Score',
    rubricHeading: 'Rubric Criteria',
    strengthsHeading: '🌸 What you did well',
    tipsHeading: "✨ Sensei's tips",
    improvedHeading: '📜 Improved prompt',
    copyBtn: '📋 Copy',
    useBtn: '✨ Use this',
    tryBtn: '⚔️ Try it',
    restartBtn: '↩ Start over',
    compareTitle: 'Same AI, two prompts',
    backBtn: '⬅ Back to result',
    busyThinking: 'Sensei is thinking & scoring…',
    busyComparing: 'Running both prompts side by side…',
    toastPromptEmpty: 'Write a prompt first.',
    toastCopied: 'Copied to clipboard!',
    toastCopyError: 'Could not copy. Select the text and copy manually.',
    placeholderOriginal: 'Gemini is answering the original prompt…',
    placeholderImproved: 'Gemini is answering the improved prompt…',
    titleExcellent: 'Excellent prompt! (Sugoi)',
    titleGood: 'Good start, keep going!',
    titleNeedsWork: 'Needs work',
  },
};

let currentLang = localStorage.getItem('prompt_sensei_lang') || 'vi';

// 3D Scene setup and state
let realScene = NO_SCENE;
const sceneState = { mood: 'idle', score: null, view: 'input', cinema: false };

const scene = {
  setMood(mood) {
    sceneState.mood = mood;
    realScene.setMood(mood);
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
};

import('./scene/index.js')
  .then(module => module.initScene($('scene'), $('panel')))
  .then(loaded => {
    realScene = loaded;
    realScene.setMood(sceneState.mood);
    realScene.setView(sceneState.view);
    if (sceneState.score !== null) realScene.showScore(sceneState.score);
  })
  .catch(err => console.error('3D scene unavailable:', err));

const state = { prompt: '', questions: [], result: null, busy: false };

const moodFor = score => (score >= 80 ? 'happy' : score >= 50 ? 'neutral' : 'sad');
const titleFor = score => {
  const dict = I18N[currentLang];
  return score >= 80 ? dict.titleExcellent : score >= 50 ? dict.titleGood : dict.titleNeedsWork;
};

function applyLanguage(lang) {
  currentLang = lang;
  localStorage.setItem('prompt_sensei_lang', lang);
  const dict = I18N[lang];

  $('brand-sub').textContent = dict.brandSub;
  $('cinema-btn-text').textContent = sceneState.cinema ? dict.cinemaExit : dict.cinemaBtn;
  $('sound-btn-text').textContent = audio.isSoundEnabled() ? dict.soundBtn : dict.soundMuted;
  $('guide-btn-text').textContent = dict.guideBtn;
  $('lang-btn').querySelector('.ctrl-text').textContent = dict.langPill;
  $('mascot-tip-text').textContent = dict.mascotTip;

  $('input-title').textContent = dict.inputTitle;
  $('input-hint').textContent = dict.inputHint;
  $('presets-label').textContent = dict.presetsLabel;
  $('evaluate-btn-text').textContent = dict.evaluateBtn;

  $('clarify-title').textContent = dict.clarifyTitle;
  $('skip-btn').textContent = dict.skipBtn;
  $('clarify-submit-btn').textContent = dict.submitAnswers;

  $('rubric-heading').textContent = dict.rubricHeading;
  $('strengths-heading').textContent = dict.strengthsHeading;
  $('tips-heading').textContent = dict.tipsHeading;
  $('improved-heading').textContent = dict.improvedHeading;

  $('copy-btn').textContent = dict.copyBtn;
  $('use-btn').textContent = dict.useBtn;
  $('try-btn').textContent = dict.tryBtn;
  $('restart-btn-1').textContent = dict.restartBtn;
  $('restart-btn-2').textContent = dict.restartBtn;

  $('compare-title').textContent = dict.compareTitle;
  $('back-btn').textContent = dict.backBtn;

  if (state.result) {
    $('score-title').textContent = titleFor(state.result.overall);
  }
}

function show(view) {
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
function setBusy(on, textKey = 'busyThinking') {
  state.busy = on;
  clearInterval(busyTimer);
  $('status').classList.toggle('sr-only', !on);
  const text = on ? I18N[currentLang][textKey] || textKey : '';
  $('status-text').textContent = text;
  $('status-seconds').textContent = '';
  if (on) {
    const started = Date.now();
    busyTimer = setInterval(() => {
      $('status-seconds').textContent = `${Math.floor((Date.now() - started) / 1000)} s`;
    }, 1000);
  }
  for (const el of $('panel').querySelectorAll('button, textarea')) {
    el.disabled = on;
  }
}

let toastTimer;
function showToast(text, kind = 'error') {
  clearTimeout(toastTimer);
  $('toast-text').textContent = text;
  $('toast').classList.toggle('success', kind === 'success');
  $('toast').hidden = false;
  if (kind === 'success') toastTimer = setTimeout(hideToast, 2400);
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
  $('answer-0')?.focus();
}

function countUp(el, target) {
  const start = performance.now();
  const duration = 950;
  const step = now => {
    const t = Math.min(1, (now - start) / duration);
    // Smooth cubic ease-out
    el.textContent = String(Math.round(target * (1 - Math.pow(1 - t, 3))));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function renderResult(data) {
  state.result = data;
  const hanko = $('overall-score');
  hanko.style.animation = 'none';
  void hanko.offsetWidth; // restart stamp animation
  hanko.style.animation = '';

  countUp(hanko, data.overall);
  audio.playStamp();
  if (data.overall >= 80) {
    setTimeout(audio.playChime, 400);
  }

  hanko.setAttribute('aria-label', `Overall score: ${data.overall} out of 100`);
  $('score-title').textContent = titleFor(data.overall);
  $('score-subtitle').textContent = `${data.overall} / 100`;

  $('criteria-list').replaceChildren(
    ...data.criteria.map(c => {
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
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          fill.style.width = `${ratio * 100}%`;
        }),
      );

      const feedback = document.createElement('p');
      feedback.textContent = c.feedback;
      li.append(head, bar, feedback);
      return li;
    }),
  );

  const defaultStrengths = currentLang === 'vi' ? ['Hãy tiếp tục luyện tập — mỗi prompt là một bài học!'] : ['Keep going — every prompt is practice.'];
  const defaultTips = currentLang === 'vi' ? ['Không có lời khuyên bổ sung cho lần này.'] : ['No extra tips this time.'];

  fillList($('strengths-list'), data.strengths.length ? data.strengths : defaultStrengths);
  fillList($('tips-list'), data.tips.length ? data.tips : defaultTips);
  $('improved-prompt').textContent = data.improvedPrompt;

  show('result');
  $('score-title').focus();
  scene.setMood(moodFor(data.overall));
  scene.showScore(data.overall);
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
    p.textContent = side?.error || (currentLang === 'vi' ? 'Không có câu trả lời.' : 'No answer.');
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
  audio.playClack();

  $('compare-original-prompt').textContent = state.prompt;
  $('compare-improved-prompt').textContent = state.result.improvedPrompt;
  placeholder($('compare-original'), I18N[currentLang].placeholderOriginal);
  placeholder($('compare-improved'), I18N[currentLang].placeholderImproved);

  show('compare');
  scene.setMood('thinking');
  setBusy(true, 'busyComparing');

  const sides = {
    original: { el: $('compare-original'), text: '', status: 'pending' },
    improved: { el: $('compare-improved'), text: '', status: 'pending' },
  };

  let frame = 0;
  const render = () => {
    frame = 0;
    for (const side of Object.values(sides)) {
      if (side.text) renderAnswer(side.el, { text: side.text }, side.status === 'streaming');
    }
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
          frame ||= requestAnimationFrame(render);
        } else if (event.done) {
          side.status = 'done';
        } else if (event.error) {
          side.status = 'error';
          side.error = event.error;
        }
      },
    );
    cancelAnimationFrame(frame);
    for (const side of Object.values(sides)) {
      if (side.status === 'error' && !side.text) renderAnswer(side.el, { error: side.error });
      else if (side.text) renderAnswer(side.el, { text: side.text, error: side.status === 'error' ? side.error : null });
      else renderAnswer(side.el, { error: currentLang === 'vi' ? 'Câu trả lời bị ngắt quãng. Hãy thử lại.' : 'The answer was cut off. Please try again.' });
    }
    const success = sides.improved.status === 'done';
    scene.setMood(success ? 'happy' : 'sad');
    if (success) audio.playChime();
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
    showToast(I18N[currentLang].toastPromptEmpty);
    return;
  }
  state.prompt = prompt;
  evaluate();
}

// Preset Pills click handler
for (const pill of document.querySelectorAll('.preset-pill')) {
  pill.addEventListener('click', () => {
    const presetKey = pill.dataset.preset;
    const text = PRESETS[currentLang][presetKey] || PRESETS.vi[presetKey];
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
  const on = audio.toggleSound();
  $('sound-btn-text').textContent = on ? I18N[currentLang].soundBtn : I18N[currentLang].soundMuted;
  $('sound-btn').classList.toggle('active', on);
});

$('cinema-btn').addEventListener('click', () => {
  const isCinema = document.body.classList.toggle('cinema-mode');
  scene.toggleCinema(isCinema);
  $('cinema-btn-text').textContent = isCinema ? I18N[currentLang].cinemaExit : I18N[currentLang].cinemaBtn;
  $('cinema-btn').classList.toggle('active', isCinema);
  audio.playPop(440);
});

$('guide-btn').addEventListener('click', () => {
  $('guide-modal').hidden = false;
  audio.playPop(500);
});
$('guide-close').addEventListener('click', () => {
  $('guide-modal').hidden = true;
});
$('guide-ok').addEventListener('click', () => {
  $('guide-modal').hidden = true;
  audio.playPop(540);
});

$('lang-btn').addEventListener('click', () => {
  const nextLang = currentLang === 'vi' ? 'en' : 'vi';
  applyLanguage(nextLang);
  audio.playPop(600);
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
    audio.playPop(640);
    showToast(I18N[currentLang].toastCopied, 'success');
  } catch {
    showToast(I18N[currentLang].toastCopyError);
  }
});

$('use-btn').addEventListener('click', () => {
  const improved = state.result.improvedPrompt;
  $('prompt-input').value = improved.slice(0, MAX_CHARS);
  audio.playPop(520);
  goToInput();
  if (improved.length > MAX_CHARS) {
    showToast(`Prompt was truncated to ${MAX_CHARS} characters.`);
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
