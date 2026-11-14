import assert from 'node:assert/strict';
import { test } from 'node:test';
import { stripExternalLinks } from '../src/shared/domain/external-links.js';

/**
 * Upper bound for the OJ-15 speed tests. Generous on purpose: the suites run in parallel and timings vary under load,
 * while the quadratic versions these guard against took 4 to 34 seconds on the same inputs.
 */
const LIMIT_MS = 1_000;

const strip = (s: string) => stripExternalLinks(s).text;

test('a line that only points to another site goes entirely', () => {
  const r = stripExternalLinks('Cho mảng gồm n số nguyên dương.\nLink problem : https://leetcode.com/problems/minimum-size-subarray-sum/    \nTìm đoạn con ngắn nhất.');
  assert.equal(r.text, 'Cho mảng gồm n số nguyên dương.\nTìm đoạn con ngắn nhất.');
  assert.deepEqual(r.removed, ['leetcode.com']);
  assert.equal(strip('Nguồn: https://codeforces.com/problemset/problem/4/A'), '');
  assert.equal(strip('Xem thêm tại www.spoj.com/problems/TEST.'), '');
  assert.equal(strip('[Đề gốc](https://vnoi.info/problems/ABC)'), '');
  assert.equal(strip('<https://oj.vnoi.info/problem/abc>'), '');
});

test('invitations to groups and channels go with their line', () => {
  assert.equal(strip('Tham gia nhóm Zalo để nhận thêm đề: https://zalo.me/g/abcdef\nCho n.'), 'Cho n.');
  assert.equal(strip('Join Discord: discord.gg/abc123'), '');
  assert.equal(strip('Fanpage: facebook.com/tinhoc.thpt'), '');
  assert.equal(strip('Đăng ký kênh t.me/onthi_hsg nhé!'), '');
});

test('a link inside a real sentence is removed and the sentence kept', () => {
  assert.equal(strip('Dãy Fibonacci (https://vi.wikipedia.org/wiki/Fibonacci) được định nghĩa như sau:'), 'Dãy Fibonacci được định nghĩa như sau:');
  assert.equal(strip('Cho [dãy Fibonacci](https://vi.wikipedia.org/wiki/Fibonacci) gồm n số.'), 'Cho dãy Fibonacci gồm n số.');
});

test('text without links is untouched', () => {
  const s = 'Cho n số nguyên. In ra tổng.\nRàng buộc: 1 ≤ n ≤ 10^5, a.b là số thực.\nNhóm các số chẵn lại.';
  assert.deepEqual(stripExternalLinks(s), { text: s, removed: [] });
});

// ---------------------------------------------------------------- OJ-15 F4: untrusted text cannot stall the server

test('F4 regression: link stripping stays linear on long runs of spaces and unclosed Markdown links', () => {
  const sp = ' '.repeat(50_000);
  for (const [name, text] of [
    ['spaces before a link', `xem tại ${sp}http://a.vn`], // 7.6 s before the fix
    ['unclosed Markdown link', `[a](${'b'.repeat(50_000)} c`], // 3.5 s
    ['many unclosed Markdown links', '[a](b '.repeat(8_000)],
    ['spaces before a colon', `http://a.vn${sp}x${sp}:`],
  ] as const) {
    const start = performance.now();
    stripExternalLinks(text);
    assert.ok(performance.now() - start < LIMIT_MS, name);
  }
});

test('F4: the rewritten clean-up gives the same lines as before', () => {
  assert.equal(stripExternalLinks('Đề bài (https://leetcode.com/x) :  tính tổng').text, 'Đề bài: tính tổng');
  assert.equal(stripExternalLinks('Xem [đề gốc](https://cses.fi/problemset/task/1068 "CSES") rồi làm').text, 'Xem đề gốc rồi làm');
});
