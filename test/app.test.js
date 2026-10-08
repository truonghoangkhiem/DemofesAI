import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp, MISSING_KEY_MESSAGE } from '../lib/app.js';
import { GeminiError } from '../lib/gemini.js';

async function withServer(gemini, fn) {
  const server = createApp({ gemini }).listen(0);
  await once(server, 'listening');
  try {
    await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    server.close();
  }
}

function post(base, path, body, { raw } = {}) {
  return fetch(base + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: raw ?? JSON.stringify(body),
  });
}

const evaluation = { status: 'evaluated', overall: 50, criteria: [], strengths: [], improvedPrompt: 'B', tips: [] };

function fakeGemini(overrides = {}) {
  const calls = { evaluate: [], runPrompt: [] };
  const gemini = {
    async evaluate(...args) { calls.evaluate.push(args); return evaluation; },
    async runPrompt(prompt) { calls.runPrompt.push(prompt); return `answer to ${prompt}`; },
    ...overrides,
  };
  return { gemini, calls };
}

test('serves the static page', async () => {
  await withServer(fakeGemini().gemini, async base => {
    const res = await fetch(base + '/');
    assert.equal(res.status, 200);
    assert.match(await res.text(), /Prompt Sensei/);
  });
});

test('evaluate passes a trimmed prompt and returns the result', async () => {
  const { gemini, calls } = fakeGemini();
  await withServer(gemini, async base => {
    const res = await post(base, '/api/evaluate', { prompt: '  Write a haiku  ' });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), evaluation);
    assert.deepEqual(calls.evaluate[0], ['Write a haiku', undefined]);
  });
});

test('evaluate passes trimmed clarifications, including an empty skip list', async () => {
  const { gemini, calls } = fakeGemini();
  await withServer(gemini, async base => {
    await post(base, '/api/evaluate', { prompt: 'p', clarifications: [{ question: ' Who? ', answer: ' Kids ' }] });
    await post(base, '/api/evaluate', { prompt: 'p', clarifications: [] });
    assert.deepEqual(calls.evaluate[0][1], [{ question: 'Who?', answer: 'Kids' }]);
    assert.deepEqual(calls.evaluate[1][1], []);
  });
});

test('evaluate accepts a 4000-character Vietnamese prompt', async () => {
  const { gemini, calls } = fakeGemini();
  const prompt = 'Viết bài'.repeat(500);
  assert.equal(prompt.length, 4000);
  await withServer(gemini, async base => {
    const res = await post(base, '/api/evaluate', { prompt });
    assert.equal(res.status, 200);
    assert.equal(calls.evaluate[0][0], prompt);
  });
});

test('evaluate rejects bad input with 400', async () => {
  const { gemini, calls } = fakeGemini();
  const bad = [
    {},
    { prompt: '' },
    { prompt: '   ' },
    { prompt: 42 },
    { prompt: 'x'.repeat(4001) },
    { prompt: 'p', clarifications: 'nope' },
    { prompt: 'p', clarifications: Array.from({ length: 7 }, () => ({ question: 'q', answer: 'a' })) },
    { prompt: 'p', clarifications: [{ question: 'q' }] },
    { prompt: 'p', clarifications: [{ question: '', answer: 'a' }] },
    { prompt: 'p', clarifications: [{ question: 'q', answer: 'a'.repeat(1001) }] },
    { prompt: 'p', clarifications: [null] },
  ];
  await withServer(gemini, async base => {
    for (const body of bad) {
      const res = await post(base, '/api/evaluate', body);
      assert.equal(res.status, 400, JSON.stringify(body).slice(0, 80));
      assert.equal(typeof (await res.json()).error, 'string');
    }
  });
  assert.equal(calls.evaluate.length, 0);
});

test('malformed JSON and missing body give 400', async () => {
  await withServer(fakeGemini().gemini, async base => {
    const malformed = await post(base, '/api/evaluate', null, { raw: '{"prompt":' });
    assert.equal(malformed.status, 400);
    assert.match((await malformed.json()).error, /valid JSON/);
    const empty = await fetch(base + '/api/evaluate', { method: 'POST' });
    assert.equal(empty.status, 400);
  });
});

test('GeminiError becomes 502 with its message; other errors become a generic 500', async () => {
  const failing = fakeGemini({ async evaluate() { throw new GeminiError('Gemini did not answer within 30 s.'); } });
  await withServer(failing.gemini, async base => {
    const res = await post(base, '/api/evaluate', { prompt: 'p' });
    assert.equal(res.status, 502);
    assert.deepEqual(await res.json(), { error: 'Gemini did not answer within 30 s.' });
  });
  const crashing = fakeGemini({ async evaluate() { throw new Error('secret internals'); } });
  const originalError = console.error;
  console.error = () => {};
  try {
    await withServer(crashing.gemini, async base => {
      const res = await post(base, '/api/evaluate', { prompt: 'p' });
      assert.equal(res.status, 500);
      assert.doesNotMatch((await res.json()).error, /secret/);
    });
  } finally {
    console.error = originalError;
  }
});

test('missing API key gives 500 with setup instructions', async () => {
  await withServer(null, async base => {
    for (const path of ['/api/evaluate', '/api/try']) {
      const res = await post(base, path, { prompt: 'p', original: 'a', improved: 'b' });
      assert.equal(res.status, 500);
      assert.deepEqual(await res.json(), { error: MISSING_KEY_MESSAGE });
    }
  });
});

test('try runs both prompts', async () => {
  const { gemini, calls } = fakeGemini();
  await withServer(gemini, async base => {
    const res = await post(base, '/api/try', { original: ' A ', improved: 'B' });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { original: { text: 'answer to A' }, improved: { text: 'answer to B' } });
    assert.deepEqual(calls.runPrompt.sort(), ['A', 'B']);
  });
});

test('try returns the successful side when the other fails', async () => {
  const { gemini } = fakeGemini({
    async runPrompt(prompt) {
      if (prompt === 'A') throw new GeminiError('Gemini returned an empty answer.');
      return 'good';
    },
  });
  await withServer(gemini, async base => {
    const res = await post(base, '/api/try', { original: 'A', improved: 'B' });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { original: { error: 'Gemini returned an empty answer.' }, improved: { text: 'good' } });
  });
});

test('try rejects missing or oversized prompts', async () => {
  await withServer(fakeGemini().gemini, async base => {
    for (const body of [{ original: 'a' }, { original: '', improved: 'b' }, { original: 'a', improved: 'b'.repeat(4001) }]) {
      const res = await post(base, '/api/try', body);
      assert.equal(res.status, 400);
    }
  });
});
