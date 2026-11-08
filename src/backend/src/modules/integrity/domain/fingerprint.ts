import type { Language } from '@oj/contracts';

/**
 * Code similarity by fingerprinting (the idea behind MOSS):
 * 1. tokenize, dropping comments/whitespace and replacing identifiers, numbers and strings by placeholders,
 *    so renaming variables or reformatting does not hide copying;
 * 2. hash every k-gram of tokens;
 * 3. keep the minimum hash of each window of w consecutive k-grams ("winnowing");
 * 4. similarity = Jaccard index of the two fingerprint sets.
 * Short programs are not compared: trivial solutions all look alike.
 */
const K = 5;
const WINDOW = 4;
export const MIN_TOKENS = 40;

/**
 * Words that stay as they are: the language's keywords and the library names every solution uses.
 * Never put a name the author chooses here (`main`, `solve`, ...): renaming it would change the fingerprint,
 * which is exactly what the abstraction is there to prevent.
 */
const KEYWORDS = new Set([
  // C / C++ / Java / JS
  'int', 'long', 'short', 'char', 'float', 'double', 'bool', 'boolean', 'void', 'auto', 'const', 'static', 'unsigned',
  'signed', 'struct', 'class', 'public', 'private', 'protected', 'return', 'if', 'else', 'for', 'while', 'do', 'switch',
  'case', 'break', 'continue', 'new', 'delete', 'true', 'false', 'null', 'nullptr', 'this', 'template', 'typename',
  'using', 'namespace', 'define', 'let', 'var', 'function', 'import', 'export', 'try', 'catch', 'throw',
  'string', 'vector', 'map', 'set', 'pair', 'cin', 'cout', 'scanf', 'printf', 'endl', 'sizeof', 'typedef',
  'final', 'extends', 'implements', 'interface', 'throws', 'String', 'System', 'Scanner', 'Math', 'console',
  // Python
  'def', 'in', 'not', 'and', 'or', 'is', 'elif', 'pass', 'lambda', 'None', 'True', 'False', 'from', 'as', 'with',
  'yield', 'global', 'range', 'len', 'print', 'input', 'list', 'dict', 'sorted', 'sum', 'min', 'max', 'split',
]);

const OPERATORS = ['==', '!=', '<=', '>=', '&&', '||', '<<', '>>', '++', '--'];
const PUNCTUATION = new Set('+-*/%=<>!&|^~?:;,.(){}[]');
/** Preprocessor lines with no bearing on what the program does; `#define` is kept because macros are code. */
const DROPPED_DIRECTIVES = /^#\s*(include|pragma|if|ifdef|ifndef|else|elif|endif|error|warning|undef|line)\b/;

const isSpace = (c: string) => c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f' || c === '\v';
const isWordStart = (c: string) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_' || c === '$';
const isDigit = (c: string) => c >= '0' && c <= '9';
const isWordPart = (c: string) => isWordStart(c) || isDigit(c);

/**
 * Tokens with identifiers/literals abstracted. One pass over the source, so a `#` or `//` inside a string
 * is text, not a comment, and a comment hides nothing that follows it. `language` picks the comment syntax
 * (hash comments for Python; line and block comments for the others); without it the C family is assumed.
 */
export function normalizedTokens(code: string, language?: Language): string[] {
  const python = language === 'python';
  const cFamily = language === 'c' || language === 'cpp' || language === undefined;
  const tokens: string[] = [];
  const n = code.length;
  let i = 0;

  const skipLine = () => {
    // A directive may continue on the next line with a trailing backslash.
    while (i < n && code[i] !== '\n') i += code[i] === '\\' && code[i + 1] === '\n' ? 2 : 1;
  };
  const skipPast = (end: string) => {
    const at = code.indexOf(end, i);
    i = at < 0 ? n : at + end.length;
  };
  const skipQuoted = (quote: string, multiline: boolean) => {
    i++;
    while (i < n && code[i] !== quote) {
      if (code[i] === '\\') i++;
      else if (code[i] === '\n' && !multiline) return; // an unterminated string ends at the line
      i++;
    }
    i++;
  };
  const lineStart = (at: number) => {
    for (let j = at - 1; j >= 0 && code[j] !== '\n'; j--) if (!isSpace(code[j])) return false;
    return true;
  };

  while (i < n) {
    const c = code[i];
    if (isSpace(c)) { i++; continue; }

    // comments
    if (python ? c === '#' : c === '/' && code[i + 1] === '/') { skipLine(); continue; }
    if (!python && c === '/' && code[i + 1] === '*') { i += 2; skipPast('*/'); continue; }

    // C preprocessor
    if (cFamily && c === '#' && lineStart(i)) {
      if (DROPPED_DIRECTIVES.test(code.slice(i, i + 16))) { skipLine(); continue; }
      i++; // `#define ...`: the rest of the line is scanned like code
      continue;
    }

    // strings and character literals
    if (c === '"' || c === "'") {
      if ((python || language === 'java') && code.startsWith(c.repeat(3), i)) { i += 3; skipPast(c.repeat(3)); }
      else skipQuoted(c, false);
      tokens.push('S');
      continue;
    }
    if (c === '`' && !python && language !== 'java' && !cFamily) { skipQuoted('`', true); tokens.push('S'); continue; }

    if (isWordStart(c)) {
      const start = i;
      while (i < n && isWordPart(code[i])) i++;
      const word = code.slice(start, i);
      tokens.push(KEYWORDS.has(word) ? word : 'I');
      continue;
    }
    if (isDigit(c)) {
      while (i < n && (isWordPart(code[i]) || code[i] === '.')) i++;
      tokens.push('N');
      continue;
    }

    const two = code.slice(i, i + 2);
    if (OPERATORS.includes(two)) { tokens.push(two); i += 2; continue; }
    if (PUNCTUATION.has(c)) tokens.push(c);
    i++; // anything else (`@`, `\`, stray `#`) carries no meaning for the comparison
  }
  return tokens;
}

/** Winnowed fingerprint set; null if the program is too short to compare meaningfully. */
export function fingerprint(code: string, language?: Language): Set<number> | null {
  const tokens = normalizedTokens(code, language);
  if (tokens.length < MIN_TOKENS) return null;
  const hashes: number[] = [];
  for (let i = 0; i + K <= tokens.length; i++) hashes.push(hash(tokens.slice(i, i + K).join('\u0001')));
  const result = new Set<number>();
  for (let i = 0; i + WINDOW <= hashes.length; i++) {
    let min = hashes[i];
    for (let j = 1; j < WINDOW; j++) min = Math.min(min, hashes[i + j]);
    result.add(min);
  }
  return result;
}

export function similarity(a: Set<number>, b: Set<number>): number {
  let common = 0;
  for (const h of a) if (b.has(h)) common++;
  const union = a.size + b.size - common;
  return union === 0 ? 0 : common / union;
}

/** FNV-1a 32-bit. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
