import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGemini, GeminiError } from '../lib/gemini.js';
import { CRITERIA } from '../lib/rubric.js';

const evaluated = JSON.stringify({
  status: 'evaluated',
  criteria: CRITERIA.map(c => ({ id: c.id, score: c.max, feedback: 'ok' })),
  strengths: ['s'], improvedPrompt: 'Better', tips: ['t'],
});
const clarify = JSON.stringify({ status: 'needs_clarification', reason: 'vague', questions: ['Who?', 'What?'] });

// generate() fake that returns queued answers (strings, or Errors to throw) and records calls.
function fakeGenerate(...answers) {
  const calls = [];
  const generate = async request => {
    calls.push(request);
    const next = answers.shift();
    if (next instanceof Error) throw next;
    return next;
  };
  return { generate, calls };
}

test('evaluate sends the system instruction, JSON config and model', async () => {
  const { generate, calls } = fakeGenerate(evaluated);
  const gemini = createGemini({ generate, model: 'm-1' });
  const result = await gemini.evaluate('Write a poem');
  assert.equal(result.status, 'evaluated');
  assert.equal(result.overall, 100);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].model, 'm-1');
  assert.match(calls[0].contents, /<user_prompt>\nWrite a poem\n<\/user_prompt>/);
  assert.equal(calls[0].config.temperature, 0.2);
  assert.equal(calls[0].config.responseMimeType, 'application/json');
  assert.ok(calls[0].config.responseJsonSchema);
  assert.match(calls[0].config.systemInstruction, /Prompt Sensei/);
});

test('evaluate may return clarifying questions on the first round', async () => {
  const { generate } = fakeGenerate(clarify);
  const result = await createGemini({ generate, model: 'm' }).evaluate('Write something');
  assert.deepEqual(result, { status: 'needs_clarification', reason: 'vague', questions: ['Who?', 'What?'] });
});

test('evaluate retries once on invalid JSON', async () => {
  const { generate, calls } = fakeGenerate('oops', evaluated);
  const result = await createGemini({ generate, model: 'm' }).evaluate('p');
  assert.equal(result.status, 'evaluated');
  assert.equal(calls.length, 2);
});

test('evaluate retries once on an API error, then throws GeminiError', async () => {
  const { generate, calls } = fakeGenerate(new Error('503 overloaded'), new Error('503 overloaded'));
  await assert.rejects(createGemini({ generate, model: 'm' }).evaluate('p'), err => {
    assert.ok(err instanceof GeminiError);
    assert.match(err.message, /503 overloaded/);
    return true;
  });
  assert.equal(calls.length, 2);
});

test('invalid JSON twice gives a readable GeminiError', async () => {
  const { generate } = fakeGenerate('nope', 'still nope');
  await assert.rejects(createGemini({ generate, model: 'm' }).evaluate('p'), /unexpected answer/);
});

test('after clarifications, a clarification answer is re-asked once with insist', async () => {
  const { generate, calls } = fakeGenerate(clarify, evaluated);
  const result = await createGemini({ generate, model: 'm' }).evaluate('p', [{ question: 'Who?', answer: 'Kids' }]);
  assert.equal(result.status, 'evaluated');
  assert.equal(calls.length, 2);
  assert.doesNotMatch(calls[0].contents, /not allowed/);
  assert.match(calls[1].contents, /not allowed/);
});

test('skip ([]) that still gets questions twice fails with GeminiError', async () => {
  const { generate } = fakeGenerate(clarify, clarify);
  await assert.rejects(createGemini({ generate, model: 'm' }).evaluate('p', []), err => {
    assert.ok(err instanceof GeminiError);
    assert.match(err.message, /could not score/);
    return true;
  });
});

test('a hanging call times out once and is not retried', async () => {
  const calls = [];
  const generate = request => { calls.push(request); return new Promise(() => {}); };
  await assert.rejects(createGemini({ generate, model: 'm', timeoutMs: 20 }).evaluate('p'), err => {
    assert.ok(err instanceof GeminiError);
    assert.match(err.message, /did not answer within/);
    return true;
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].config.abortSignal.aborted, true);
});

test('a successful call is not aborted', async () => {
  const { generate, calls } = fakeGenerate(evaluated);
  await createGemini({ generate, model: 'm', timeoutMs: 20 }).evaluate('p');
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.equal(calls[0].config.abortSignal.aborted, false);
});

test('evaluate sends a low thinking level by default, or none when disabled', async () => {
  const first = fakeGenerate(evaluated);
  await createGemini({ generate: first.generate, model: 'm' }).evaluate('p');
  assert.deepEqual(first.calls[0].config.thinkingConfig, { thinkingLevel: 'low' });
  const second = fakeGenerate(evaluated);
  await createGemini({ generate: second.generate, model: 'm', thinkingLevel: null }).evaluate('p');
  assert.equal(second.calls[0].config.thinkingConfig, undefined);
});

test('a model that rejects the thinking level is retried without it, and remembered', async () => {
  const rejected = new Error('{"error":{"code":400,"message":"Thinking level LOW is not supported for this model."}}');
  const { generate, calls } = fakeGenerate(rejected, evaluated, evaluated);
  const gemini = createGemini({ generate, model: 'm' });
  assert.equal((await gemini.evaluate('p')).status, 'evaluated');
  await gemini.evaluate('p');
  assert.equal(calls.length, 3);
  assert.ok(calls[0].config.thinkingConfig);
  assert.equal(calls[1].config.thinkingConfig, undefined);
  assert.equal(calls[2].config.thinkingConfig, undefined);
});

// generateStream() fake: each attempt is a list of chunks; an Error item is thrown, 'HANG' never resolves.
function fakeStream(...attempts) {
  const calls = [];
  async function* generateStream(request) {
    calls.push(request);
    for (const item of attempts.shift() ?? []) {
      if (item instanceof Error) throw item;
      if (item === 'HANG') await new Promise(() => {});
      yield item;
    }
  }
  return { generateStream, calls };
}

test('streamPrompt sends the raw prompt with no system instruction and forwards chunks', async () => {
  const { generateStream, calls } = fakeStream(['Hel', 'lo']);
  const chunks = [];
  await createGemini({ generateStream, model: 'm' }).streamPrompt('Hi', text => chunks.push(text));
  assert.deepEqual(chunks, ['Hel', 'lo']);
  assert.equal(calls[0].contents, 'Hi');
  assert.equal(calls[0].model, 'm');
  assert.equal(calls[0].config.systemInstruction, undefined);
  assert.deepEqual(calls[0].config.thinkingConfig, { thinkingLevel: 'low' });
});

test('streamPrompt retries an error that happens before any text', async () => {
  const { generateStream, calls } = fakeStream([new Error('503 overloaded')], ['ok']);
  const chunks = [];
  await createGemini({ generateStream, model: 'm' }).streamPrompt('Hi', text => chunks.push(text));
  assert.deepEqual(chunks, ['ok']);
  assert.equal(calls.length, 2);
});

test('streamPrompt does not retry after text was sent', async () => {
  const { generateStream, calls } = fakeStream(['part', new Error('connection reset')], ['never']);
  const chunks = [];
  await assert.rejects(
    createGemini({ generateStream, model: 'm' }).streamPrompt('Hi', text => chunks.push(text)),
    err => err instanceof GeminiError && /connection reset/.test(err.message),
  );
  assert.deepEqual(chunks, ['part']);
  assert.equal(calls.length, 1);
});

test('streamPrompt times out between chunks without retrying and aborts the request', async () => {
  const { generateStream, calls } = fakeStream(['part', 'HANG']);
  await assert.rejects(
    createGemini({ generateStream, model: 'm', timeoutMs: 20 }).streamPrompt('Hi', () => {}),
    /did not answer within/,
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].config.abortSignal.aborted, true);
});

test('streamPrompt reports an empty answer after one retry', async () => {
  const { generateStream, calls } = fakeStream([], ['']);
  await assert.rejects(createGemini({ generateStream, model: 'm' }).streamPrompt('Hi', () => {}), /empty answer/);
  assert.equal(calls.length, 2);
});

test('streamPrompt stops promptly when the caller aborts', async () => {
  const { generateStream, calls } = fakeStream(['part', 'HANG']);
  const controller = new AbortController();
  const done = createGemini({ generateStream, model: 'm' })
    .streamPrompt('Hi', () => controller.abort(), { signal: controller.signal });
  await assert.rejects(done, /cancelled/);
  assert.equal(calls[0].config.abortSignal.aborted, true);
});

test('long API error messages are truncated', async () => {
  const long = new Error('x'.repeat(2000));
  const { generate } = fakeGenerate(long, long);
  await assert.rejects(createGemini({ generate, model: 'm' }).evaluate('p'), err => err.message.length <= 330);
});
