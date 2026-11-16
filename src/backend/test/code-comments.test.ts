import assert from 'node:assert/strict';
import { test } from 'node:test';
import { COMMENT_MARKER, maskComments } from '../src/modules/integrity/domain/code-comments.js';

// OJ-29 (playbook 7.3): the AI-use review sends a student's code without the words of their comments.
const lines = (s: string) => s.split('\n').length;
const NAME = 'Nguyen Van An lop 10A1';

test('C and C++: line and block comments are masked, line numbers kept', () => {
  const code = [
    '#include <bits/stdc++.h>',
    `// ${NAME}`,
    'int main() { /* doc tu ban phim */ int n; std::cin >> n;',
    '  /* tinh tong',
    `     ${NAME} */ std::cout << n; // in ra`,
    '}',
  ].join('\n');
  for (const language of ['c', 'cpp'] as const) {
    const masked = maskComments(code, language);
    assert.equal(lines(masked), lines(code));
    assert.ok(!masked.includes('Nguyen') && !masked.includes('tinh tong') && !masked.includes('in ra'));
    const out = masked.split('\n');
    assert.equal(out[0], '#include <bits/stdc++.h>', 'an #include line is not a comment');
    assert.equal(out[1], `// ${COMMENT_MARKER}`);
    assert.equal(out[2], `int main() { /* ${COMMENT_MARKER} */ int n; std::cin >> n;`);
    assert.equal(out[3], `  /* ${COMMENT_MARKER}`);
    assert.equal(out[4], `${COMMENT_MARKER} */ std::cout << n; // ${COMMENT_MARKER}`, 'code after a block comment stays on its line');
    assert.equal(out[5], '}');
  }
});

test('Java and JavaScript: comment markers inside strings are left alone', () => {
  const java = `String s = "// not a comment"; /* ${NAME} */ char c = '/'; // ${NAME}`;
  assert.equal(maskComments(java, 'java'), `String s = "// not a comment"; /* ${COMMENT_MARKER} */ char c = '/'; // ${COMMENT_MARKER}`);
  const js = `const u = \`http://x.y // still a string\`; // ${NAME}\nconst v = '/* nor this */';`;
  assert.equal(maskComments(js, 'javascript'), `const u = \`http://x.y // still a string\`; // ${COMMENT_MARKER}\nconst v = '/* nor this */';`);
});

test('C: a char literal holding a slash does not start a comment', () => {
  const code = "if (c == '/') x++; // dem dau gach\nputs(\"/* string */\");";
  assert.equal(maskComments(code, 'c'), `if (c == '/') x++; // ${COMMENT_MARKER}\nputs("/* string */");`);
});

test('an unclosed block comment masks the rest of the file and keeps its line count', () => {
  const code = `int x = 1; /* ${NAME}\nline two\nline three`;
  const masked = maskComments(code, 'cpp');
  assert.equal(lines(masked), 3);
  assert.equal(masked, `int x = 1; /* ${COMMENT_MARKER}\n${COMMENT_MARKER}\n${COMMENT_MARKER}`);
});

test('Python: # comments and docstrings are masked, # inside a string is not', () => {
  const code = [
    'def solve(n):',
    `    """${NAME}`,
    '    tinh tong cac so"""',
    '    s = "# not a comment"  # cong don',
    "    t = '''not a docstring''' + s",
    '    return n // 2',
    `# ${NAME}`,
  ].join('\n');
  const masked = maskComments(code, 'python');
  assert.equal(lines(masked), lines(code));
  const out = masked.split('\n');
  assert.equal(out[1], `    """${COMMENT_MARKER}`);
  assert.equal(out[2], `${COMMENT_MARKER}"""`);
  assert.equal(out[3], `    s = "# not a comment"  # ${COMMENT_MARKER}`);
  assert.equal(out[4], "    t = '''not a docstring''' + s", 'a triple-quoted string inside an expression is a value, not a docstring');
  assert.equal(out[5], '    return n // 2', '// is floor division in Python');
  assert.equal(out[6], `# ${COMMENT_MARKER}`);
  assert.ok(!masked.includes('Nguyen') && !masked.includes('cong don'));
});

test('code without comments is returned unchanged', () => {
  const code = 'a, b = map(int, input().split())\nprint(a + b)\n';
  assert.equal(maskComments(code, 'python'), code);
  assert.equal(maskComments('int main(){return 0;}\n', 'cpp'), 'int main(){return 0;}\n');
});

test('any code keeps its line count, in every language (random inputs)', () => {
  const pieces = ['/', '*', '#', '"', "'", '`', '\\', '\n', ' ', 'x', '"""', "'''", '//', '/*', '*/'];
  let seed = 29;
  const random = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let k = 0; k < 5000; k++) {
    let code = '';
    for (let j = Math.floor(random() * 30); j > 0; j--) code += pieces[Math.floor(random() * pieces.length)];
    for (const language of ['c', 'cpp', 'java', 'javascript', 'python'] as const) {
      assert.equal(lines(maskComments(code, language)), lines(code), JSON.stringify([code, language]));
    }
  }
});

// Security-verifier findings on OJ-29 PR A: each of these sent a comment's words to the model.
test('F1: a comment after a preprocessor line is masked', () => {
  assert.equal(maskComments('#include <bits/stdc++.h> // Nguyen Van An', 'cpp'), `#include <bits/stdc++.h> // ${COMMENT_MARKER}`);
  assert.equal(maskComments('#pragma GCC optimize("O2") // lop 10A1', 'cpp'), `#pragma GCC optimize("O2") // ${COMMENT_MARKER}`);
  const block = '#include <stdio.h> /* bat dau\nNguyen Van An\n*/\nint main(){}';
  assert.equal(maskComments(block, 'c'), `#include <stdio.h> /* ${COMMENT_MARKER}\n${COMMENT_MARKER}\n${COMMENT_MARKER} */\nint main(){}`);
  assert.equal(maskComments('#include "a//b.h"\nint x;', 'cpp'), '#include "a//b.h"\nint x;', 'a // inside a quoted include is not a comment');
  assert.equal(maskComments(`#if C == '"' // Nguyen Van An\n#endif`, 'c'), `#if C == '"' // ${COMMENT_MARKER}\n#endif`, 'a quote in a char literal opens no string');
});

test('C and C++: a line comment continued with a backslash (CRLF or trailing space) stays masked', () => {
  for (const eol of ['\n', '\r\n', ' \n']) {
    const code = `int x; // Ten \\${eol}Nguyen Van An\nint y;`;
    const masked = maskComments(code, 'cpp');
    assert.ok(!masked.includes('Nguyen'), JSON.stringify(eol));
    assert.equal(lines(masked), lines(code));
  }
  assert.equal(maskComments('int x; // a \\\nint y;', 'java'), `int x; // ${COMMENT_MARKER}\nint y;`, 'Java has no line continuation');
});

test('C++14 digit separators, escaped quotes in triple-quoted strings and prefixed docstrings do not hide a comment', () => {
  assert.equal(maskComments("int n = 1'000'000; // Nguyen Van An", 'cpp'), `int n = 1'000'000; // ${COMMENT_MARKER}`);
  assert.equal(maskComments('x = """a\\""""  # Nguyen Van An', 'python'), `x = """a\\""""  # ${COMMENT_MARKER}`);
  assert.equal(maskComments('String s = """\n a\\"""";  // Nguyen Van An', 'java'), `String s = """\n a\\"""";  // ${COMMENT_MARKER}`);
  assert.equal(maskComments('def f():\n    r"""Nguyen Van An"""\n    return 1', 'python'), `def f():\n    r"""${COMMENT_MARKER}"""\n    return 1`);
});
