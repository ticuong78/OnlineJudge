# OJ-22: AI rewrite of a problem's title

Status: done (approved by the user 2026-11-13: "Make everything you can now", after the plan that listed title rewrites)
Owner: Htet Oo Naing
Risky area: yes (a Claude adapter's prompt changes)

## Outcome

Teachers can ask the AI for a better problem title, as they already can for the statement, input, output and
constraints. It uses the `SECTION` allowance of OJ-21 (free teachers: 20 a month).

## Scope

In:
- **Contracts:** `SuggestableSection = ProblemTextField | 'title'` for `SuggestProblemSectionRequest.section`. The
  file-I/O section list does not change: a title has no input or output.
- **Catalog:**
  - The DTO accepts `title`.
  - The service rewrites titles with no file-I/O fallback and counts one `SECTION` use.
  - The result is one line, without a leading "Bài 1." number, at most 120 characters.
  - The section writer's prompt gets a title rule (prompt version 2).
- **Frontend:**
  - A "Dùng gợi ý" (use suggestion) switch next to the title field in the problem form and on imported drafts.
  - It is separate from the whole-problem switch, which keeps its four sections, so it costs nothing extra.
  - vi/en strings.

Out: suggestions for tags or difficulty.

## Done when

- [x] `POST /problems/suggest-section` with `section: "title"` returns one clean line and counts one `SECTION` use; a
      failure refunds it.
- [x] The switch appears by the title field, can be turned off to restore the teacher's title, and shows the
      allowance when it is used up.
- [x] Tests:
  - the service cleans the title;
  - a title never uses the file-I/O fallback;
  - the DTO accepts `title`.
- [x] `exam-parser.test.ts`, `test-suggestions.test.ts` and `external-links.test.ts` pass, and so does the gate.

## AI

- Same model (`CLAUDE_MODEL`) and zod schema (`{ text, notes }`).
- The prompt constant gains a rule for "Tên bài (title)": short, describes the task, no numbering or final full stop.
- Cost: one small call (a few hundred tokens out).
- Without a key: 400 `catalog.ai_unavailable`, as for the other sections.
