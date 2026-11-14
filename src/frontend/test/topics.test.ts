import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TopicGroups, TopicIds, type TopicId } from '@oj/contracts';
import { topics as en } from '../src/i18n/messages/en/topics';
import { topics as vi } from '../src/i18n/messages/vi/topics';
import { countTags, exactTag, MAX_SUGGESTIONS, orderTagCounts, suggestTags } from '../src/lib/topics';

/** OJ-20: topic names, tag suggestions and the topic bar's order. */

test('every standard topic and group has a Vietnamese and an English name', () => {
  for (const id of TopicIds) {
    assert.ok(vi.names[id], `vi ${id}`);
    assert.ok(en.names[id], `en ${id}`);
  }
  for (const g of TopicGroups) assert.ok(vi.groups[g] && en.groups[g], g);
  assert.equal(Object.keys(vi.names).length, TopicIds.length, 'no names for topics that do not exist');
});

const viName = (id: TopicId) => vi.names[id];

test('suggestions match the name in the interface language, the id and known aliases, without diacritics', () => {
  assert.deepEqual(suggestTags('quy hoach', viName, [], []).standard, ['dp']);
  assert.deepEqual(suggestTags('qhđ', viName, [], []).standard, ['dp'], 'an alias');
  assert.ok(suggestTags('mảng con', viName, [], []).standard.includes('prefix-sums'));
  assert.ok(suggestTags('dynamic', (id) => en.names[id], [], []).standard.includes('dp'), 'English names');
  assert.ok(suggestTags('binary', viName, [], []).standard.includes('binary-search'), 'the id');
});

test('suggestions leave out what is chosen, add the teacher\'s own tags, and stay short', () => {
  assert.ok(!suggestTags('', viName, [], ['arrays']).standard.includes('arrays'));
  assert.ok(suggestTags('', viName, [], []).standard.length <= MAX_SUGGESTIONS);
  const own = suggestTags('hsg', viName, ['thi hsg', 'dp', 'olympic'], []);
  assert.deepEqual(own, { standard: [], own: ['thi hsg'] }, 'own tags that match; standard ids are not repeated as own');
});

test('the topic bar lists chosen tags first, then standard topics, then free tags, each by count', () => {
  const counts = [{ tag: 'thi hsg', count: 9 }, { tag: 'arrays', count: 2 }, { tag: 'dp', count: 5 }, { tag: 'greedy', count: 1 }];
  assert.deepEqual(orderTagCounts(counts, ['greedy']).map((c) => c.tag), ['greedy', 'dp', 'arrays', 'thi hsg']);
  assert.deepEqual(countTags([{ tags: ['dp', 'arrays'] }, { tags: ['dp'] }]), [{ tag: 'dp', count: 2 }, { tag: 'arrays', count: 1 }]);
});

test('review: an exact topic or alias is suggested first ("cây" is trees, "tree" too, "nt" is number theory)', () => {
  assert.equal(suggestTags('cây', viName, [], []).standard[0], 'trees');
  assert.equal(suggestTags('tree', viName, [], []).standard[0], 'trees');
  assert.equal(suggestTags('nt', viName, [], []).standard[0], 'number-theory');
  assert.equal(suggestTags('mảng', viName, [], []).standard[0], 'arrays');
});

test('review: Enter adds exactly what was typed when it is a topic or own tag, as Tab does', () => {
  assert.equal(exactTag('cây', []), 'trees');
  assert.equal(exactTag('Quy hoạch động', []), 'dp');
  assert.equal(exactTag('thi hsg', ['thi hsg']), 'thi hsg');
  assert.equal(exactTag('quy hoach', []), null, 'not exact: the highlighted suggestion decides');
  assert.equal(exactTag('  ', []), null);
});

test('review: never more than MAX_SUGGESTIONS in all, and an exact own tag is not crowded out', () => {
  const own = Array.from({ length: 20 }, (_, i) => `a${i}`);
  const all = suggestTags('a', viName, own, []);
  assert.ok(all.standard.length + all.own.length <= MAX_SUGGESTIONS);
  const exact = suggestTags('so', viName, ['so'], []);
  assert.ok(exact.own.includes('so'), 'an own tag equal to the text is offered even with many topic matches');
});
