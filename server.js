import 'dotenv/config';
import { createApp, MISSING_KEY_MESSAGE } from './lib/app.js';
import { createGemini, createGoogleClient } from './lib/gemini.js';
import { activeEnvOverrides, createSettingsLoader, SettingsError } from './lib/settings.js';

const apiKey = process.env.GEMINI_API_KEY?.trim();
const port = Number(process.env.PORT) || 3000;

// Model, thinking level, timeout and generation parameters live in config/llm.json; prompts in prompts/.
const settings = createSettingsLoader();
let current;
try {
  current = settings.get();
} catch (err) {
  if (!(err instanceof SettingsError)) throw err;
  console.error(`Error: ${err.message}`);
  process.exit(1);
}

if (!apiKey) console.warn(`Warning: ${MISSING_KEY_MESSAGE}`);
const gemini = apiKey ? createGemini({ ...createGoogleClient(apiKey), getSettings: settings.get }) : null;

createApp({ gemini }).listen(port, () => {
  console.log(`Prompt Sensei is running at http://localhost:${port}`);
  for (const [name, setting] of activeEnvOverrides()) {
    console.warn(`Note: ${name} in .env overrides "${setting}" in config/llm.json (remove it from .env to tune it in the file).`);
  }
  console.log(`Model: ${current.model} · thinking: ${current.thinkingLevel ?? 'none'} · edit config/llm.json and prompts/ to tune (no restart needed)`);
});
