'use client';

import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import rehypeKatex from 'rehype-katex';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import c from 'highlight.js/lib/languages/c';
import cpp from 'highlight.js/lib/languages/cpp';
import java from 'highlight.js/lib/languages/java';
import javascript from 'highlight.js/lib/languages/javascript';
import python from 'highlight.js/lib/languages/python';
import { cn } from '@/lib/utils';

// Only the judge's languages (OJ-17): the default set bundled about 37 grammars on every page that shows Markdown.
// Other fenced languages stay plain text (ignoreMissing).
const HIGHLIGHT = { detect: false, ignoreMissing: true, languages: { c, cpp, java, javascript, python } };
// Untrusted statements, questions and replies: a huge \rule or \kern must not distort the page, and macros must not
// expand without end (OJ-17, from the code review).
const KATEX = { maxSize: 20, maxExpand: 100, strict: false };

/**
 * Renders problem statements / explanations. Content may be Markdown or plain text
 * (imported from .docx/.pdf), so single line breaks are preserved.
 */
export function Markdown({ children, className }: { children: string | null | undefined; className?: string }) {
  if (!children || !children.trim()) return null;
  return (
    <div className={cn('markdown prose prose-slate max-w-none prose-sm sm:prose-base', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath, remarkBreaks]}
        rehypePlugins={[[rehypeKatex, KATEX], [rehypeHighlight, HIGHLIGHT]]}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
