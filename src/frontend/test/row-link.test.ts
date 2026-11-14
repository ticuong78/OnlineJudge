import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { shouldOpenRow } from '../src/lib/row-link';

/** Regression (Safari check, OJ-20): a stretched link over a table row covered the whole page in Safari. */

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : /\.tsx$/.test(name) ? [path] : [];
  });
}

test('no stretched-link overlays: Safari does not position table rows, so the overlay escapes and covers the page', () => {
  const offenders = files(join(__dirname, '../src')).filter((f) => /after:absolute[^"']*after:inset-0|after:inset-0[^"']*after:absolute/.test(readFileSync(f, 'utf8')));
  assert.deepEqual(offenders, []);
});

/** A minimal element: `closest` walks up, `contains` checks the chain. */
function el(tag: string, parent: FakeEl | null = null): FakeEl {
  const node: FakeEl = {
    tag, parent,
    closest: (sel: string) => {
      for (let n: FakeEl | null = node; n; n = n.parent) if (sel.split(',').some((s) => s.trim() === n!.tag)) return n as unknown as Element;
      return null;
    },
    contains: (other: unknown) => { for (let n = other as FakeEl | null; n; n = n.parent) if (n === node) return true; return false; },
  };
  return node;
}
interface FakeEl { tag: string; parent: FakeEl | null; closest: (s: string) => Element | null; contains: (o: unknown) => boolean }
const asEl = (x: FakeEl) => x as unknown as Element;

test('a row click opens the page, except on links and buttons inside it or when text is being selected', () => {
  const row = el('tr');
  const cell = el('td', row);
  const tagButton = el('button', cell);
  const title = el('a', cell);
  assert.equal(shouldOpenRow(asEl(cell), asEl(row), ''), true);
  assert.equal(shouldOpenRow(asEl(tagButton), asEl(row), ''), false, 'the tag button filters instead');
  assert.equal(shouldOpenRow(asEl(title), asEl(row), ''), false, 'the real link navigates by itself');
  assert.equal(shouldOpenRow(asEl(cell), asEl(row), 'Dãy con'), false, 'selecting text is not a click to open');
});
