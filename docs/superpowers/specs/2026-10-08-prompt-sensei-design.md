# Prompt Sensei — Design Spec

Date: 2026-10-08
Status: Approved in chat, pending written-spec review

## 1. Purpose

A small local web app for a prompt-engineering workshop. A user types a prompt; Gemini (Flash)
scores it against a rubric derived from the workshop material, asks clarifying questions when the
prompt is too ambiguous, proposes an improved prompt, and can run both prompts side by side so the
audience sees the difference in output quality. The UI is English, presented as a 3D Japanese
anime-style garden with a chibi kitsune mascot ("Prompt Sensei") that reacts to results.

### Success criteria

- Presenter runs `npm install && npm start`, opens `http://localhost:3000`, and can demo the full
  flow (evaluate → clarify → result → try it) without touching code.
- Scoring is consistent: same prompt gives similar scores (temperature 0.2, structured output).
- Ambiguous prompts trigger 2–4 clarifying questions; clear prompts go straight to a score.
- The 3D scene runs smoothly on a normal laptop and the mascot visibly reacts to each state.
- The API key never reaches the browser.

### Out of scope (YAGNI)

Accounts, persistence/history, preset example prompts, deployment, multi-language UI, streaming.

## 2. Configuration

`.env` (template in `.env.example`):

| Var | Required | Default | Notes |
|---|---|---|---|
| `GEMINI_API_KEY` | yes | — | Server-side only |
| `GEMINI_MODEL` | no | `gemini-flash-latest` | Presenter sets the exact Flash model ID they have access to (the "Flash 3.8" ID was not verified) |
| `PORT` | no | `3000` | |

## 3. Architecture

Approach: Node + Express, vanilla frontend, no build step. Three.js, `marked`, and `DOMPurify`
load via an importmap from a CDN (internet is required anyway for Gemini).

```
server.js            Express app: static public/, POST /api/evaluate, POST /api/try
lib/gemini.js        Gemini client wrapper: evaluate(prompt, clarifications), runPrompt(prompt)
lib/rubric.js        Criteria list, system instruction, JSON response schema, normalizeEvaluation()
public/index.html    Layout + importmap
public/styles.css    Anime UI theme (washi paper, sakura pink, sumi ink, hanko red)
public/app.js        UI state machine: input → clarify → result → compare
public/scene.js      Three.js scene + mascot; exports initScene(), setMood(mood), showScore(n)
test/*.test.js       node:test; Gemini client is injected and mocked
.env.example, README.md, package.json
```

Unit boundaries:
- `lib/rubric.js` is pure (no I/O): data + normalization. Fully unit-testable.
- `lib/gemini.js` takes an injectable client (`createGemini({ client, model })`) so tests never hit
  the network. Handles timeout (30 s), one retry on API error or invalid JSON.
- `server.js` exports `createApp({ gemini })`; `start` only happens when run directly. Validation
  lives in the route handlers.
- `public/scene.js` knows nothing about the API; `app.js` drives it only through `setMood` /
  `showScore`.

Dependencies: `express`, `@google/genai`, `dotenv`. Node ≥ 20 (built-in `node:test`, `fetch`).

## 4. Rubric

Nine criteria, total 100 points. Derived from the workshop material (3C rule; role/task/context/
format framework; constraints; timeframe for knowledge-cutoff issues; bias avoidance).

| id | Name | Max | What is checked |
|---|---|---|---|
| clarity | Clarity | 15 | Precise, unambiguous instructions; no vague asks like "make it better" |
| conciseness | Conciseness | 10 | No unnecessary length or multiple unrelated asks in one prompt |
| consistency | Consistency | 5 | Same term used for the same concept throughout |
| role_task | Role & Task | 15 | A role/persona for the AI and a clearly stated task |
| context_audience | Context & Audience | 15 | Relevant background, target audience and their needs |
| output_format | Output Format | 15 | Desired format, length, structure, tone |
| constraints | Constraints | 10 | Specific requirements that narrow the answer |
| timeframe | Timeframe & Freshness | 5 | Explicit dates/time periods when the topic changes over time; up-to-date context supplied |
| bias_fairness | Bias & Fairness | 10 | Neutral framing, balanced references, no leading or stereotyping language |

If a criterion is genuinely not applicable (e.g. timeframe for a timeless task), Gemini gives full
marks and says so in the feedback.

Advanced-technique tips (in `tips`, not scored): few-shot examples, breaking the task into a prompt
chain, starting a new conversation per topic, asking the AI to ask clarifying questions first,
verifying time-sensitive facts against external sources, saving good prompts to a prompt library.

## 5. API

### `POST /api/evaluate`

Request: `{ "prompt": string, "clarifications"?: [{ "question": string, "answer": string }] }`

Validation: `prompt` non-empty after trim, ≤ 4000 chars → else 400. `clarifications` optional array,
≤ 6 items, each answer ≤ 1000 chars.

Response (one of):

```json
{ "status": "needs_clarification", "reason": "string", "questions": ["string", "..."] }
```

```json
{
  "status": "evaluated",
  "overall": 72,
  "criteria": [{ "id": "clarity", "name": "Clarity", "score": 11, "max": 15, "feedback": "string" }],
  "strengths": ["string"],
  "improvedPrompt": "string",
  "tips": ["string"]
}
```

Rules:
- At most one clarification round: if `clarifications` is present (even empty answers via Skip),
  the system instruction forbids `needs_clarification`; if Gemini still returns it, the server
  re-asks once with a "must evaluate" instruction, then errors.
- Skip sends `clarifications: []` — meaning "user declined, score as-is".
- `needs_clarification` only when key information is missing such that a good improved prompt
  would require guessing (task goal, audience, or output unclear). 2–4 questions.
- Server normalization (`normalizeEvaluation`): clamp each score to `[0, max]`, fill missing
  criteria with 0 + "Not assessed", drop unknown ids, order by rubric, take `name`/`max` from the
  rubric (not from Gemini), compute `overall` as the sum. Questions trimmed to 2–4.
- `improvedPrompt` keeps the language of the original prompt; feedback/tips are English. The
  improved prompt incorporates the user's clarification answers.

### `POST /api/try`

Request: `{ "original": string, "improved": string }` (each non-empty, ≤ 4000 chars).
Runs both via `runPrompt` in parallel (`Promise.allSettled`). Response:
`{ "original": { "text"?: string, "error"?: string }, "improved": { ... } }` — one side failing
does not hide the other.

### Errors

- Missing `GEMINI_API_KEY`: warning at startup; API routes return 500
  `{ "error": "GEMINI_API_KEY is not set. Add it to .env and restart." }`.
- Gemini failure / timeout / invalid JSON after one retry: 502 `{ "error": "<readable message>" }`.
- Bad input: 400 `{ "error": "..." }`.

## 6. UI (English)

Layout: full-screen Three.js canvas behind; a translucent "washi paper" panel on the right (desktop)
or bottom (≤ 800 px wide, scene shrinks to top ~40 % of the screen). Fonts from Google Fonts
(a rounded Japanese-style display font for headings, a readable sans for body).

States (`app.js`):

1. **input** — textarea with live char counter (4000), "Evaluate" button. Ctrl/Cmd+Enter submits.
2. **loading** — button disabled, spinner; mascot `thinking`.
3. **clarify** — speech bubble with `reason`; each question with an answer input; "Submit
   answers" and "Skip & score anyway". Mascot `confused`.
4. **result** — hanko-stamp overall score (animated count-up), 9 criteria bars with feedback,
   "What you did well", "Sensei's tips", improved prompt box with Copy / Use this / Try it.
   "Use this" puts the improved prompt into the input and returns to `input` so it can be
   re-scored. Mascot mood by score; mascot holds a sign showing the score.
5. **compare** — two columns "Original prompt" / "Improved prompt", each showing the prompt
   (collapsed) and the response rendered with `marked` + sanitized with `DOMPurify`. "Back to
   result" button. Columns stack on mobile.

"Start over" is available from result/compare. Errors appear as a dismissible toast; mascot `sad`.

## 7. 3D Scene (`public/scene.js`)

- Renderer with toon materials (`MeshToonMaterial` + small gradient map) and outline via inverted-
  hull back-face meshes. Soft pastel sky gradient, warm lantern point lights.
- Garden: ground disc with grass color, stone path, red torii gate, two stone lanterns (glowing),
  a sakura tree (trunk + clustered pink spheres), falling petal particles (`InstancedMesh`,
  ~200 petals, looping).
- Mascot: chibi kitsune from primitives — big head, ears, eyes (with blink), small body, fluffy
  tail, holding a wooden sign whose face is a `CanvasTexture` (hidden until `showScore`).
- Gentle camera sway; renders at device pixel ratio capped to 2; pauses when tab hidden; resizes
  with window.

Moods (`setMood`):

| mood | trigger | animation |
|---|---|---|
| idle | default | bob, blink, tail wag |
| thinking | request in flight | tail swirl, "…" bubble sprite |
| confused | clarify state | head tilt, "?" sprite |
| happy | score ≥ 80 | jump, petal burst |
| neutral | 50–79 | nod |
| sad | < 50 or error | ears droop, slower bob |

Transitions blend over ~0.3 s.

## 8. Gemini prompting (`lib/rubric.js`)

System instruction tells Gemini it is "Prompt Sensei", a strict but kind prompt-engineering
coach; includes the rubric table with criteria definitions and max points, the clarification rule,
language rules, and the instruction to return JSON only. Response schema uses
`responseMimeType: "application/json"` and a `responseSchema` covering both statuses (single
object with `status` enum and optional fields). The user's prompt is wrapped in delimiters and
explicitly treated as data to be evaluated, not instructions to follow (prompt-injection guard).

`runPrompt` sends the user's prompt as-is with no system instruction, to show raw model behavior.

## 9. Testing

Automated (`npm test`, `node:test`, mocked Gemini client):
- `rubric`: normalization clamps, fills, drops unknown, recomputes overall; question trimming.
- `gemini`: parses valid JSON; retries once on invalid JSON / thrown error then throws; enforces
  "must evaluate" re-ask when clarifications present; timeout.
- `server`: 400 on empty/too-long prompt and bad clarifications; 500 when no key; happy paths for
  both routes; `/api/try` partial failure.

Manual: run the real server, check each UI state and mascot mood in a browser (desktop + mobile
width), screenshot.
