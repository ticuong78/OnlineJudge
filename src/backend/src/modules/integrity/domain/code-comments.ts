import type { Language } from '@oj/contracts';
import { isSpace, scanCode, type Lexeme } from './code-scanner.js';

/** What a comment's words are replaced with ("comment"). */
export const COMMENT_MARKER = '[chú thích]';

/**
 * The student's code with the words of every comment replaced by a marker (OJ-29, playbook 7.3): comments are free
 * text where a student may write their name, class or school, and that must not go to the model. The AI-use review
 * still sees where comments are and how many (a comment on every line is one of its signals), and every line keeps its
 * number, so the segments the model points at match the code the teacher sees. Python docstrings count as comments;
 * comment markers inside strings are text and stay.
 */
export function maskComments(code: string, language: Language): string {
  let out = '';
  let at = 0;
  for (const lexeme of scanCode(code, language, { precise: true })) {
    const masked = mask(code, lexeme, language);
    if (masked === null) continue;
    out += code.slice(at, lexeme.start) + masked;
    at = lexeme.end;
  }
  return out + code.slice(at);
}

/** The masked text of a comment or docstring, with as many line breaks as the original; null for anything else. */
function mask(code: string, { kind, start, end }: Lexeme, language: Language): string | null {
  const text = code.slice(start, end);
  const breaks = text.split('\n').length - 1;
  const body = COMMENT_MARKER + `\n${COMMENT_MARKER}`.repeat(breaks);
  if (kind === 'line-comment') return `${language === 'python' ? '#' : '//'} ${body}`;
  if (kind === 'block-comment') return `/* ${body}${text.length >= 4 && text.endsWith('*/') ? ' */' : ''}`;
  if (kind === 'string' && language === 'python' && isDocstring(code, start, end)) {
    const quotes = text.slice(0, 3);
    return `${quotes}${body}${text.length >= 6 && text.endsWith(quotes) ? quotes : ''}`;
  }
  return null;
}

/** A triple-quoted string that is a whole statement: only indentation (and a prefix) before it, only space or a comment after. */
function isDocstring(code: string, start: number, end: number): boolean {
  const opener = code.slice(start, start + 3);
  if (opener !== '"""' && opener !== "'''") return false;
  // A raw, unicode or bytes prefix (`r"""…"""`) still makes a docstring; an f-string never does.
  let j = start - 1;
  for (let prefix = 0; prefix < 2 && j >= 0 && 'rRuUbB'.includes(code[j]); prefix++) j--;
  for (; j >= 0 && code[j] !== '\n'; j--) if (!isSpace(code[j])) return false;
  for (let j = end; j < code.length && code[j] !== '\n'; j++) {
    if (code[j] === '#') return true;
    if (!isSpace(code[j])) return false;
  }
  return true;
}
