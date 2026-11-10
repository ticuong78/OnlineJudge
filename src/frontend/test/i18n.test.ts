import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createTranslator } from 'use-intl/core';
import { LOCALES, localeCookie, resolveLocale } from '../src/i18n/config';
import { MESSAGES } from '../src/i18n/messages';
import { activeLocale, setActiveLocale, tr } from '../src/i18n/runtime';
import { ApiError, errorMessage } from '../src/lib/api';
import { formatDateTime, scoreLabel } from '../src/lib/utils';

after(() => setActiveLocale('vi', MESSAGES.vi));

type Tree = { [key: string]: string | Tree };

function leaves(tree: Tree, prefix = ''): Map<string, string> {
  const out = new Map<string, string>();
  for (const [k, v] of Object.entries(tree)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') out.set(key, v);
    else for (const [kk, vv] of leaves(v, key)) out.set(kk, vv);
  }
  return out;
}

/** Top-level `{...}` blocks of an ICU message, braces balanced. */
function blocks(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let from = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{' && depth++ === 0) from = i + 1;
    else if (text[i] === '}' && --depth === 0) out.push(text.slice(from, i));
  }
  return out;
}

/**
 * Argument names (`{count}`, `{count, plural, ...}`) and rich-text tags (`<b>`) a message expects. Branch bodies of a
 * plural or select (`one {# problem}`) are scanned for nested arguments but are not arguments themselves.
 */
function placeholders(message: string) {
  const args = new Set<string>();
  const visit = (text: string) => {
    for (const block of blocks(text)) {
      const [name, type, ...rest] = block.split(',');
      args.add(name.trim());
      // The options' blocks are branch bodies (`one {# problem}`): text that may hold nested arguments.
      if (type && /^\s*(plural|select|selectordinal)\s*$/.test(type)) blocks(rest.join(',')).forEach(visit);
    }
  };
  visit(message);
  const tags = new Set([...message.matchAll(/<([A-Za-z]\w*)>/g)].map((m) => m[1]));
  return { args, tags };
}

const vi = leaves(MESSAGES.vi as unknown as Tree);
const en = leaves(MESSAGES.en as unknown as Tree);

// ---------------------------------------------------------------- locale choice

test('the locale cookie accepts only vi and en; anything else falls back to Vietnamese', () => {
  assert.equal(resolveLocale('en'), 'en');
  assert.equal(resolveLocale('vi'), 'vi');
  for (const bad of [undefined, null, '', 'EN', 'fr', 'en-US', 'vi; path=/']) assert.equal(resolveLocale(bad), 'vi');
  assert.deepEqual([...LOCALES], ['vi', 'en']);
  assert.match(localeCookie('en'), /^oj_locale=en; path=\/; max-age=\d+; samesite=lax$/);
});

// ---------------------------------------------------------------- dictionaries

test('English has exactly the keys of Vietnamese (no missing, no extra)', () => {
  assert.deepEqual([...en.keys()].filter((k) => !vi.has(k)), [], 'keys only in English');
  assert.deepEqual([...vi.keys()].filter((k) => !en.has(k)), [], 'keys missing in English');
});

test('each English message uses the same arguments and tags as the Vietnamese one', () => {
  const mismatched: string[] = [];
  for (const [key, viText] of vi) {
    const a = placeholders(viText);
    const b = placeholders(en.get(key) ?? '');
    const same = (x: Set<string>, y: Set<string>) => x.size === y.size && [...x].every((v) => y.has(v));
    if (!same(a.args, b.args) || !same(a.tags, b.tags)) mismatched.push(key);
  }
  assert.deepEqual(mismatched, []);
});

test('every message in both languages is valid ICU and formats without error', () => {
  for (const locale of LOCALES) {
    const errors: string[] = [];
    const t = createTranslator({
      locale,
      messages: MESSAGES[locale],
      onError: (e) => errors.push(`${locale}: ${e.message}`),
    });
    for (const [key, text] of locale === 'vi' ? vi : en) {
      const { args, tags } = placeholders(text);
      const values: Record<string, string | number | ((chunks: string) => string)> = {};
      for (const a of args) values[a] = 1;
      for (const tag of tags) values[tag] = (chunks: string) => chunks;
      const out = t.markup(key as never, values as never);
      if (out === key) errors.push(`${locale}: ${key} did not resolve`);
    }
    assert.deepEqual(errors, []);
  }
});

test('English plurals pick the singular for one', () => {
  setActiveLocale('en', MESSAGES.en);
  assert.equal(tr()('common.pagination.summary', { page: 1, pages: 2, total: 1 }), 'Page 1/2, 1 result');
  assert.equal(tr()('common.pagination.summary', { page: 1, pages: 2, total: 7 }), 'Page 1/2, 7 results');
  setActiveLocale('vi', MESSAGES.vi);
  assert.equal(tr()('common.pagination.summary', { page: 1, pages: 2, total: 7 }), 'Trang 1/2, 7 kết quả');
});

// ---------------------------------------------------------------- runtime helpers

test('code outside components gets Vietnamese by default and English once the provider sets it', () => {
  assert.equal(activeLocale(), 'vi');
  assert.equal(scoreLabel(60, 60).spoken, '36 trên 60 điểm');
  setActiveLocale('en', MESSAGES.en);
  assert.equal(scoreLabel(60, 60).spoken, 'Score 36 out of 60');
  assert.equal(scoreLabel(60).spoken, '60% of the points');
  setActiveLocale('vi', MESSAGES.vi);
});

test('dates follow the interface language', () => {
  const iso = '2026-11-10T07:05:00Z';
  setActiveLocale('vi', MESSAGES.vi);
  const viText = formatDateTime(iso);
  setActiveLocale('en', MESSAGES.en);
  const enText = formatDateTime(iso);
  setActiveLocale('vi', MESSAGES.vi);
  assert.match(viText, /10\/11\/2026/);
  assert.match(enText, /10\/11\/2026/);
  assert.notEqual(viText, enText, 'vi-VN puts the time first, en-GB puts the date first');
  assert.equal(formatDateTime(null), '—');
});

test('API errors: Vietnamese keeps the server text; English translates a known code and falls back otherwise', () => {
  const known = new ApiError('Thông báo của máy chủ', 401, 'auth.required');
  const unknown = new ApiError('Thông báo của máy chủ', 400, 'something.nobody.defined');

  setActiveLocale('vi', MESSAGES.vi);
  assert.equal(errorMessage(known), 'Thông báo của máy chủ');
  assert.equal(errorMessage('not an error'), 'Đã có lỗi xảy ra');

  setActiveLocale('en', MESSAGES.en);
  assert.ok(tr().has('errors.auth.required'), 'auth.required is in the errors dictionary');
  assert.equal(errorMessage(known), tr()('errors.auth.required'));
  assert.equal(errorMessage(unknown), 'Thông báo của máy chủ');
  assert.equal(errorMessage(new ApiError('', 500)), 'Something went wrong');
  assert.equal(errorMessage('not an error'), 'Something went wrong');
  setActiveLocale('vi', MESSAGES.vi);
});

test('English errors keep the numbers the server sends as details', () => {
  setActiveLocale('en', MESSAGES.en);
  const wrong = (left?: string) => new ApiError('Mã xác thực không đúng.', 400, 'identity.wrong_code', left === undefined ? undefined : { attemptsLeft: left });
  assert.equal(errorMessage(wrong('2')), 'The verification code is wrong. You have 2 tries left.');
  assert.equal(errorMessage(wrong('1')), 'The verification code is wrong. You have 1 try left.');
  assert.equal(errorMessage(wrong('0')), 'You entered a wrong code too many times. Request a new code.');
  // An older server without details: the server's own text, not a sentence with a hole in it.
  assert.equal(errorMessage(wrong()), 'Mã xác thực không đúng.');
  setActiveLocale('vi', MESSAGES.vi);
  assert.equal(errorMessage(wrong('2')), 'Mã xác thực không đúng.');
});

test('English field errors are translated message by message, and unknown Vietnamese ones fall back to the generic line', () => {
  setActiveLocale('en', MESSAGES.en);
  const invalid = (message: string) => new ApiError(message, 400, 'request.invalid');
  assert.equal(
    errorMessage(invalid('Họ tên phải từ 2 đến 80 ký tự.; Email không hợp lệ.')),
    'Full name must be 2 to 80 characters. The email address is not valid.',
  );
  assert.equal(errorMessage(invalid('property foo should not exist')), 'property foo should not exist');
  assert.equal(errorMessage(invalid('Một thông báo chưa có bản dịch.')), tr()('errors.request.invalid'));
  setActiveLocale('vi', MESSAGES.vi);
});

test('every field message in the backend DTOs has an entry in errors.fields', () => {
  const { readdirSync, readFileSync, statSync } = require('node:fs') as typeof import('node:fs');
  const { join } = require('node:path') as typeof import('node:path');
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? walk(join(dir, n)) : n.endsWith('.ts') ? [join(dir, n)] : []));
  const backend = walk(join(__dirname, '..', '..', 'backend', 'src'));
  const messages = new Set(backend.flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/\{ message: '([^']+)' \}/g)].map((m) => m[1])));
  assert.ok(messages.size >= 10, `found ${messages.size} DTO messages; the pattern no longer matches the backend`);
  const known = new Set(Object.values(MESSAGES.vi.errors.fields));
  assert.deepEqual([...messages].filter((m) => !known.has(m)), []);
});
