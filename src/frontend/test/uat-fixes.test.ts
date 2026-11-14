import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { after, mock, test } from 'node:test';
import { MESSAGES } from '../src/i18n/messages';
import { setActiveLocale } from '../src/i18n/runtime';
import { trackOpener, trapTarget } from '../src/lib/focus';
import { loginPath } from '../src/lib/login-path';
import { pageTitle } from '../src/lib/page-title';
import { adoptStored, clearDraft, codeDraftKey, createDraftAutosave, forgetDraftsOnSignOut, isDirty, leavesPage, PROBLEM_DRAFT_PREFIX, readDraft, writeDraft, type LinkClick } from '../src/lib/unsaved';
import { validityMessage, type ValidityFacts } from '../src/lib/validation';

// OJ-13: fixes from the UI and UAT pass of 11 November 2026 (docs/testing/uat-2026-11-11.md).

after(() => setActiveLocale('vi', MESSAGES.vi));

// ---------------------------------------------------------------- H1: unsaved work

test('H1: a form is dirty only when its value really changed, whatever the key order', () => {
  const loaded = { title: 'Tổng hai số', tags: ['a'], timeLimitMs: 1000 };
  assert.equal(isDirty({ timeLimitMs: 1000, tags: ['a'], title: 'Tổng hai số' }, loaded), false);
  assert.equal(isDirty({ ...loaded, title: 'Tổng ba số' }, loaded), true);
  assert.equal(isDirty({ ...loaded, tags: ['a', 'b'] }, loaded), true);
  assert.equal(isDirty({ ...loaded, tags: [] }, loaded), true);
});

const click = (href: string | null, extra: Partial<LinkClick> = {}): LinkClick => ({
  href,
  target: null,
  download: false,
  button: 0,
  modified: false,
  defaultPrevented: false,
  ...extra,
});
const here = new URL('http://localhost:3000/bank/problems/new');

test('H1: the leave guard catches links to another page of the app, and nothing else', () => {
  assert.equal(leavesPage(click('/bank'), here)?.pathname, '/bank');
  assert.equal(leavesPage(click('http://localhost:3000/classes?x=1'), here)?.search, '?x=1');
  assert.equal(leavesPage(click('/bank/problems/new#tests'), here), null, 'a spot on the same page');
  assert.equal(leavesPage(click('https://example.com/docs'), here), null, 'another site: the browser prompt covers it');
  assert.equal(leavesPage(click('/bank', { target: '_blank' }), here), null, 'a new tab keeps this page');
  assert.equal(leavesPage(click('/bank', { modified: true }), here), null, 'Cmd/Ctrl-click opens a new tab');
  assert.equal(leavesPage(click('/bank', { button: 1 }), here), null, 'middle click');
  assert.equal(leavesPage(click('/file.txt', { download: true }), here), null);
  assert.equal(leavesPage(click('/bank', { defaultPrevented: true }), here), null, 'handled by the page itself');
  assert.equal(leavesPage(click(null), here), null);
});

function memoryWindow() {
  const data = new Map<string, string>();
  return {
    data,
    localStorage: {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
    },
  };
}

test('H1: a draft survives leaving the page and is gone once cleared', () => {
  const win = memoryWindow();
  (globalThis as { window?: unknown }).window = win;
  try {
    const key = 'oj:draft:problem-new:teacher-1';
    assert.equal(readDraft(key), null);
    writeDraft(key, { v: { title: 'Tổng hai số' }, tests: [{ input: '1 2', expectedOutput: '3' }] }, new Date('2026-11-12T08:00:00Z'));
    const back = readDraft<{ v: { title: string }; tests: unknown[] }>(key);
    assert.equal(back?.value.v.title, 'Tổng hai số');
    assert.equal(back?.value.tests.length, 1);
    assert.equal(back?.savedAt, '2026-11-12T08:00:00.000Z');
    clearDraft(key);
    assert.equal(readDraft(key), null);
    win.data.set(key, '{not json');
    assert.equal(readDraft(key), null, 'a damaged draft is ignored, not thrown');
    win.data.set(key, JSON.stringify({ something: 'else' }));
    assert.equal(readDraft(key), null, 'an unrelated value is not taken for a draft');
  } finally {
    delete (globalThis as { window?: unknown }).window;
  }
});

// ---------------------------------------------------------------- M5: focus stays in a dialog

test('M5: Tab wraps inside a dialog in both directions and enters it from outside', () => {
  assert.equal(trapTarget(3, 2, false), 0, 'past the last control back to the first');
  assert.equal(trapTarget(3, 0, true), 2, 'Shift+Tab before the first goes to the last');
  assert.equal(trapTarget(3, 1, false), null, 'between inner controls the browser moves focus');
  assert.equal(trapTarget(3, 1, true), null);
  assert.equal(trapTarget(3, -1, false), 0, 'focus on the panel itself or outside: into the dialog');
  assert.equal(trapTarget(3, -1, true), 2);
  assert.equal(trapTarget(1, 0, false), 0, 'one control keeps focus');
  assert.equal(trapTarget(0, -1, false), null);
});

// ---------------------------------------------------------------- M9 and L4: text in the interface language

test('M9: every page names itself in the tab title', () => {
  setActiveLocale('vi', MESSAGES.vi);
  assert.equal(pageTitle('Ngân hàng'), 'Ngân hàng | Online Judge');
  assert.equal(pageTitle('  '), 'Online Judge');
  assert.equal(pageTitle(null), 'Online Judge');
});

const facts = (f: Partial<ValidityFacts>): ValidityFacts => ({
  valueMissing: false,
  typeMismatch: false,
  tooShort: false,
  tooLong: false,
  rangeUnderflow: false,
  rangeOverflow: false,
  patternMismatch: false,
  stepMismatch: false,
  badInput: false,
  type: 'text',
  minLength: -1,
  maxLength: -1,
  min: '',
  max: '',
  ...f,
});

test('L4: browser validation messages follow the interface language, not the browser', () => {
  setActiveLocale('vi', MESSAGES.vi);
  assert.equal(validityMessage(facts({ valueMissing: true })), MESSAGES.vi.common.validation.required);
  assert.equal(validityMessage(facts({ typeMismatch: true, type: 'email' })), MESSAGES.vi.common.validation.email);
  assert.equal(validityMessage(facts({ tooShort: true, minLength: 8 })), 'Cần ít nhất 8 ký tự.');
  assert.equal(validityMessage(facts({ rangeUnderflow: true, min: '100' })), 'Giá trị phải từ 100 trở lên.');
  assert.equal(validityMessage(facts({ patternMismatch: true })), MESSAGES.vi.common.validation.invalid, 'the 6-digit code field');
  assert.equal(validityMessage(facts({ stepMismatch: true })), MESSAGES.vi.common.validation.invalid, 'points in 0.5 steps');
  assert.equal(validityMessage(facts({ badInput: true })), MESSAGES.vi.common.validation.invalid);
  assert.equal(validityMessage(facts({})), null, 'a valid field gets no message');
  setActiveLocale('en', MESSAGES.en);
  assert.equal(validityMessage(facts({ valueMissing: true })), 'Please fill in this field.');
  assert.equal(validityMessage(facts({ tooLong: true, maxLength: 200 })), 'Use at most 200 characters.');
});

// ---------------------------------------------------------------- review fixes

test('L5: after "Sign out" the sign-in page carries no ?next=, after an expired session it does', () => {
  assert.equal(loginPath('/bank/problems/p1', true), '/login', 'the next person must not land on the last user page');
  assert.equal(loginPath('/bank/problems/p1', false), '/login?next=%2Fbank%2Fproblems%2Fp1');
  assert.equal(loginPath('/', false), '/login');
  assert.equal(loginPath(null, false), '/login');
});

test('a student\'s code draft is keyed by account, so the next student on a lab computer does not see it', () => {
  const an = codeDraftKey('student-an', 's1', 'A', 'cpp');
  const binh = codeDraftKey('student-binh', 's1', 'A', 'cpp');
  assert.notEqual(an, binh, 'same session, problem and language, different students');
  assert.equal(an, 'oj:draft:u:student-an:s1:A:cpp');
});

test('sign-out removes problem drafts and old shared code drafts, and keeps per-account code drafts', () => {
  const data = new Map<string, string>([
    [`${PROBLEM_DRAFT_PREFIX}teacher-1`, '{}'],
    [`${PROBLEM_DRAFT_PREFIX}teacher-2`, '{}'],
    ['oj:draft:session-1:A:cpp', 'int main(){} // saved before drafts had an owner'],
    [codeDraftKey('student-an', 'session-1', 'A', 'cpp'), 'int main(){}'],
    ['oj:lang', 'cpp'],
    ['oj:lastProblem:student-an', '{}'],
  ]);
  const store = {
    get length() { return data.size; },
    key: (i: number) => [...data.keys()][i] ?? null,
    removeItem: (k: string) => void data.delete(k),
  };
  forgetDraftsOnSignOut(store);
  assert.deepEqual([...data.keys()], [codeDraftKey('student-an', 'session-1', 'A', 'cpp'), 'oj:lang', 'oj:lastProblem:student-an']);
});

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return name.endsWith('.tsx') ? [path] : [];
  });
}

test('L1: the tags input is never inside a <label> (its remove buttons would become the label control)', () => {
  // Field renders a <label>. Clicking the caption of a labelled TagsInput removed the first tag (found in review).
  const wrapped = sources(join(__dirname, '..', 'src')).filter((file) =>
    /<(?:Field|label)\b[^>]*>\s*<TagsInput\b/.test(readFileSync(file, 'utf8')),
  );
  assert.deepEqual(wrapped, []);
  const form = readFileSync(join(__dirname, '..', 'src', 'components', 'admin', 'problem-form.tsx'), 'utf8');
  assert.match(form, /<TagsInput[^\n]*labelledBy=/, 'the problem form names the input through aria-labelledby');
});

// ---------------------------------------------------------------- regressions found in review

test('M5 regression: a dialog remembers the button that opened it, not the field that takes focus inside it', () => {
  let state = trackOpener<string>({ wasOpen: false, opener: null }, false, 'create-class-button');
  state = trackOpener(state, true, 'create-class-button'); // the render that opens the dialog
  state = trackOpener(state, true, 'class-name-input'); // autoFocus moved focus during the commit
  state = trackOpener(state, true, 'class-code-input'); // the user tabs on
  assert.equal(state.opener, 'create-class-button');
  state = trackOpener(state, false, 'body');
  state = trackOpener(state, true, 'edit-button');
  assert.equal(state.opener, 'edit-button', 'opened again: the new opener');
});

test('H1 regression: after a save the server normalised, the form shows the stored version and is not "unsaved"', () => {
  const typed = { title: 'Tổng hai số', tags: ['Mảng'] };
  const stored = { title: 'Tổng hai số', tags: ['mảng'] };
  const after = adoptStored(typed, typed, stored);
  assert.deepEqual(after.value, stored);
  assert.equal(isDirty(after.value, after.saved), false);
  const edited = { title: 'Tổng ba số', tags: ['Mảng'] };
  const kept = adoptStored(edited, typed, stored);
  assert.deepEqual(kept.value, edited, 'edits made since the save are kept');
  assert.equal(isDirty(kept.value, kept.saved), true);
});

test('H1 regression: a save inside the autosave delay leaves no stale draft behind', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const written: string[] = [];
    const autosave = createDraftAutosave<string>((v) => written.push(v), 400);
    autosave.schedule('a');
    autosave.schedule('ab');
    mock.timers.tick(400);
    assert.deepEqual(written, ['ab'], 'only the last change is written, once');
    autosave.schedule('abc');
    mock.timers.tick(100);
    autosave.stop(); // the save finished 100ms after the last keystroke
    mock.timers.tick(1000);
    autosave.schedule('abcd');
    mock.timers.tick(1000);
    assert.deepEqual(written, ['ab'], 'nothing is written after the save');
  } finally {
    mock.timers.reset();
  }
});
