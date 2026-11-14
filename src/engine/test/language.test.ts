import assert from 'node:assert/strict';
import { test } from 'node:test';
import { languageSpecFor } from '../src/domain/language';

/** The sandbox's file-name rule (docker-sandbox.ts FILE_NAME): letters, digits, _ $ . -, at most 128 characters. */
const SANDBOX_FILE_NAME = /^[A-Za-z0-9_$][A-Za-z0-9_$.-]{0,127}$/;

test('a Java source file is named after its public class', () => {
  assert.equal(languageSpecFor('java', 'public class Solution { }').sourceFile, 'Solution.java');
  assert.equal(languageSpecFor('java', 'class Helper { }').sourceFile, 'Main.java');
});

test('a public class name too long for a file name is a compile error, not a free system error (NF-5)', () => {
  const longName = 'A'.repeat(200);
  const spec = languageSpecFor('java', `public class ${longName} { public static void main(String[] a) {} }`);
  assert.match(spec.sourceFile, SANDBOX_FILE_NAME, 'the sandbox accepts the file, so judging reaches javac, which reports the mismatch');
  assert.equal(spec.sourceFile, 'Main.java');
});

test('the Python syntax check leaves nothing in /box but the source, so the build can be sealed', () => {
  const spec = languageSpecFor('python', 'print(3)');
  assert.ok(spec.compile!.join(' ').includes('pycache_prefix=/tmp/'), 'bytecode goes to /tmp, not to a __pycache__ next to the source');
});
