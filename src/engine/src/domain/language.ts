import type { Language } from '@oj/contracts';

/**
 * How a language is compiled and executed inside a POSIX sandbox.
 * Commands are argv arrays; `{mem}` is replaced with the memory limit in MB.
 */
export interface LanguageSpec {
  language: Language;
  sourceFile: string;
  compile?: string[];
  run: string[];
  /** Extra container memory on top of the problem limit (runtime baseline, e.g. the JVM). */
  memoryOverheadMb: number;
}

const JAVA_CLASS_RE = /public\s+(?:final\s+)?class\s+([A-Za-z_$][\w$]*)/;
/** `${name}.java` must fit the sandbox's 128-character file names. */
const MAX_JAVA_CLASS_NAME = 123;

export function languageSpecFor(language: Language, sourceCode: string): LanguageSpec {
  switch (language) {
    case 'cpp':
      return {
        language,
        sourceFile: 'main.cpp',
        compile: ['g++', '-O2', '-std=c++17', '-pipe', '-o', 'main', 'main.cpp'],
        run: ['./main'],
        memoryOverheadMb: 16,
      };
    case 'c':
      return {
        language,
        sourceFile: 'main.c',
        compile: ['gcc', '-O2', '-std=c11', '-pipe', '-o', 'main', 'main.c', '-lm'],
        run: ['./main'],
        memoryOverheadMb: 16,
      };
    case 'python':
      return {
        language,
        sourceFile: 'main.py',
        // A syntax check only. Its bytecode goes to /tmp (emptied after every test), so /box holds just the source and
        // can be sealed: a __pycache__ directory made by the program's user could not be (see docker-sandbox.ts).
        compile: ['python3', '-X', 'pycache_prefix=/tmp/pycache', '-m', 'py_compile', 'main.py'],
        run: ['python3', '-S', 'main.py'],
        memoryOverheadMb: 32,
      };
    case 'javascript':
      return {
        language,
        sourceFile: 'main.js',
        run: ['node', '--max-old-space-size={mem}', 'main.js'],
        memoryOverheadMb: 64,
      };
    case 'java': {
      // Java requires the file name to match the public class; default to Main. A name too long for a sandbox file
      // name (128 characters) also gets Main, so javac reports the mismatch as a compile error rather than the sandbox
      // refusing the file, which would be a free system error (audit NF-5).
      const found = JAVA_CLASS_RE.exec(sourceCode)?.[1];
      const className = found && found.length <= MAX_JAVA_CLASS_NAME ? found : 'Main';
      return {
        language,
        sourceFile: `${className}.java`,
        compile: ['javac', '-J-Xmx512m', '-encoding', 'UTF-8', `${className}.java`],
        run: ['java', '-Xmx{mem}m', '-Xss64m', '-XX:+UseSerialGC', className],
        memoryOverheadMb: 128,
      };
    }
  }
}

export function withMemory(argv: string[], memoryLimitMb: number): string[] {
  return argv.map((a) => a.replace('{mem}', String(memoryLimitMb)));
}
