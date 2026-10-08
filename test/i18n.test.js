import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  I18N, PRESETS, LANGS, PRESET_KEYS, EMOTE_MOODS, CRITERION_IDS, ERROR_CODES, DEFAULT_LANG,
  t, findPreset,
} from '../public/i18n.js';
import { CRITERIA } from '../lib/rubric.js';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const html = read('public/index.html');
const appJs = read('public/app.js');
const mascotJs = read('public/scene/mascot.js');
const serverJs = read('lib/app.js') + read('lib/gemini.js');
const CODES = LANGS.map(l => l.code);
const allKeys = new Set(Object.values(I18N).flatMap(Object.keys));

const matches = (text, regex) => [...text.matchAll(regex)].map(m => m[1]);

test('the UI offers exactly vi, en and ja, with vi as the default', () => {
  assert.deepEqual(CODES, ['vi', 'en', 'ja']);
  assert.deepEqual(Object.keys(I18N), CODES);
  assert.equal(DEFAULT_LANG, 'vi');
  assert.deepEqual(matches(html, /data-lang="(\w+)"/g), CODES);
});

test('every dictionary key has a non-empty string in every language', () => {
  for (const lang of CODES) {
    for (const key of allKeys) {
      const value = I18N[lang][key];
      assert.equal(typeof value, 'string', `${lang}.${key} is missing`);
      assert.ok(value.trim(), `${lang}.${key} is empty`);
    }
  }
});

test('placeholders are the same in every language', () => {
  const placeholders = text => matches(text, /\{(\w+)\}/g).sort().join(',');
  for (const key of allKeys) {
    const expected = placeholders(I18N.vi[key]);
    for (const lang of CODES) assert.equal(placeholders(I18N[lang][key]), expected, `${lang}.${key}`);
  }
});

test('Vietnamese and Japanese texts are actually translated', () => {
  // Keys that may legitimately read the same in English (names, flavour words, symbols).
  const same = new Set(['guideBtn', 'nameplate', 'emote.thinking.title', 'emote.happy.title', 'emote.pet.title', 'seconds', 'notAssessed']);
  const japanese = /[぀-ヿ一-鿿]/;
  for (const key of allKeys) {
    if (same.has(key)) continue;
    assert.notEqual(I18N.vi[key], I18N.en[key], `vi.${key} equals English`);
    assert.notEqual(I18N.ja[key], I18N.en[key], `ja.${key} equals English`);
  }
  for (const key of allKeys) {
    if (key === 'musicBtn' || key === 'pageTitle') continue; // "BGM" is the usual Japanese word
    assert.match(I18N.ja[key], japanese, `ja.${key} has no Japanese text`);
  }
});

test('every data-i18n key used in index.html exists', () => {
  const used = matches(html, /data-i18n(?:-html|-placeholder|-title|-aria-label)?="([^"]+)"/g);
  assert.ok(used.length > 40, `only ${used.length} data-i18n attributes found`);
  for (const key of used) assert.ok(allKeys.has(key), `index.html uses unknown key "${key}"`);
});

test('every key app.js looks up exists', () => {
  const used = matches(appJs, /\btr\(\s*'([^']+)'/g);
  // Keys picked by a ternary, e.g. tr(sound ? 'soundBtn' : 'soundMuted').
  for (const call of matches(appJs, /\btr\(([^()]*\?[^()]*)\)/g)) used.push(...matches(call, /'([^']+)'/g));
  // setBusy(true, 'busyComparing') and friends.
  used.push(...matches(appJs, /setBusy\(true, '([^']+)'\)/g));
  assert.ok(used.length > 25, `only ${used.length} lookups found`);
  for (const key of used) assert.ok(allKeys.has(key), `app.js uses unknown key "${key}"`);
});

test('no hard-coded Vietnamese or language checks are left in app.js', () => {
  assert.doesNotMatch(appJs, /currentLang === '/);
  assert.doesNotMatch(appJs, /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i);
});

test('every criterion, mood and error code has a translation', () => {
  assert.deepEqual(CRITERION_IDS, CRITERIA.map(c => c.id));
  for (const id of CRITERION_IDS) assert.ok(allKeys.has(`criterion.${id}`), id);
  for (const mood of EMOTE_MOODS) {
    assert.ok(allKeys.has(`emote.${mood}.title`), mood);
    assert.ok(allKeys.has(`emote.${mood}.sub`), mood);
    assert.match(mascotJs, new RegExp(`\\b${mood}: '#`), `mascot.js has no colour for ${mood}`);
  }
  for (const code of ERROR_CODES) assert.ok(allKeys.has(`error.${code}`), code);
  // Every code the server can send is known to the browser.
  for (const code of matches(serverJs, /'((?:GEMINI|MISSING|EMPTY|PROMPT|INVALID|BAD|TOO|NOT|SERVER)_[A-Z_]+)'/g)) {
    assert.ok(ERROR_CODES.includes(code), `server code ${code} has no translation`);
  }
});

test('presets exist in every language with the same keys, and the cards match them', () => {
  assert.deepEqual(Object.keys(PRESETS), CODES);
  for (const lang of CODES) {
    assert.deepEqual(Object.keys(PRESETS[lang]), PRESET_KEYS, lang);
    for (const key of PRESET_KEYS) assert.ok(PRESETS[lang][key].trim(), `${lang}.${key}`);
  }
  assert.deepEqual(matches(html, /data-preset="(\w+)"/g), PRESET_KEYS);
  for (const key of PRESET_KEYS) {
    assert.ok(allKeys.has(`preset.${key}.badge`) && allKeys.has(`preset.${key}.label`), key);
  }
});

test('findPreset recognises an unedited preset in any language', () => {
  for (const lang of CODES) {
    for (const key of PRESET_KEYS) assert.equal(findPreset(`  ${PRESETS[lang][key]}\n`), key);
  }
  assert.equal(findPreset(`${PRESETS.vi.blog} Thêm ý`), null);
  assert.equal(findPreset(''), null);
});

test('t() fills placeholders and falls back to Vietnamese, then the key', () => {
  assert.equal(t('ja', 'error.GEMINI_TIMEOUT', { seconds: 90 }), 'Gemini が90秒以内に応答しませんでした。もう一度お試しください。');
  assert.equal(t('en', 'toastTruncated', { max: 4000 }), 'The prompt was shortened to 4000 characters.');
  assert.equal(t('xx', 'evaluateBtn'), I18N.vi.evaluateBtn);
  assert.equal(t('en', 'no.such.key'), 'no.such.key');
});

test('the inline loader messages exist in every language', () => {
  const block = html.match(/var LOADER_TEXT = (\{[\s\S]*?\n {6}\});/);
  assert.ok(block, 'LOADER_TEXT not found in index.html');
  const loader = JSON.parse(block[1]);
  assert.deepEqual(Object.keys(loader), CODES);
  for (const lang of CODES) {
    for (const key of ['loading', 'failed', 'slow']) assert.ok(loader[lang][key]?.trim(), `${lang}.${key}`);
  }
});
