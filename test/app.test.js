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
  const calls = { evaluate: [], streamPrompt: [] };
  const gemini = {
    async evaluate(...args) { calls.evaluate.push(args); return evaluation; },
    async streamPrompt(prompt, onText) { calls.streamPrompt.push(prompt); onText("answer "); onText(`to ${prompt}`); },
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

// Collects an NDJSON /api/try response into { side: { text, done, error } }.
async function readTry(res) {
  assert.match(res.headers.get('content-type'), /application\/x-ndjson/);
  const sides = {};
  for (const line of (await res.text()).split('\n').filter(Boolean)) {
    const event = JSON.parse(line);
    const side = (sides[event.side] ??= { text: '' });
    if (event.text) side.text += event.text;
    if (event.done) side.done = true;
    if (event.error) side.error = event.error;
  }
  return sides;
}

test('try streams both answers', async () => {
  const { gemini, calls } = fakeGemini();
  await withServer(gemini, async base => {
    const res = await post(base, '/api/try', { original: ' A ', improved: 'B' });
    assert.equal(res.status, 200);
    assert.deepEqual(await readTry(res), {
      original: { text: 'answer to A', done: true },
      improved: { text: 'answer to B', done: true },
    });
    assert.deepEqual(calls.streamPrompt.sort(), ['A', 'B']);
  });
});

test('try keeps the successful side when the other fails, including partial text', async () => {
  const { gemini } = fakeGemini({
    async streamPrompt(prompt, onText) {
      if (prompt === 'A') {
        onText('half ');
        throw new GeminiError('Gemini did not answer within 90 s.');
      }
      if (prompt === 'C') throw new Error('secret internals');
      onText('good');
    },
  });
  await withServer(gemini, async base => {
    const res = await post(base, '/api/try', { original: 'A', improved: 'B' });
    assert.deepEqual(await readTry(res), {
      original: { text: 'half ', error: 'Gemini did not answer within 90 s.' },
      improved: { text: 'good', done: true },
    });
    const hidden = await readTry(await post(base, '/api/try', { original: 'C', improved: 'B' }));
    assert.deepEqual(hidden.original, { text: '', error: 'Gemini request failed.' });
  });
});

test('try cancels Gemini streams when the client disconnects', async () => {
  let signalSeen;
  const { gemini } = fakeGemini({
    streamPrompt(prompt, onText, { signal }) {
      signalSeen = signal;
      onText('start');
      return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new GeminiError('Request cancelled.'))));
    },
  });
  await withServer(gemini, async base => {
    const controller = new AbortController();
    const res = await fetch(base + '/api/try', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ original: 'A', improved: 'B' }),
      signal: controller.signal,
    });
    await res.body.getReader().read();
    controller.abort();
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(signalSeen.aborted, true);
  });
});

test('try rejects missing or oversized prompts', async () => {
  await withServer(fakeGemini().gemini, async base => {
    for (const body of [{ original: 'a' }, { original: '', improved: 'b' }, { original: 'a'.repeat(4001), improved: 'b' }, { original: 'a', improved: 'b'.repeat(8001) }]) {
      const res = await post(base, '/api/try', body);
      assert.equal(res.status, 400);
    }
  });
});

test('try accepts an improved prompt longer than the input limit', async () => {
  const { gemini, calls } = fakeGemini();
  await withServer(gemini, async base => {
    const ok = await post(base, '/api/try', { original: 'a', improved: 'b'.repeat(6000) });
    assert.equal(ok.status, 200);
    const tooLong = await post(base, '/api/try', { original: 'a', improved: 'b'.repeat(8001) });
    assert.equal(tooLong.status, 400);
  });
  assert.equal(calls.streamPrompt.length, 2);
});

test('unknown API routes give a JSON 404', async () => {
  await withServer(fakeGemini().gemini, async base => {
    const res = await fetch(base + '/api/nope');
    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), { error: 'Not found.' });
  });
});

test('other body-parser client errors keep their status as JSON', async () => {
  const originalError = console.error;
  const logged = [];
  console.error = (...args) => logged.push(args);
  try {
    await withServer(fakeGemini().gemini, async base => {
      const charset = await fetch(base + '/api/evaluate', {
        method: 'POST',
        headers: { 'content-type': 'application/json; charset=latin1' },
        body: '{"prompt":"p"}',
      });
      assert.equal(charset.status, 415);
      assert.equal(typeof (await charset.json()).error, 'string');
      const encoding = await fetch(base + '/api/evaluate', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'content-encoding': 'bogus' },
        body: '{"prompt":"p"}',
      });
      assert.equal(encoding.status, 415);
    });
  } finally {
    console.error = originalError;
  }
  assert.equal(logged.length, 0);
});
