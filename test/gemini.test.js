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

test('a hanging call times out, retries, then throws GeminiError', async () => {
  const calls = [];
  const generate = request => { calls.push(request); return new Promise(() => {}); };
  await assert.rejects(createGemini({ generate, model: 'm', timeoutMs: 20 }).evaluate('p'), /did not answer within/);
  assert.equal(calls.length, 2);
  for (const call of calls) assert.equal(call.config.abortSignal.aborted, true);
});

test('a successful call is not aborted', async () => {
  const { generate, calls } = fakeGenerate('Answer text');
  await createGemini({ generate, model: 'm', timeoutMs: 20 }).runPrompt('Hello');
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.equal(calls[0].config.abortSignal.aborted, false);
});

test('runPrompt sends the raw prompt with no system instruction', async () => {
  const { generate, calls } = fakeGenerate('Answer text');
  const text = await createGemini({ generate, model: 'm' }).runPrompt('Hello');
  assert.equal(text, 'Answer text');
  assert.equal(calls[0].contents, 'Hello');
  assert.equal(calls[0].config.systemInstruction, undefined);
});

test('runPrompt retries an empty answer then throws', async () => {
  const { generate, calls } = fakeGenerate('', '   ');
  await assert.rejects(createGemini({ generate, model: 'm' }).runPrompt('Hello'), /empty answer/);
  assert.equal(calls.length, 2);
});

test('long API error messages are truncated', async () => {
  const long = new Error('x'.repeat(2000));
  const { generate } = fakeGenerate(long, long);
  await assert.rejects(createGemini({ generate, model: 'm' }).runPrompt('Hello'), err => err.message.length <= 330);
});
