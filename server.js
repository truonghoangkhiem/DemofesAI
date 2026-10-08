import 'dotenv/config';
import { createApp, MISSING_KEY_MESSAGE } from './lib/app.js';
import { createGemini, createGoogleClient } from './lib/gemini.js';

const apiKey = process.env.GEMINI_API_KEY?.trim();
const model = process.env.GEMINI_MODEL?.trim() || 'gemini-flash-latest';
const port = Number(process.env.PORT) || 3000;
const timeoutMs = (Number(process.env.GEMINI_TIMEOUT_SECONDS) || 90) * 1000;
// "low" is fast; "none" sends no thinking config (for models without thinking levels).
const thinkingSetting = process.env.GEMINI_THINKING_LEVEL?.trim().toLowerCase() || 'low';
const thinkingLevel = thinkingSetting === 'none' ? null : thinkingSetting;

if (!apiKey) console.warn(`Warning: ${MISSING_KEY_MESSAGE}`);
const gemini = apiKey ? createGemini({ ...createGoogleClient(apiKey), model, timeoutMs, thinkingLevel }) : null;

createApp({ gemini }).listen(port, () => {
  console.log(`Prompt Sensei is running at http://localhost:${port} (model: ${model}, thinking: ${thinkingSetting})`);
});
