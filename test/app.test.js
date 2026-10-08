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

test('evaluate rejects bad input with 400 and a stable error code', async () => {
  const { gemini, calls } = fakeGemini();
  const bad = [
    [{}, 'EMPTY_PROMPT'],
    [{ prompt: '' }, 'EMPTY_PROMPT'],
    [{ prompt: '   ' }, 'EMPTY_PROMPT'],
    [{ prompt: 42 }, 'EMPTY_PROMPT'],
    [{ prompt: 'x'.repeat(4001) }, 'PROMPT_TOO_LONG'],
    [{ prompt: 'p', clarifications: 'nope' }, 'INVALID_INPUT'],
    [{ prompt: 'p', clarifications: Array.from({ length: 7 }, () => ({ question: 'q', answer: 'a' })) }, 'INVALID_INPUT'],
    [{ prompt: 'p', clarifications: [{ question: 'q' }] }, 'INVALID_INPUT'],
    [{ prompt: 'p', clarifications: [{ question: '', answer: 'a' }] }, 'INVALID_INPUT'],
    [{ prompt: 'p', clarifications: [{ question: 'q', answer: 'a'.repeat(1001) }] }, 'INVALID_INPUT'],
    [{ prompt: 'p', clarifications: [null] }, 'INVALID_INPUT'],
  ];
  await withServer(gemini, async base => {
    for (const [body, code] of bad) {
      const res = await post(base, '/api/evaluate', body);
      assert.equal(res.status, 400, JSON.stringify(body).slice(0, 80));
      const json = await res.json();
      assert.equal(typeof json.error, 'string');
      assert.equal(json.code, code, JSON.stringify(body).slice(0, 80));
    }
    const tooLong = await (await post(base, '/api/evaluate', { prompt: 'x'.repeat(4001) })).json();
    assert.deepEqual(tooLong.params, { max: 4000 });
  });
  assert.equal(calls.evaluate.length, 0);
});

test('malformed JSON and missing body give 400', async () => {
  await withServer(fakeGemini().gemini, async base => {
    const malformed = await post(base, '/api/evaluate', null, { raw: '{"prompt":' });
    assert.equal(malformed.status, 400);
    const json = await malformed.json();
    assert.match(json.error, /valid JSON/);
    assert.equal(json.code, 'BAD_JSON');
    const empty = await fetch(base + '/api/evaluate', { method: 'POST' });
    assert.equal(empty.status, 400);
  });
});

test('request bodies over the limit give 413 TOO_LARGE', async () => {
  await withServer(fakeGemini().gemini, async base => {
    const res = await post(base, '/api/evaluate', { prompt: 'x'.repeat(200_000) });
    assert.equal(res.status, 413);
    assert.equal((await res.json()).code, 'TOO_LARGE');
  });
});

test('GeminiError becomes 502 with its message and code; other errors become a generic 500', async () => {
  const failing = fakeGemini({
    async evaluate() { throw new GeminiError('Gemini did not answer within 30 s.', { timeout: true, params: { seconds: 30 } }); },
  });
  await withServer(failing.gemini, async base => {
    const res = await post(base, '/api/evaluate', { prompt: 'p' });
    assert.equal(res.status, 502);
    assert.deepEqual(await res.json(), {
      error: 'Gemini did not answer within 30 s.',
      code: 'GEMINI_TIMEOUT',
      params: { seconds: 30 },
    });
  });
  const unscored = fakeGemini({ async evaluate() { throw new GeminiError('could not score', { code: 'GEMINI_COULD_NOT_SCORE' }); } });
  await withServer(unscored.gemini, async base => {
    const res = await post(base, '/api/evaluate', { prompt: 'p' });
    assert.deepEqual(await res.json(), { error: 'could not score', code: 'GEMINI_COULD_NOT_SCORE' });
  });
  const crashing = fakeGemini({ async evaluate() { throw new Error('secret internals'); } });
  const originalError = console.error;
  console.error = () => {};
  try {
    await withServer(crashing.gemini, async base => {
      const res = await post(base, '/api/evaluate', { prompt: 'p' });
      assert.equal(res.status, 500);
      const json = await res.json();
      assert.doesNotMatch(json.error, /secret/);
      assert.equal(json.code, 'SERVER_ERROR');
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
      assert.deepEqual(await res.json(), { error: MISSING_KEY_MESSAGE, code: 'MISSING_KEY' });
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
    if (event.error) {
      side.error = event.error;
      side.code = event.code;
    }
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
        throw new GeminiError('Gemini did not answer within 90 s.', { timeout: true });
      }
      if (prompt === 'C') throw new Error('secret internals');
      onText('good');
    },
  });
  await withServer(gemini, async base => {
    const res = await post(base, '/api/try', { original: 'A', improved: 'B' });
    assert.deepEqual(await readTry(res), {
      original: { text: 'half ', error: 'Gemini did not answer within 90 s.', code: 'GEMINI_TIMEOUT' },
      improved: { text: 'good', done: true },
    });
    const hidden = await readTry(await post(base, '/api/try', { original: 'C', improved: 'B' }));
    assert.deepEqual(hidden.original, { text: '', error: 'Gemini request failed.', code: 'GEMINI_FAILED' });
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
    for (const [body, code] of [
      [{ original: 'a' }, 'EMPTY_PROMPT'],
      [{ original: '', improved: 'b' }, 'EMPTY_PROMPT'],
      [{ original: 'a'.repeat(4001), improved: 'b' }, 'PROMPT_TOO_LONG'],
      [{ original: 'a', improved: 'b'.repeat(8001) }, 'PROMPT_TOO_LONG'],
    ]) {
      const res = await post(base, '/api/try', body);
      assert.equal(res.status, 400);
      assert.equal((await res.json()).code, code);
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
    assert.deepEqual(await res.json(), { error: 'Not found.', code: 'NOT_FOUND' });
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
      const json = await charset.json();
      assert.equal(typeof json.error, 'string');
      assert.equal(json.code, 'BAD_REQUEST');
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

test('serves the vendored browser modules the importmap points at', async () => {
  await withServer(fakeGemini().gemini, async base => {
    const page = await (await fetch(base + '/')).text();
    for (const path of [
      '/vendor/three/build/three.module.js',
      '/vendor/three/build/three.core.js',
      '/vendor/three/addons/postprocessing/EffectComposer.js',
      '/vendor/marked/marked.esm.js',
      '/vendor/dompurify/purify.es.mjs',
    ]) {
      const res = await fetch(base + path);
      assert.equal(res.status, 200, path);
      assert.match(res.headers.get('content-type'), /javascript/, path);
      await res.arrayBuffer();
    }
    assert.match(page, /"three": "\/vendor\/three\/build\/three\.module\.js"/);
    assert.doesNotMatch(page, /cdn\.jsdelivr\.net/);
  });
});
