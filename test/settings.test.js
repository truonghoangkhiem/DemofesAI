import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  DEFAULT_PATHS, SettingsError, activeEnvOverrides, createSettingsLoader, parseLlmConfig, parseMessages, renderSystemInstruction,
} from '../lib/settings.js';
import { CRITERIA } from '../lib/rubric.js';
import { createGemini } from '../lib/gemini.js';

const base = { model: 'm', thinkingLevel: 'low', timeoutSeconds: 90, evaluate: { temperature: 0.2 }, tryIt: {} };

// Copies the shipped config and prompts into a temp folder the test can edit.
function tempSettings() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sensei-'));
  const paths = {
    config: path.join(dir, 'llm.json'),
    systemInstruction: path.join(dir, 'system-instruction.md'),
    messages: path.join(dir, 'messages.json'),
  };
  for (const key of Object.keys(paths)) fs.copyFileSync(DEFAULT_PATHS[key], paths[key]);
  const write = (key, content) => {
    fs.writeFileSync(paths[key], content);
    // Some file systems keep the same mtime for quick successive writes; force a change.
    const later = new Date(Date.now() + Math.floor(Math.random() * 1000) + 1000);
    fs.utimesSync(paths[key], later, later);
  };
  return { paths, write, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

test('the shipped config and prompts load', () => {
  const settings = createSettingsLoader({ env: {} }).get();
  assert.equal(typeof settings.model, 'string');
  assert.equal(settings.thinkingLevel, 'low');
  assert.equal(settings.timeoutMs, 90_000);
  assert.equal(settings.evaluate.temperature, 0.2);
  assert.ok(!settings.systemInstruction.includes('{{criteria}}'));
  for (const c of CRITERIA) assert.ok(settings.systemInstruction.includes(`- ${c.id} (${c.name}, max ${c.max}): ${c.check}`));
  assert.deepEqual(Object.keys(settings.messages), ['answeredIntro', 'skipped', 'mustEvaluate', 'insist']);
});

test('parseLlmConfig maps the file to request settings', () => {
  assert.deepEqual(parseLlmConfig(base), {
    model: 'm', thinkingLevel: 'low', timeoutMs: 90_000, evaluate: { temperature: 0.2 }, tryIt: {},
  });
  assert.equal(parseLlmConfig({ ...base, thinkingLevel: 'none' }).thinkingLevel, null);
  assert.equal(parseLlmConfig({ model: 'm' }).thinkingLevel, 'low', 'omitted thinkingLevel defaults to low');
  assert.equal(parseLlmConfig({ model: 'm' }).timeoutMs, 90_000);
  const all = { temperature: 1, topP: 0.9, topK: 40, maxOutputTokens: 2048, seed: 7, presencePenalty: 0.5, frequencyPenalty: -0.5, stopSequences: ['END'] };
  assert.deepEqual(parseLlmConfig({ ...base, tryIt: all }).tryIt, all);
});

test('environment variables override the config file', () => {
  const settings = parseLlmConfig(base, { GEMINI_MODEL: ' env-model ', GEMINI_THINKING_LEVEL: 'HIGH', GEMINI_TIMEOUT_SECONDS: '30' });
  assert.equal(settings.model, 'env-model');
  assert.equal(settings.thinkingLevel, 'high');
  assert.equal(settings.timeoutMs, 30_000);
  assert.equal(parseLlmConfig(base, { GEMINI_MODEL: '  ', GEMINI_TIMEOUT_SECONDS: '' }).model, 'm');
});

test('parseLlmConfig rejects typos and bad values with a readable message', () => {
  const bad = [
    [{ ...base, temprature: 0.2 }, /unknown setting "temprature"/],
    [{ ...base, evaluate: { temprature: 0.2 } }, /unknown setting "evaluate.temprature"/],
    [{ ...base, evaluate: { temperature: '0.2' } }, /"evaluate.temperature" must be a number from 0 to 2/],
    [{ ...base, evaluate: { temperature: 3 } }, /from 0 to 2/],
    [{ ...base, tryIt: { topP: 1.5 } }, /"tryIt.topP" must be a number from 0 to 1/],
    [{ ...base, tryIt: { topK: 2.5 } }, /integer/],
    [{ ...base, tryIt: { maxOutputTokens: 0 } }, /positive integer/],
    [{ ...base, tryIt: { stopSequences: 'END' } }, /list of up to 5/],
    [{ ...base, tryIt: [] }, /"tryIt" must be an object/],
    [{ ...base, model: '' }, /"model" must be a non-empty string/],
    [{ ...base, thinkingLevel: 'turbo' }, /"thinkingLevel" must be one of/],
    [{ ...base, timeoutSeconds: 0 }, /"timeoutSeconds" must be a number from 1 to 600/],
    [[], /must contain a JSON object/],
  ];
  for (const [config, message] of bad) assert.throws(() => parseLlmConfig(config), err => err instanceof SettingsError && message.test(err.message));
  assert.throws(() => parseLlmConfig(base, { GEMINI_TIMEOUT_SECONDS: 'abc' }), /timeoutSeconds/);
});

test('renderSystemInstruction requires the criteria placeholder', () => {
  assert.match(renderSystemInstruction('Rubric:\n{{criteria}}\nEnd'), /^Rubric:\n- clarity \(Clarity, max 15\)/);
  assert.throws(() => renderSystemInstruction('No rubric here'), /must contain \{\{criteria\}\}/);
});

test('parseMessages requires every message', () => {
  const ok = { answeredIntro: 'a', skipped: 'b', mustEvaluate: 'c', insist: 'd', extra: 'ignored' };
  assert.deepEqual(parseMessages(ok), { answeredIntro: 'a', skipped: 'b', mustEvaluate: 'c', insist: 'd' });
  assert.throws(() => parseMessages({ ...ok, insist: ' ' }), /"insist" must be a non-empty string/);
});

test('the loader picks up edits without a restart', () => {
  const files = tempSettings();
  try {
    const warnings = [];
    const loader = createSettingsLoader({ paths: files.paths, env: {}, warn: w => warnings.push(w) });
    const first = loader.get();
    assert.equal(loader.get(), first, 'unchanged files return the cached object');

    files.write('config', JSON.stringify({ ...base, evaluate: { temperature: 0.7 } }));
    assert.equal(loader.get().evaluate.temperature, 0.7);

    files.write('systemInstruction', 'You are a pirate coach.\n{{criteria}}');
    assert.match(loader.get().systemInstruction, /^You are a pirate coach\./);
    assert.ok(warnings.some(w => /Reloaded/.test(w)));
  } finally {
    files.cleanup();
  }
});

test('a broken edit keeps the last good settings and warns once', () => {
  const files = tempSettings();
  try {
    const warnings = [];
    const loader = createSettingsLoader({ paths: files.paths, env: {}, warn: w => warnings.push(w) });
    const good = loader.get();
    files.write('config', '{ "model": "m", ');
    assert.equal(loader.get(), good);
    assert.equal(loader.get(), good);
    assert.equal(warnings.filter(w => /not valid JSON.*Keeping the previous settings/.test(w)).length, 1);

    files.write('config', JSON.stringify({ ...base, model: 'fixed' }));
    assert.equal(loader.get().model, 'fixed');
  } finally {
    files.cleanup();
  }
});

test('a broken file on first load throws SettingsError', () => {
  const files = tempSettings();
  try {
    files.write('messages', '{}');
    assert.throws(() => createSettingsLoader({ paths: files.paths, env: {} }).get(), err => err instanceof SettingsError && /answeredIntro/.test(err.message));
    fs.rmSync(files.paths.config);
    assert.throws(() => createSettingsLoader({ paths: files.paths, env: {} }).get(), /Could not read settings/);
  } finally {
    files.cleanup();
  }
});

test('Gemini calls use the current settings for each request', async () => {
  let settings = {
    model: 'model-a', thinkingLevel: null, timeoutMs: 1000,
    evaluate: { temperature: 0.1, topK: 5 }, tryIt: { temperature: 1.3, maxOutputTokens: 50 },
    systemInstruction: 'SYSTEM A', messages: parseMessages({ answeredIntro: 'A', skipped: 'S', mustEvaluate: 'M', insist: 'I' }),
  };
  const calls = [];
  const evaluated = JSON.stringify({ status: 'evaluated', criteria: [], improvedPrompt: 'x' });
  const gemini = createGemini({
    generate: async request => { calls.push(request); return evaluated; },
    async *generateStream(request) { calls.push(request); yield 'hi'; },
    getSettings: () => settings,
  });

  await gemini.evaluate('p', []);
  assert.equal(calls[0].model, 'model-a');
  assert.equal(calls[0].config.temperature, 0.1);
  assert.equal(calls[0].config.topK, 5);
  assert.equal(calls[0].config.systemInstruction, 'SYSTEM A');
  assert.equal(calls[0].config.responseMimeType, 'application/json');
  assert.match(calls[0].contents, /\n\nS\n\nM$/);

  settings = { ...settings, model: 'model-b', evaluate: { temperature: 0.9, responseMimeType: 'text/plain' }, thinkingLevel: 'high' };
  await gemini.evaluate('p');
  assert.equal(calls[1].model, 'model-b');
  assert.equal(calls[1].config.temperature, 0.9);
  assert.equal(calls[1].config.responseMimeType, 'application/json', 'JSON mode cannot be overridden');
  assert.deepEqual(calls[1].config.thinkingConfig, { thinkingLevel: 'high' });

  await gemini.streamPrompt('raw', () => {});
  assert.equal(calls[2].config.temperature, 1.3);
  assert.equal(calls[2].config.maxOutputTokens, 50);
  assert.equal(calls[2].config.systemInstruction, undefined);
});

test('thinkingLevel is normalized and strictly validated from both sources', () => {
  assert.equal(parseLlmConfig({ model: 'm', thinkingLevel: ' LOW ' }).thinkingLevel, 'low');
  assert.equal(parseLlmConfig({ model: 'm', thinkingLevel: 'None' }).thinkingLevel, null);
  for (const thinkingLevel of ['', false, 0, null]) {
    assert.throws(() => parseLlmConfig({ model: 'm', thinkingLevel }), /config\/llm\.json: "thinkingLevel" must be one of/);
  }
});

test('invalid environment overrides name .env as the source', () => {
  assert.throws(() => parseLlmConfig(base, { GEMINI_THINKING_LEVEL: 'turbo' }), /^SettingsError: GEMINI_THINKING_LEVEL in \.env: "thinkingLevel" must be one of/);
  for (const value of ['90s', '0x10', '-5', '1e2']) {
    assert.throws(() => parseLlmConfig(base, { GEMINI_TIMEOUT_SECONDS: value }), /^SettingsError: GEMINI_TIMEOUT_SECONDS in \.env: "timeoutSeconds"/, value);
  }
  assert.equal(parseLlmConfig(base, { GEMINI_TIMEOUT_SECONDS: '12.5' }).timeoutMs, 12_500);
  assert.throws(() => parseLlmConfig({ ...base, timeoutSeconds: '90' }), /^SettingsError: config\/llm\.json: "timeoutSeconds"/);
});

test('activeEnvOverrides lists the env variables that shadow config/llm.json', () => {
  assert.deepEqual(activeEnvOverrides({ GEMINI_MODEL: 'x', GEMINI_THINKING_LEVEL: ' ', GEMINI_TIMEOUT_SECONDS: '30' }), [
    ['GEMINI_MODEL', 'model'], ['GEMINI_TIMEOUT_SECONDS', 'timeoutSeconds'],
  ]);
  assert.deepEqual(activeEnvOverrides({}), []);
});

test('seed must fit in a 32-bit integer', () => {
  assert.equal(parseLlmConfig({ ...base, evaluate: { seed: -2147483648 } }).evaluate.seed, -2147483648);
  assert.equal(parseLlmConfig({ ...base, evaluate: { seed: 2147483647 } }).evaluate.seed, 2147483647);
  for (const seed of [2 ** 31, 2 ** 40, 1.5]) assert.throws(() => parseLlmConfig({ ...base, evaluate: { seed } }), /"evaluate.seed" must be a 32-bit integer/);
});

test('JSON files saved with a UTF-8 BOM load, on first start and on a live edit', () => {
  const files = tempSettings();
  try {
    files.write('config', '﻿' + JSON.stringify({ ...base, evaluate: { temperature: 0.4 } }));
    files.write('messages', '﻿' + fs.readFileSync(DEFAULT_PATHS.messages, 'utf8'));
    const warnings = [];
    const loader = createSettingsLoader({ paths: files.paths, env: {}, warn: w => warnings.push(w) });
    assert.equal(loader.get().evaluate.temperature, 0.4);

    files.write('config', '﻿' + JSON.stringify({ ...base, evaluate: { temperature: 0.9 } }));
    assert.equal(loader.get().evaluate.temperature, 0.9);
    assert.ok(!warnings.some(w => /Keeping the previous/.test(w)));
  } finally {
    files.cleanup();
  }
});

test('an empty file or a file missing mid-save keeps the last good settings, then recovers', () => {
  const files = tempSettings();
  try {
    const warnings = [];
    const loader = createSettingsLoader({ paths: files.paths, env: {}, warn: w => warnings.push(w) });
    const good = loader.get();

    files.write('config', '');
    assert.equal(loader.get(), good);
    assert.equal(warnings.filter(w => /not valid JSON.*Keeping the previous settings/.test(w)).length, 1);

    fs.rmSync(files.paths.config);
    assert.equal(loader.get(), good);
    assert.equal(loader.get(), good);
    assert.equal(warnings.filter(w => /Could not read settings.*Keeping the previous settings/.test(w)).length, 1);

    files.write('config', JSON.stringify({ ...base, evaluate: { temperature: 0.5 } }));
    assert.equal(loader.get().evaluate.temperature, 0.5);
  } finally {
    files.cleanup();
  }
});

test('overlapping requests each keep their own settings snapshot', async () => {
  const settingsA = {
    model: 'model-a', thinkingLevel: null, timeoutMs: 1000, evaluate: { temperature: 0.2 }, tryIt: {},
    systemInstruction: 'SYS-A', messages: parseMessages({ answeredIntro: 'A', skipped: 'S', mustEvaluate: 'M', insist: 'I' }),
  };
  const settingsB = { ...settingsA, model: 'model-b', evaluate: { temperature: 0.9 }, systemInstruction: 'SYS-B' };
  let settings = settingsA;
  const calls = [];
  let releaseFirst;
  const firstCallGate = new Promise(resolve => { releaseFirst = resolve; });
  const needsClarification = JSON.stringify({ status: 'needs_clarification', questions: [{ id: 'q1', question: 'Who?' }] });
  const evaluated = JSON.stringify({ status: 'evaluated', criteria: [], improvedPrompt: 'x' });
  const gemini = createGemini({
    generate: async request => {
      calls.push(request);
      if (calls.length === 1) { await firstCallGate; return needsClarification; }
      return evaluated;
    },
    async *generateStream() { yield 'hi'; },
    getSettings: () => settings,
  });

  const evaluation = gemini.evaluate('p', []);
  await new Promise(resolve => setImmediate(resolve));
  settings = settingsB;
  await gemini.streamPrompt('raw', () => {});
  releaseFirst();
  await evaluation;

  assert.equal(calls.length, 2, 'first call plus the insist retry');
  for (const call of calls) {
    assert.equal(call.model, 'model-a');
    assert.equal(call.config.temperature, 0.2);
    assert.equal(call.config.systemInstruction, 'SYS-A');
  }
});

test('a thinking rejection by one model does not disable thinking for another model', async () => {
  let settings = {
    model: 'old-model', thinkingLevel: 'low', timeoutMs: 1000, evaluate: {}, tryIt: {},
    systemInstruction: 'S', messages: parseMessages({ answeredIntro: 'A', skipped: 'S', mustEvaluate: 'M', insist: 'I' }),
  };
  const calls = [];
  const gemini = createGemini({
    generate: async () => 'unused',
    async *generateStream({ model, config }) {
      calls.push([model, config.thinkingConfig?.thinkingLevel ?? null]);
      if (model === 'old-model' && config.thinkingConfig) throw new Error('thinking_level is not supported');
      yield 'hi';
    },
    getSettings: () => settings,
  });

  await gemini.streamPrompt('raw', () => {});
  await gemini.streamPrompt('raw', () => {});
  settings = { ...settings, model: 'new-model' };
  await gemini.streamPrompt('raw', () => {});
  assert.deepEqual(calls, [['old-model', 'low'], ['old-model', null], ['old-model', null], ['new-model', 'low']]);
});
