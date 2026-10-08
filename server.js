import 'dotenv/config';
import { createApp, MISSING_KEY_MESSAGE } from './lib/app.js';
import { createGemini, createGoogleGenerate } from './lib/gemini.js';

const apiKey = process.env.GEMINI_API_KEY?.trim();
const model = process.env.GEMINI_MODEL?.trim() || 'gemini-flash-latest';
const port = Number(process.env.PORT) || 3000;

if (!apiKey) console.warn(`Warning: ${MISSING_KEY_MESSAGE}`);
const gemini = apiKey ? createGemini({ generate: createGoogleGenerate(apiKey), model }) : null;

createApp({ gemini }).listen(port, () => {
  console.log(`Prompt Sensei is running at http://localhost:${port} (model: ${model})`);
});
