import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GeminiError } from './gemini.js';
import { MAX_PROMPT_CHARS } from './rubric.js';

const MAX_CLARIFICATIONS = 6;
const MAX_CLARIFICATION_CHARS = 1000;
const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

export const MISSING_KEY_MESSAGE = 'GEMINI_API_KEY is not set. Add it to .env and restart.';

function checkPrompt(value, field) {
  if (typeof value !== 'string' || !value.trim()) return `"${field}" must be a non-empty string.`;
  if (value.trim().length > MAX_PROMPT_CHARS) return `"${field}" must be at most ${MAX_PROMPT_CHARS} characters.`;
  return null;
}

function checkClarifications(value) {
  if (value === undefined) return null;
  if (!Array.isArray(value) || value.length > MAX_CLARIFICATIONS) {
    return `"clarifications" must be an array of at most ${MAX_CLARIFICATIONS} items.`;
  }
  const valid = value.every(item =>
    item && typeof item.question === 'string' && item.question.trim() &&
    item.question.length <= MAX_CLARIFICATION_CHARS &&
    typeof item.answer === 'string' && item.answer.length <= MAX_CLARIFICATION_CHARS);
  return valid ? null : `Each clarification needs a question and an answer of at most ${MAX_CLARIFICATION_CHARS} characters.`;
}

const settle = result => (result.status === 'fulfilled'
  ? { text: result.value }
  : { error: result.reason?.message || 'Gemini request failed.' });

export function createApp({ gemini }) {
  const app = express();
  app.use(express.json({ limit: '100kb' }));
  app.use(express.static(publicDir));
  app.use('/api', (req, res, next) => (gemini ? next() : res.status(500).json({ error: MISSING_KEY_MESSAGE })));

  app.post('/api/evaluate', async (req, res) => {
    const body = req.body ?? {};
    const error = checkPrompt(body.prompt, 'prompt') ?? checkClarifications(body.clarifications);
    if (error) return res.status(400).json({ error });
    const clarifications = body.clarifications?.map(c => ({ question: c.question.trim(), answer: c.answer.trim() }));
    res.json(await gemini.evaluate(body.prompt.trim(), clarifications));
  });

  app.post('/api/try', async (req, res) => {
    const body = req.body ?? {};
    const error = checkPrompt(body.original, 'original') ?? checkPrompt(body.improved, 'improved');
    if (error) return res.status(400).json({ error });
    const [original, improved] = await Promise.allSettled([
      gemini.runPrompt(body.original.trim()),
      gemini.runPrompt(body.improved.trim()),
    ]);
    res.json({ original: settle(original), improved: settle(improved) });
  });

  // Express 5 forwards rejected async handlers here.
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Request body must be valid JSON.' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request is too large.' });
    if (err instanceof GeminiError) return res.status(502).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Something went wrong on the server.' });
  });

  return app;
}
