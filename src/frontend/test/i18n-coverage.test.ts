import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { test } from 'node:test';

/**
 * OJ-12: interface text lives in src/i18n/messages. A Vietnamese string left in a component would stay Vietnamese in
 * English mode, so any Vietnamese letter outside comments fails this test. Vietnamese-only letters (ă, đ, ơ, ư, and
 * the tone marks) are a reliable signal: English text never has them.
 */
const SRC = join(__dirname, '..', 'src');
const VIETNAMESE = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;

/** `\u1ea3`-style escapes that spell a Vietnamese letter: the same text, hidden from the plain check. */
const ESCAPED = /\\u(00[cC][0-9a-fA-F]|00[dDeEfF][0-9a-fA-F]|01[0-9a-fA-F]{2}|1[eE][0-9a-fA-F]{2})/;
/** A line that matches user data rather than showing text (e.g. normalising class codes) says so with this marker. */
const IGNORE = 'i18n-ignore';

/** Allowed: the Vietnamese dictionary itself, and the language switch's own name for Vietnamese ("Tiếng Việt"). */
const ALLOWED = [/^i18n\/messages\/vi\//, /^i18n\/messages\/en\/common\.ts$/];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

/** Removes comments, keeping line numbers. Good enough for this codebase: no `//` or `/*` inside Vietnamese strings. */
function stripComments(code: string) {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

test('no Vietnamese interface text outside the Vietnamese dictionary', () => {
  const found: string[] = [];
  for (const file of files(SRC)) {
    const rel = relative(SRC, file).split('\\').join('/');
    if (ALLOWED.some((re) => re.test(rel))) continue;
    const raw = readFileSync(file, 'utf8').split('\n');
    stripComments(raw.join('\n'))
      .split('\n')
      .forEach((line, i) => {
        if (raw[i].includes(IGNORE)) return;
        if (VIETNAMESE.test(line) || ESCAPED.test(line)) found.push(`${rel}:${i + 1}: ${line.trim()}`);
      });
  }
  assert.deepEqual(found, []);
});
