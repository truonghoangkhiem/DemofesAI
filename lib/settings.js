// Loads the editable LLM settings: config/llm.json, prompts/system-instruction.md, prompts/messages.json.
// Files are re-read whenever they change, so prompts and temperature can be tuned live without a restart.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CRITERIA } from './rubric.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DEFAULT_PATHS = {
  config: path.join(ROOT, 'config', 'llm.json'),
  systemInstruction: path.join(ROOT, 'prompts', 'system-instruction.md'),
  messages: path.join(ROOT, 'prompts', 'messages.json'),
};

const THINKING_LEVELS = ['minimal', 'low', 'medium', 'high', 'none'];
const MESSAGE_KEYS = ['answeredIntro', 'skipped', 'mustEvaluate', 'insist'];
const CRITERIA_PLACEHOLDER = '{{criteria}}';

const number = (min, max) => value => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const integer = (min, max) => value => Number.isInteger(value) && value >= min && value <= max;

// Gemini generation parameters that may be set per call type, with their valid values.
const GENERATION_PARAMS = {
  temperature: { valid: number(0, 2), hint: 'a number from 0 to 2' },
  topP: { valid: number(0, 1), hint: 'a number from 0 to 1' },
  topK: { valid: integer(1, 1000), hint: 'an integer from 1 to 1000' },
  maxOutputTokens: { valid: integer(1, 1_000_000), hint: 'a positive integer' },
  seed: { valid: integer(-2147483648, 2147483647), hint: 'a 32-bit integer' },
  presencePenalty: { valid: number(-2, 2), hint: 'a number from -2 to 2' },
  frequencyPenalty: { valid: number(-2, 2), hint: 'a number from -2 to 2' },
  stopSequences: {
    valid: value => Array.isArray(value) && value.length <= 5 && value.every(s => typeof s === 'string' && s),
    hint: 'a list of up to 5 non-empty strings',
  },
};

export class SettingsError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SettingsError';
  }
}

function parseJson(text, file) {
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new SettingsError(`${file} is not valid JSON: ${err.message}`);
  }
}

function parseGeneration(value, section) {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new SettingsError(`config/llm.json: "${section}" must be an object.`);
  }
  for (const [key, setting] of Object.entries(value)) {
    const param = GENERATION_PARAMS[key];
    if (!param) {
      throw new SettingsError(`config/llm.json: unknown setting "${section}.${key}". Allowed: ${Object.keys(GENERATION_PARAMS).join(', ')}.`);
    }
    if (!param.valid(setting)) throw new SettingsError(`config/llm.json: "${section}.${key}" must be ${param.hint}.`);
  }
  return { ...value };
}

// Environment variables that override config/llm.json, so existing .env files keep working.
export const ENV_OVERRIDES = { GEMINI_MODEL: 'model', GEMINI_THINKING_LEVEL: 'thinkingLevel', GEMINI_TIMEOUT_SECONDS: 'timeoutSeconds' };

// Returns [[envName, setting], ...] for the overrides that are set (non-blank) in env.
export function activeEnvOverrides(env = process.env) {
  return Object.entries(ENV_OVERRIDES).filter(([name]) => env[name]?.trim());
}

// The env override when set, else the file value; `source` names where it came from for error messages.
function pick(raw, env, name) {
  const fromEnv = env[name]?.trim();
  if (fromEnv) return { value: fromEnv, source: `${name} in .env:`, fromEnv: true };
  return { value: raw[ENV_OVERRIDES[name]], source: 'config/llm.json:', fromEnv: false };
}

// Validates config/llm.json, applying ENV_OVERRIDES.
export function parseLlmConfig(raw, env = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new SettingsError('config/llm.json must contain a JSON object.');
  const known = ['model', 'thinkingLevel', 'timeoutSeconds', 'evaluate', 'tryIt'];
  const unknown = Object.keys(raw).filter(key => !known.includes(key));
  if (unknown.length) throw new SettingsError(`config/llm.json: unknown setting "${unknown[0]}". Allowed: ${known.join(', ')}.`);

  const model = pick(raw, env, 'GEMINI_MODEL');
  if (typeof model.value !== 'string' || !model.value.trim()) throw new SettingsError(`${model.source} "model" must be a non-empty string.`);

  // Omitted means "low" (fast enough for a live demo); "none" sends no thinking config.
  const level = pick(raw, env, 'GEMINI_THINKING_LEVEL');
  const thinking = level.value === undefined ? 'low' : typeof level.value === 'string' ? level.value.trim().toLowerCase() : level.value;
  if (!THINKING_LEVELS.includes(thinking)) {
    throw new SettingsError(`${level.source} "thinkingLevel" must be one of ${THINKING_LEVELS.join(', ')}.`);
  }

  // From .env, only plain decimal numbers are accepted (not "90s" or "0x10").
  const timeout = pick(raw, env, 'GEMINI_TIMEOUT_SECONDS');
  const timeoutSeconds = !timeout.fromEnv ? timeout.value ?? 90 : /^\d+(\.\d+)?$/.test(timeout.value) ? Number(timeout.value) : NaN;
  if (!number(1, 600)(timeoutSeconds)) throw new SettingsError(`${timeout.source} "timeoutSeconds" must be a number from 1 to 600.`);

  return {
    model: model.value.trim(),
    thinkingLevel: thinking === 'none' ? null : thinking,
    timeoutMs: timeoutSeconds * 1000,
    evaluate: parseGeneration(raw.evaluate, 'evaluate'),
    tryIt: parseGeneration(raw.tryIt, 'tryIt'),
  };
}

export function formatCriteria(criteria = CRITERIA) {
  return criteria.map(c => `- ${c.id} (${c.name}, max ${c.max}): ${c.check}`).join('\n');
}

// The rubric is injected from CRITERIA so the prompt always matches the server-side scoring.
export function renderSystemInstruction(template) {
  if (!template.includes(CRITERIA_PLACEHOLDER)) {
    throw new SettingsError(`prompts/system-instruction.md must contain ${CRITERIA_PLACEHOLDER} where the rubric goes.`);
  }
  return template.replaceAll(CRITERIA_PLACEHOLDER, formatCriteria()).trim();
}

export function parseMessages(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new SettingsError('prompts/messages.json must contain a JSON object.');
  for (const key of MESSAGE_KEYS) {
    if (typeof raw[key] !== 'string' || !raw[key].trim()) {
      throw new SettingsError(`prompts/messages.json: "${key}" must be a non-empty string.`);
    }
  }
  return Object.fromEntries(MESSAGE_KEYS.map(key => [key, raw[key].trim()]));
}

// Drops a UTF-8 byte order mark (Notepad and PowerShell 5.1 write one), which JSON.parse rejects.
const read = file => fs.readFileSync(file, 'utf8').replace(/^﻿/, '');

function readAll(paths, env) {
  return {
    ...parseLlmConfig(parseJson(read(paths.config), 'config/llm.json'), env),
    systemInstruction: renderSystemInstruction(read(paths.systemInstruction)),
    messages: parseMessages(parseJson(read(paths.messages), 'prompts/messages.json')),
  };
}

// Returns get(): the current settings, reloaded when any file's mtime or size changes.
// A broken edit keeps the last good settings (and warns once); a broken first load throws.
export function createSettingsLoader({ paths = DEFAULT_PATHS, env = process.env, warn = console.warn } = {}) {
  let current = null;
  let stamp = '';
  let failedStamp = '';

  const fingerprint = () => Object.values(paths).map(file => {
    try {
      const stat = fs.statSync(file);
      return `${stat.mtimeMs}:${stat.size}`;
    } catch {
      return 'missing';
    }
  }).join('|');

  function get() {
    const next = fingerprint();
    if (current && next === stamp) return current;
    if (current && next === failedStamp) return current;
    try {
      const loaded = readAll(paths, env);
      if (current) warn('Reloaded LLM settings and prompts.');
      current = loaded;
      stamp = next;
      failedStamp = '';
    } catch (err) {
      const message = err instanceof SettingsError ? err.message : `Could not read settings: ${err.message}`;
      if (!current) throw new SettingsError(message);
      failedStamp = next;
      warn(`${message} Keeping the previous settings.`);
    }
    return current;
  }

  return { get };
}
