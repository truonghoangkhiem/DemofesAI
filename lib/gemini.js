import { GoogleGenAI } from '@google/genai';
import {
  RESPONSE_SCHEMA, InvalidResponseError,
  buildEvaluationContents, parseJsonText, normalizeEvaluation,
} from './rubric.js';
import { createSettingsLoader } from './settings.js';

const MAX_ERROR_CHARS = 300;

// Errors whose message is safe to show to workshop users.
export class GeminiError extends Error {
  constructor(message, { timeout = false } = {}) {
    super(message);
    this.name = 'GeminiError';
    this.timeout = timeout;
  }
}

// Returns the two transport functions createGemini needs:
// generate → full text, generateStream → async iterable of text chunks.
export function createGoogleClient(apiKey) {
  const ai = new GoogleGenAI({ apiKey });
  return {
    async generate({ model, contents, config }) {
      const response = await ai.models.generateContent({ model, contents, config });
      return response.text;
    },
    async *generateStream({ model, contents, config }) {
      const stream = await ai.models.generateContentStream({ model, contents, config });
      for await (const chunk of stream) {
        if (chunk.text) yield chunk.text;
      }
    },
  };
}

// Settings come from getSettings() on every request (see lib/settings.js), so edits to
// config/llm.json and prompts/ apply immediately. Without getSettings, the files on disk are
// used with the optional overrides { model, timeoutMs, thinkingLevel } (handy in tests).
//
// thinkingLevel: Gemini 3 models think before answering, which can take 30+ s at the default level.
// "low" keeps the demo snappy; a model that rejects the level is retried without a thinking config.
export function createGemini({ generate, generateStream, getSettings, ...overrides }) {
  const loader = getSettings ?? fileSettings(overrides);
  let latest = loader();
  // "model|level" pairs whose thinking config was rejected; calls for them are sent without thinking.
  const rejected = new Set();

  // Each public method takes its own snapshot (s) and passes it down, so overlapping requests
  // never see each other's settings and one request uses one consistent snapshot.
  const snapshot = () => (latest = loader());
  const thinkingKey = s => `${s.model}|${s.thinkingLevel}`;
  const thinkingLevel = s => (s.thinkingLevel && !rejected.has(thinkingKey(s)) ? s.thinkingLevel : null);
  const withThinking = (s, config) => (thinkingLevel(s) ? { ...config, thinkingConfig: { thinkingLevel: thinkingLevel(s) } } : config);
  const isThinkingRejected = (s, err) => Boolean(thinkingLevel(s)) && /thinking/i.test(String(err?.message));
  const rejectThinking = s => { rejected.add(thinkingKey(s)); };
  const timeoutError = s => new GeminiError(`Gemini did not answer within ${s.timeoutMs / 1000} s.`, { timeout: true });

  // Calls generate with an abort signal and cancels the request when it takes too long.
  function generateWithTimeout(s, { contents, config }) {
    const controller = new AbortController();
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(timeoutError(s));
      }, s.timeoutMs);
    });
    const request = generate({ model: s.model, contents, config: { ...withThinking(s, config), abortSignal: controller.signal } });
    return Promise.race([request, timeout]).finally(() => clearTimeout(timer));
  }

  // Runs task, retrying once (immediately, without thinking, if the model rejected the thinking config).
  // A timeout is not retried: the user has already waited long enough.
  async function withRetry(s, task) {
    try {
      return await task();
    } catch (first) {
      if (first instanceof GeminiError && first.timeout) throw first;
      if (isThinkingRejected(s, first)) rejectThinking(s);
      try {
        return await task();
      } catch (err) {
        throw new GeminiError(describe(err), { timeout: err?.timeout });
      }
    }
  }

  function evaluateOnce(s, contents) {
    return withRetry(s, async () => {
      const text = await generateWithTimeout(s, {
        contents,
        config: {
          ...s.evaluate,
          systemInstruction: s.systemInstruction,
          responseMimeType: 'application/json',
          responseJsonSchema: RESPONSE_SCHEMA,
        },
      });
      return normalizeEvaluation(parseJsonText(text));
    });
  }

  async function evaluate(prompt, clarifications) {
    const s = snapshot();
    const { messages } = s;
    const result = await evaluateOnce(s, buildEvaluationContents(prompt, clarifications, { messages }));
    if (!Array.isArray(clarifications) || result.status === 'evaluated') return result;
    const retry = await evaluateOnce(s, buildEvaluationContents(prompt, clarifications, { insist: true, messages }));
    if (retry.status !== 'evaluated') throw new GeminiError('Sensei could not score this prompt. Please try again.');
    return retry;
  }

  // Streams the answer to a raw prompt (no system instruction), calling onText(chunk) as text arrives.
  // timeoutMs applies to each wait for the next chunk. Retries once only if nothing was received yet.
  // Resolves when the answer is complete; rejects with GeminiError.
  async function streamPrompt(prompt, onText, { signal } = {}) {
    const s = snapshot();
    let received = false;

    async function attempt() {
      const controller = new AbortController();
      // Rejects as soon as the caller cancels, even if the SDK ignores the abort signal.
      let rejectCancelled;
      const cancelled = new Promise((_, reject) => { rejectCancelled = reject; });
      cancelled.catch(() => {});
      const abortFromCaller = () => {
        controller.abort();
        rejectCancelled(new GeminiError('Request cancelled.'));
      };
      if (signal?.aborted) abortFromCaller();
      signal?.addEventListener('abort', abortFromCaller);
      const iterator = generateStream({
        model: s.model,
        contents: prompt,
        config: withThinking(s, { ...s.tryIt, abortSignal: controller.signal }),
      })[Symbol.asyncIterator]();
      try {
        while (true) {
          let timer;
          const timeout = new Promise((_, reject) => {
            timer = setTimeout(() => {
              controller.abort();
              reject(timeoutError(s));
            }, s.timeoutMs);
          });
          const next = await Promise.race([iterator.next(), timeout, cancelled]).finally(() => clearTimeout(timer));
          if (next.done) break;
          if (!next.value) continue;
          received = true;
          onText(next.value);
        }
      } finally {
        signal?.removeEventListener('abort', abortFromCaller);
        controller.abort();
      }
      if (!received) throw new GeminiError('Gemini returned an empty answer.');
    }

    try {
      await attempt();
    } catch (first) {
      if (signal?.aborted) throw new GeminiError('Request cancelled.');
      if (received || (first instanceof GeminiError && first.timeout)) throw new GeminiError(describe(first), { timeout: first?.timeout });
      if (isThinkingRejected(s, first)) rejectThinking(s);
      try {
        await attempt();
      } catch (err) {
        throw new GeminiError(describe(err), { timeout: err?.timeout });
      }
    }
  }

  return { evaluate, streamPrompt, settings: () => latest };
}

function fileSettings({ model, timeoutMs, thinkingLevel }) {
  const loader = createSettingsLoader({ env: {} });
  return () => {
    const base = loader.get();
    return {
      ...base,
      ...(model !== undefined && { model }),
      ...(timeoutMs !== undefined && { timeoutMs }),
      ...(thinkingLevel !== undefined && { thinkingLevel }),
    };
  };
}

function describe(err) {
  if (err instanceof InvalidResponseError) return `Gemini returned an unexpected answer (${err.message}). Please try again.`;
  if (err instanceof GeminiError) return err.message;
  const message = String(err?.message || err).slice(0, MAX_ERROR_CHARS);
  return `Gemini request failed: ${message}`;
}
