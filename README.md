# Prompt Sensei

Workshop demo: type a prompt, and a Gemini Flash "sensei" scores it against a 9-point rubric
(3C rule + Role · Task · Context · Format), asks clarifying questions when it is too vague,
proposes an improved prompt, and runs both prompts side by side.

## Run

Requires Node.js 20 or newer and an internet connection.

```bash
npm install
cp .env.example .env   # then put your key in GEMINI_API_KEY
npm start
```

Open http://localhost:3000.

`.env` holds secrets only:

| Variable | Default | Notes |
|---|---|---|
| `GEMINI_API_KEY` | — | Required. Get one at https://aistudio.google.com/apikey |
| `PORT` | `3000` | |

## Tuning the LLM

Everything below is re-read automatically when the file changes — edit, save, and press
**Evaluate** again. No restart needed. If an edit is invalid, the server keeps the last good
version and prints why in the console.

### `config/llm.json`

```json
{
  "model": "gemini-3.8-flash",
  "thinkingLevel": "low",
  "timeoutSeconds": 90,
  "evaluate": { "temperature": 0.2, "topP": 0.95 },
  "tryIt": { "temperature": 1.0 }
}
```

| Setting | Meaning |
|---|---|
| `model` | Gemini model ID |
| `thinkingLevel` | `minimal`, `low` (default), `medium`, `high` or `none`. Higher thinks longer (slower). `low` suits a live demo; `none` for models without thinking levels |
| `timeoutSeconds` | Max wait for an answer, 1–600 (for Try it: max wait between streamed chunks) |
| `evaluate` | Generation settings for scoring prompts |
| `tryIt` | Generation settings for running the original and improved prompts |

`evaluate` and `tryIt` accept: `temperature` (0–2), `topP` (0–1), `topK` (integer, 1–1000),
`maxOutputTokens` (positive integer, up to the model's own limit), `seed` (32-bit integer), `presencePenalty` (-2–2), `frequencyPenalty` (-2–2),
`stopSequences` (up to 5 strings). Omitted settings use the model's defaults.

`GEMINI_MODEL`, `GEMINI_THINKING_LEVEL` and `GEMINI_TIMEOUT_SECONDS` in `.env` override the file,
and the server prints a note at startup for each one that is set. While one is set, editing that
setting in `config/llm.json` has no effect: remove it from `.env` (older `.env` files often still
have `GEMINI_MODEL`) if you want to tune it live. Files saved as UTF-8 with or without a BOM both work.

### `prompts/`

| File | What it is |
|---|---|
| `system-instruction.md` | Sensei's system prompt: persona, scoring rules, when to ask questions, language rules. `{{criteria}}` is replaced by the 9-criterion rubric (defined in `lib/rubric.js`, so prompt and scoring always match) and must stay in the file |
| `messages.json` | Short follow-ups added to the request: `answeredIntro` (before the user's answers), `skipped`, `mustEvaluate` (after the question round), `insist` (when Gemini still asks questions) |

The JSON output format is fixed in code (`RESPONSE_SCHEMA` in `lib/rubric.js`) because the UI depends on it.

## Demo flow

1. Type a vague prompt such as `Write a blog post about AI` and press **Evaluate**.
2. Sensei asks clarifying questions. Answer them, or press **Skip & score anyway**.
3. Read the score, rubric feedback and improved prompt.
4. Press **Try it** to run the original and improved prompts side by side.
5. Press **Use this** to load the improved prompt and score it again.

## Test

```bash
npm test
```

Tests use a fake Gemini client and make no network calls.
