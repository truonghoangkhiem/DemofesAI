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

| Variable | Default | Notes |
|---|---|---|
| `GEMINI_API_KEY` | — | Required. Get one at https://aistudio.google.com/apikey |
| `GEMINI_MODEL` | `gemini-flash-latest` | Set the exact Flash model ID you want to demo |
| `PORT` | `3000` | |
| `GEMINI_THINKING_LEVEL` | `low` | How long Gemini "thinks" first. `low` is fast enough for a live demo; `high` is slower; `none` for models without thinking levels |
| `GEMINI_TIMEOUT_SECONDS` | `90` | Max wait for an answer (for Try it: max wait between streamed chunks) |

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
