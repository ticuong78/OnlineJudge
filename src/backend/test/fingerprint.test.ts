import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fingerprint, MIN_TOKENS, normalizedTokens, similarity } from '../src/modules/integrity/domain/fingerprint.js';

const sim = (a: string, b: string, language?: 'python' | 'cpp' | 'java' | 'javascript' | 'c') => {
  const fa = fingerprint(a, language);
  const fb = fingerprint(b, language);
  assert.ok(fa && fb, 'both programs must be long enough to compare');
  return similarity(fa, fb);
};

// The programs of the live reproduction: a student copy that renames everything, `main` included.
const original = `def solve():
    data = input().split()
    first = int(data[0])
    second = int(data[1])
    total = 0
    values = [first, second]
    for item in values:
        total = total + item
    result = total
    return result

def main():
    answer = solve()
    print(answer)

main()
`;

const renamed = `# my own solution
def compute():
    parts = input().split()
    x = int(parts[0])
    y = int(parts[1])
    acc = 0
    nums = [x, y]
    for n in nums:
        acc = acc + n
    out = acc
    return out


def run():
    res = compute()
    print(res)


run()
`;

test('REGRESSION: a copy with every name changed - main included - is a perfect match (it scored 0.69 and was not flagged)', () => {
  assert.equal(sim(original, renamed, 'python'), 1);
});

test('REGRESSION: a trailing comment on a code line changes nothing (it dropped 1.00 to 0.83)', () => {
  const commented = original.replace('total = 0', 'total = 0  # running sum').replace('return result', 'return result  # done');
  assert.equal(sim(original, commented, 'python'), 1);
  assert.deepEqual(normalizedTokens(commented, 'python'), normalizedTokens(original, 'python'));
});

test('renaming only main is invisible', () => {
  assert.equal(sim(original, original.replace(/\bmain\b/g, 'start'), 'python'), 1);
});

test('different programs stay different', () => {
  const other = `import sys
from collections import Counter

def most_common_letter(text):
    counts = Counter(ch.lower() for ch in text if ch.isalpha())
    best = max(counts.items(), key=lambda kv: (kv[1], -ord(kv[0])))
    return best

if __name__ == "__main__":
    line = sys.stdin.readline()
    letter, times = most_common_letter(line)
    print(letter, times)
`;
  assert.ok(sim(original, other, 'python') < 0.2);
});

// ---------------------------------------------------------------- comments and strings

test('a # or // inside a string is text, not a comment', () => {
  assert.deepEqual(normalizedTokens('print("# not a comment", x)', 'python'), ['print', '(', 'S', ',', 'I', ')']);
  assert.deepEqual(normalizedTokens("s = '#' + t  # but this is", 'python'), ['I', '=', 'S', '+', 'I']);
  assert.deepEqual(normalizedTokens('cout << "http://x.y" << n;', 'cpp'), ['cout', '<<', 'S', '<<', 'I', ';']);
  assert.deepEqual(normalizedTokens('puts("/* still a string */"); x++;', 'c'), ['I', '(', 'S', ')', ';', 'I', '++', ';']);
});

test('Python floor division is an operator, not a comment', () => {
  assert.deepEqual(normalizedTokens('half = n // 2', 'python'), ['I', '=', 'I', '/', '/', 'N']);
  assert.deepEqual(normalizedTokens('half = n // 2', 'cpp'), ['I', '=', 'I'], 'in C-like languages the same text is a comment');
});

test('block and line comments are dropped in C-like languages, multi-line included', () => {
  const code = `int a = 1; /* one
  two */ int b = 2; // three
  int c = 3;`;
  assert.deepEqual(normalizedTokens(code, 'cpp'), normalizedTokens('int a = 1; int b = 2; int c = 3;', 'cpp'));
  assert.deepEqual(normalizedTokens(code), normalizedTokens(code, 'java'), 'no language: the C family is assumed');
});

test('docstrings and text blocks count as one string', () => {
  assert.deepEqual(normalizedTokens('def f():\n    """Explains\n    things."""\n    return 1', 'python'), ['def', 'I', '(', ')', ':', 'S', 'return', 'N']);
  assert.deepEqual(normalizedTokens('String t = """\n  hi\n  """;', 'java'), ['String', 'I', '=', 'S', ';']);
});

test('JavaScript template literals are strings', () => {
  assert.deepEqual(normalizedTokens('const s = `a ${b}\nc`;', 'javascript'), ['const', 'I', '=', 'S', ';']);
});

test('C preprocessor: includes do not matter, macros are code', () => {
  const body = 'int main() { long long n; cin >> n; for (int i = 0; i < n; i++) cout << i * i << "\\n"; return 0; }';
  const a = `#include <bits/stdc++.h>\n#pragma GCC optimize("O2")\nusing namespace std;\n${body}`;
  const b = `#include <iostream>\n#include <vector>\nusing namespace std;\n${body}`;
  assert.deepEqual(normalizedTokens(a, 'cpp'), normalizedTokens(b, 'cpp'));
  assert.deepEqual(normalizedTokens('#define int long long\nint x;', 'cpp'), ['define', 'int', 'long', 'long', 'int', 'I', ';']);
  assert.deepEqual(normalizedTokens('#define MAX(a, b) \\\n  ((a) > (b) ? (a) : (b))\nint y;', 'cpp').slice(-3), ['int', 'I', ';']);
});

test('windows line endings do not matter', () => {
  assert.deepEqual(normalizedTokens(original.replace(/\n/g, '\r\n'), 'python'), normalizedTokens(original, 'python'));
});

// ---------------------------------------------------------------- robustness

test('unterminated strings and comments neither hang nor swallow the earlier code', () => {
  assert.deepEqual(normalizedTokens('int a; /* never closed', 'cpp'), ['int', 'I', ';']);
  assert.deepEqual(normalizedTokens('x = "never closed\ny = 1', 'python'), ['I', '=', 'S', 'I', '=', 'N'], 'a plain string ends at its line');
  assert.deepEqual(normalizedTokens('s = """never closed', 'python'), ['I', '=', 'S']);
  assert.deepEqual(normalizedTokens('printf("a\\', 'c'), ['printf', '(', 'S']);
});

test('tokenizing is linear: hostile 64KB inputs take a blink', () => {
  const hostile = [
    '/*'.repeat(32_000),
    '"'.repeat(64_000),
    "'\\".repeat(30_000),
    '#define '.repeat(8_000),
    '\n#\n'.repeat(20_000),
    'a'.repeat(64_000),
    '1.'.repeat(30_000),
  ];
  for (const code of hostile) {
    const started = performance.now();
    for (const language of [undefined, 'python', 'cpp', 'javascript'] as const) normalizedTokens(code, language);
    assert.ok(performance.now() - started < 1500, `${code.slice(0, 12)}... was slow`);
  }
});

test('trivial programs are still not compared', () => {
  assert.equal(fingerprint('a, b = map(int, input().split())\nprint(a + b)\n', 'python'), null);
  assert.ok(normalizedTokens('a, b = map(int, input().split())\nprint(a + b)\n', 'python').length < MIN_TOKENS);
});
