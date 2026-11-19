import assert from 'node:assert/strict';
import { test } from 'node:test';
import { containerClass, PAGE_GUTTER, resultsWide } from '../src/lib/layout';
import { activeFilterCount } from '../src/lib/bank-filters';

test('the results board is wide only above 4 problems (OJ-34)', () => {
  for (const n of [0, 1, 2, 4]) assert.equal(resultsWide(n), false, String(n));
  for (const n of [5, 6, 12]) assert.equal(resultsWide(n), true, String(n));
});

test('"Lọc (n)" counts the filters it hides: difficulty and each topic, not the search box (OJ-34)', () => {
  assert.equal(activeFilterCount({ difficulty: '', tags: [] }), 0);
  assert.equal(activeFilterCount({ difficulty: 'EASY', tags: [] }), 1);
  assert.equal(activeFilterCount({ difficulty: 'HARD', tags: ['dp', 'graph'] }), 3);
});

test('every page uses one gutter; normal pages are at most 1280 px, wide ones 1440 px (OJ-35)', () => {
  assert.equal(PAGE_GUTTER, 'px-4 sm:px-6 lg:px-8');
  for (const wide of [false, true]) assert.ok(containerClass(wide).includes(PAGE_GUTTER));
  assert.ok(containerClass(false).includes('max-w-7xl'));
  assert.ok(containerClass(true).includes('max-w-[1440px]'));
});
