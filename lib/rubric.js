// Rubric, response schema and response normalization. Pure: no I/O.

export const MAX_PROMPT_CHARS = 4000;
// The rewrite usually adds Role/Context/Format, so it may be longer than the original.
export const MAX_IMPROVED_CHARS = 2 * MAX_PROMPT_CHARS;
export const MAX_CLARIFICATION_CHARS = 1000;
const MAX_QUESTIONS = 4;

export const CRITERIA = [
  { id: 'clarity', name: 'Clarity', max: 15, check: 'Precise, unambiguous instructions; no vague asks like "make it better".' },
  { id: 'conciseness', name: 'Conciseness', max: 10, check: 'No unnecessary length; does not cram several unrelated tasks into one prompt.' },
  { id: 'consistency', name: 'Consistency', max: 5, check: 'Uses the same term for the same concept throughout.' },
  { id: 'role_task', name: 'Role & Task', max: 15, check: 'Gives the AI a role or persona and states the task clearly.' },
  { id: 'context_audience', name: 'Context & Audience', max: 15, check: 'Provides relevant background, the target audience and their needs.' },
  { id: 'output_format', name: 'Output Format', max: 15, check: 'Specifies the format, length, structure and tone of the answer.' },
  { id: 'constraints', name: 'Constraints', max: 10, check: 'Adds specific requirements that narrow the answer.' },
  { id: 'timeframe', name: 'Timeframe & Freshness', max: 5, check: 'States explicit dates or time periods when the topic changes over time, and supplies up-to-date context.' },
  { id: 'bias_fairness', name: 'Bias & Fairness', max: 10, check: 'Neutral framing, balanced references, no leading or stereotyping language.' },
];

// The system instruction text lives in prompts/system-instruction.md (see lib/settings.js).

const stringList = { type: 'array', items: { type: 'string' } };

export const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['needs_clarification', 'evaluated'] },
    reason: { type: 'string' },
    questions: stringList,
    criteria: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', enum: CRITERIA.map(c => c.id) },
          score: { type: 'integer' },
          feedback: { type: 'string' },
        },
        required: ['id', 'score', 'feedback'],
      },
    },
    strengths: stringList,
    improvedPrompt: { type: 'string' },
    tips: stringList,
  },
  required: ['status'],
};

export class InvalidResponseError extends Error {
  constructor(message) {
    super(message);
    this.name = 'InvalidResponseError';
  }
}

// Stops user text from closing or opening our delimiter tags.
function neutralizeTags(text) {
  return text.replace(/<(\/?)(user_prompt|clarifications)/gi, '‹$1$2');
}

// messages: the short follow-up texts from prompts/messages.json (answeredIntro, skipped, mustEvaluate, insist).
export function buildEvaluationContents(prompt, clarifications, { insist = false, messages } = {}) {
  const parts = [`<user_prompt>\n${neutralizeTags(prompt)}\n</user_prompt>`];
  if (Array.isArray(clarifications)) {
    const answered = clarifications.filter(c => c.answer.trim());
    if (answered.length) {
      const pairs = answered.map(c => `Q: ${neutralizeTags(c.question)}\nA: ${neutralizeTags(c.answer)}`);
      parts.push(`${messages.answeredIntro}\n<clarifications>\n${pairs.join('\n\n')}\n</clarifications>`);
    } else {
      parts.push(messages.skipped);
    }
    parts.push(messages.mustEvaluate);
  }
  if (insist) parts.push(messages.insist);
  return parts.join('\n\n');
}

export function parseJsonText(text) {
  if (typeof text !== 'string' || !text.trim()) throw new InvalidResponseError('empty response');
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(cleaned);
  } catch {
    throw new InvalidResponseError('response is not valid JSON');
  }
}

const str = value => (typeof value === 'string' ? value.trim() : '');
const strList = value => (Array.isArray(value) ? value.map(str).filter(Boolean) : []);

export function normalizeEvaluation(raw) {
  if (!raw || typeof raw !== 'object') throw new InvalidResponseError('response is not an object');

  if (raw.status === 'needs_clarification') {
    const questions = strList(raw.questions).slice(0, MAX_QUESTIONS).map(q => q.slice(0, MAX_CLARIFICATION_CHARS));
    if (!questions.length) throw new InvalidResponseError('no clarifying questions');
    return { status: 'needs_clarification', reason: str(raw.reason), questions };
  }

  if (raw.status !== 'evaluated') throw new InvalidResponseError('unknown status');
  const improvedPrompt = str(raw.improvedPrompt).slice(0, MAX_IMPROVED_CHARS);
  if (!improvedPrompt) throw new InvalidResponseError('missing improved prompt');

  const byId = new Map();
  for (const item of Array.isArray(raw.criteria) ? raw.criteria : []) {
    if (item && typeof item.id === 'string' && !byId.has(item.id)) byId.set(item.id, item);
  }
  const criteria = CRITERIA.map(c => {
    const item = byId.get(c.id);
    const n = Number(item?.score);
    const score = Number.isFinite(n) ? Math.min(c.max, Math.max(0, Math.round(n))) : 0;
    return { id: c.id, name: c.name, score, max: c.max, feedback: str(item?.feedback) };
  });

  return {
    status: 'evaluated',
    overall: criteria.reduce((sum, c) => sum + c.score, 0),
    criteria,
    strengths: strList(raw.strengths),
    improvedPrompt,
    tips: strList(raw.tips),
  };
}
