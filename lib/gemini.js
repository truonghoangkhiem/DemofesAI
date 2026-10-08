import { GoogleGenAI } from '@google/genai';
import {
  SYSTEM_INSTRUCTION, RESPONSE_SCHEMA, InvalidResponseError,
  buildEvaluationContents, parseJsonText, normalizeEvaluation,
} from './rubric.js';

const MAX_ERROR_CHARS = 300;

// Errors whose message is safe to show to workshop users.
export class GeminiError extends Error {
  constructor(message) {
    super(message);
    this.name = 'GeminiError';
  }
}

export function createGoogleGenerate(apiKey) {
  const ai = new GoogleGenAI({ apiKey });
  return async ({ model, contents, config }) => {
    const response = await ai.models.generateContent({ model, contents, config });
    return response.text;
  };
}

export function createGemini({ generate, model, timeoutMs = 30_000 }) {
  // Calls generate with an abort signal and cancels the request when it takes too long.
  function generateWithTimeout({ contents, config }) {
    const controller = new AbortController();
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new GeminiError(`Gemini did not answer within ${timeoutMs / 1000} s.`));
      }, timeoutMs);
    });
    const request = generate({ model, contents, config: { ...config, abortSignal: controller.signal } });
    return Promise.race([request, timeout]).finally(() => clearTimeout(timer));
  }

  // Runs task, retrying once; the second failure becomes a GeminiError.
  async function withRetry(task) {
    try {
      return await task();
    } catch {
      try {
        return await task();
      } catch (err) {
        throw new GeminiError(describe(err));
      }
    }
  }

  function evaluateOnce(contents) {
    return withRetry(async () => {
      const text = await generateWithTimeout({
        contents,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          temperature: 0.2,
          responseMimeType: 'application/json',
          responseJsonSchema: RESPONSE_SCHEMA,
        },
      });
      return normalizeEvaluation(parseJsonText(text));
    });
  }

  async function evaluate(prompt, clarifications) {
    const result = await evaluateOnce(buildEvaluationContents(prompt, clarifications));
    if (!Array.isArray(clarifications) || result.status === 'evaluated') return result;
    const retry = await evaluateOnce(buildEvaluationContents(prompt, clarifications, { insist: true }));
    if (retry.status !== 'evaluated') throw new GeminiError('Sensei could not score this prompt. Please try again.');
    return retry;
  }

  function runPrompt(prompt) {
    return withRetry(async () => {
      const text = await generateWithTimeout({ contents: prompt, config: {} });
      if (typeof text !== 'string' || !text.trim()) throw new GeminiError('Gemini returned an empty answer.');
      return text;
    });
  }

  return { evaluate, runPrompt };
}

function describe(err) {
  if (err instanceof InvalidResponseError) return `Gemini returned an unexpected answer (${err.message}). Please try again.`;
  if (err instanceof GeminiError) return err.message;
  const message = String(err?.message || err).slice(0, MAX_ERROR_CHARS);
  return `Gemini request failed: ${message}`;
}
