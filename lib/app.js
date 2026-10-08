import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GeminiError } from './gemini.js';
import { MAX_PROMPT_CHARS, MAX_IMPROVED_CHARS, MAX_CLARIFICATION_CHARS } from './rubric.js';

const MAX_CLARIFICATIONS = 6;
const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const packageDir = name => path.dirname(fileURLToPath(import.meta.resolve(name)));

// Browser libraries served from node_modules (see the importmap in public/index.html), so the page
// loads them from this server instead of a chain of CDN round-trips.
const threeBuildDir = packageDir('three');
const VENDOR = {
  '/vendor/three/build': threeBuildDir,
  '/vendor/three/addons': path.join(threeBuildDir, '..', 'examples', 'jsm'),
  '/vendor/marked': packageDir('marked'),
  '/vendor/dompurify': packageDir('dompurify'),
};

export const MISSING_KEY_MESSAGE = 'GEMINI_API_KEY is not set. Add it to .env and restart.';

function checkPrompt(value, field, max = MAX_PROMPT_CHARS) {
  if (typeof value !== 'string' || !value.trim()) return `"${field}" must be a non-empty string.`;
  if (value.trim().length > max) return `"${field}" must be at most ${max} characters.`;
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

export function createApp({ gemini }) {
  const app = express();
  app.use(express.json({ limit: '100kb' }));
  app.use(express.static(publicDir));
  for (const [route, dir] of Object.entries(VENDOR)) app.use(route, express.static(dir, { maxAge: '1d' }));
  app.use('/api', (req, res, next) => (gemini ? next() : res.status(500).json({ error: MISSING_KEY_MESSAGE })));

  app.post('/api/evaluate', async (req, res) => {
    const body = req.body ?? {};
    const error = checkPrompt(body.prompt, 'prompt') ?? checkClarifications(body.clarifications);
    if (error) return res.status(400).json({ error });
    const clarifications = body.clarifications?.map(c => ({ question: c.question.trim(), answer: c.answer.trim() }));
    res.json(await gemini.evaluate(body.prompt.trim(), clarifications));
  });

  // Streams both answers as NDJSON lines: {side, text} chunks, then {side, done} or {side, error} per side.
  app.post('/api/try', async (req, res) => {
    const body = req.body ?? {};
    const error = checkPrompt(body.original, 'original') ?? checkPrompt(body.improved, 'improved', MAX_IMPROVED_CHARS);
    if (error) return res.status(400).json({ error });

    const cancel = new AbortController();
    res.on('close', () => cancel.abort());
    res.status(200).set({
      'content-type': 'application/x-ndjson; charset=utf-8',
      'cache-control': 'no-cache',
      'x-accel-buffering': 'no',
    });
    res.flushHeaders();
    const send = event => {
      if (!res.writableEnded && !cancel.signal.aborted) res.write(`${JSON.stringify(event)}\n`);
    };

    const run = (side, prompt) => gemini
      .streamPrompt(prompt, text => send({ side, text }), { signal: cancel.signal })
      .then(() => send({ side, done: true }))
      .catch(err => send({ side, error: err instanceof GeminiError ? err.message : 'Gemini request failed.' }));

    await Promise.all([run('original', body.original.trim()), run('improved', body.improved.trim())]);
    res.end();
  });

  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

  // Express 5 forwards rejected async handlers here.
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Request body must be valid JSON.' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request is too large.' });
    if (err instanceof GeminiError) return res.status(502).json({ error: err.message });
    // Other client errors from body-parser (unsupported charset or encoding, ...).
    if (err.expose && err.status >= 400 && err.status < 500) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Something went wrong on the server.' });
  });

  return app;
}
