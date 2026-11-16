import type { Language } from '@oj/contracts';

/**
 * One pass over source code that knows where comments, strings and preprocessor lines start and end, so a `#` or `//`
 * inside a string is text, not a comment, and a comment hides nothing that follows it. `language` picks the comment
 * syntax (hash comments for Python; line and block comments for the others); without it the C family is assumed.
 * Shared by the plagiarism fingerprint and the comment masker of the AI-use review (OJ-29), so both read code the same way.
 */
export type LexemeKind =
  | 'line-comment'
  | 'block-comment'
  /** A preprocessor line with no bearing on what the program does (`#include`, `#pragma`, ...). */
  | 'directive'
  /** The `#` of a `#define` (the rest of that line is code). */
  | 'hash'
  | 'string'
  | 'word'
  | 'number'
  | 'operator'
  | 'punctuation'
  /** Anything else (`@`, `\`, a stray `#`). */
  | 'other';

export interface Lexeme {
  kind: LexemeKind;
  /** Offsets into the code: `code.slice(start, end)` is the lexeme's text. */
  start: number;
  end: number;
}

const OPERATORS = ['==', '!=', '<=', '>=', '&&', '||', '<<', '>>', '++', '--'];
const PUNCTUATION = new Set('+-*/%=<>!&|^~?:;,.(){}[]');
/** Preprocessor lines with no bearing on what the program does; `#define` is kept because macros are code. */
const DROPPED_DIRECTIVES = /^#\s*(include|pragma|if|ifdef|ifndef|else|elif|endif|error|warning|undef|line)\b/;

export const isSpace = (c: string) => c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f' || c === '\v';
const isWordStart = (c: string) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_' || c === '$';
const isDigit = (c: string) => c >= '0' && c <= '9';
const isWordPart = (c: string) => isWordStart(c) || isDigit(c);

export interface ScanOptions {
  /**
   * Find every comment as the compiler would, for the comment masker of the AI-use review (OJ-29): comments after a
   * preprocessor line, C line continuations with CRLF or trailing spaces, C++14 digit separators, escaped quotes in
   * triple-quoted strings. Off for the plagiarism fingerprint, whose tokens must not change.
   */
  precise?: boolean;
}

/** The lexemes of `code` in order; whitespace between them is skipped. */
export function scanCode(code: string, language?: Language, { precise = false }: ScanOptions = {}): Lexeme[] {
  const python = language === 'python';
  const cFamily = language === 'c' || language === 'cpp' || language === undefined;
  const lexemes: Lexeme[] = [];
  const n = code.length;
  let i = 0;

  const emit = (kind: LexemeKind, start: number) => lexemes.push({ kind, start, end: i });
  const skipLine = () => {
    // A directive may continue on the next line with a trailing backslash.
    while (i < n && code[i] !== '\n') i += code[i] === '\\' && code[i + 1] === '\n' ? 2 : 1;
  };
  /** At `i`: a backslash that continues the line, with optional trailing spaces and CRLF; returns its length or 0. */
  const continuation = () => {
    if (code[i] !== '\\') return 0;
    let j = i + 1;
    while (code[j] === ' ' || code[j] === '\t') j++;
    if (code[j] === '\r') j++;
    return code[j] === '\n' ? j + 1 - i : 0;
  };
  /** A line comment: only C and C++ continue one onto the next line. */
  const skipLineComment = () => {
    if (!precise) return skipLine();
    while (i < n && code[i] !== '\n') i += (cFamily && continuation()) || 1;
  };
  /** A preprocessor line up to its end or to a comment on it, which is then scanned as a comment. */
  const skipDirective = () => {
    if (!precise) return skipLine();
    while (i < n && code[i] !== '\n') {
      if (code[i] === '/' && (code[i + 1] === '/' || code[i + 1] === '*')) return;
      if (code[i] === '"' || code[i] === "'") skipQuoted(code[i], false);
      else i += continuation() || 1;
    }
  };
  /** A triple-quoted string; with `precise`, a backslash escapes the next character, as in Python and Java. */
  const skipTripleQuoted = (quotes: string) => {
    i += 3;
    if (!precise) return skipPast(quotes);
    while (i < n) {
      if (code[i] === '\\') i += 2;
      else if (code.startsWith(quotes, i)) { i += 3; return; }
      else i++;
    }
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
    const start = i;
    if (isSpace(c)) { i++; continue; }

    // comments
    if (python ? c === '#' : c === '/' && code[i + 1] === '/') { skipLineComment(); emit('line-comment', start); continue; }
    if (!python && c === '/' && code[i + 1] === '*') { i += 2; skipPast('*/'); emit('block-comment', start); continue; }

    // C preprocessor
    if (cFamily && c === '#' && lineStart(i)) {
      if (DROPPED_DIRECTIVES.test(code.slice(i, i + 16))) { skipDirective(); emit('directive', start); continue; }
      i++; // `#define ...`: the rest of the line is scanned like code
      emit('hash', start);
      continue;
    }

    // strings and character literals
    if (c === '"' || c === "'") {
      if ((python || language === 'java') && code.startsWith(c.repeat(3), i)) skipTripleQuoted(c.repeat(3));
      else skipQuoted(c, false);
      emit('string', start);
      continue;
    }
    if (c === '`' && !python && language !== 'java' && !cFamily) { skipQuoted('`', true); emit('string', start); continue; }

    if (isWordStart(c)) {
      while (i < n && isWordPart(code[i])) i++;
      emit('word', start);
      continue;
    }
    if (isDigit(c)) {
      // `1'000'000`: a C++14 digit separator is part of the number, not the start of a character literal.
      const separator = () => precise && cFamily && code[i] === "'" && isWordPart(code[i + 1] ?? '');
      while (i < n && (isWordPart(code[i]) || code[i] === '.' || separator())) i++;
      emit('number', start);
      continue;
    }

    if (OPERATORS.includes(code.slice(i, i + 2))) { i += 2; emit('operator', start); continue; }
    i++;
    emit(PUNCTUATION.has(c) ? 'punctuation' : 'other', start);
  }
  // A string's closing-quote step can run one past the end of unterminated code; offsets never pass it.
  for (const lexeme of lexemes) lexeme.end = Math.min(lexeme.end, n);
  return lexemes;
}
