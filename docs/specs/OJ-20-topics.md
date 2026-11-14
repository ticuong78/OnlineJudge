# OJ-20: Topics (arrays, subarrays, dynamic programming, ...)

Status: done (approved by the user 2026-11-13: "ok proceed to these decisions")
Owner: Htet Oo Naing
Risky area: low. It touches catalog, assessment snapshots and the learning record. No judging, identity or engine.

## Outcome

A teacher's colleague asked to organise problems into topics such as dynamic programming, arrays and subarrays. Free
tags exist today ("Chủ đề", up to 20 per problem), but they are not a usable topic system:
- Every teacher types their own words ("dp", "quy hoạch động", "qhđ"), so a filter misses problems.
- Only one tag can be filtered at a time.
- Students never see topics: sessions do not copy them.

This change makes the existing tags into topics, in two phases:
1. **Teachers:** a shared topic list, suggestions in the form, and finding problems by one or more topics.
2. **Students:** topics on practice problems, practice by topic, and progress per topic in học bạ (the learning record).
   Topics stay hidden in tests and exams while they are running, because a topic gives away the method.

## Decisions

- **Improve the tags; do not add a second "topics" feature.** Problems keep a single `tags: string[]`.
- **Flat, not a tree.** A problem often has several topics (a subarray problem is often also DP), so tags fit better than
  folders.
- **Standard topics are stable English ids.** For example `arrays`, `prefix-sums`, `dp`. Each has a vi/en label in
  `@oj/contracts`, and the interface shows the label in the current language.
- **Other tags stay free text,** shown as typed, so nothing a teacher wrote is lost.
- **Aliases are mapped on save.** Known spellings map to the standard id: "quy hoạch động", "qhđ" and
  "dynamic programming" all become `dp`. A one-off script converts existing problems and the seed data in the same way.

**Standard list (first version, about 20):**

| Group | Ids |
|---|---|
| Basics | `implementation`, `math`, `number-theory`, `strings` |
| Arrays and searching | `arrays`, `prefix-sums`, `two-pointers`, `sorting`, `binary-search` |
| Methods | `greedy`, `recursion`, `brute-force`, `dp` |
| Data structures | `stack-queue`, `hashing`, `data-structures` |
| Graphs | `graphs`, `bfs-dfs`, `shortest-paths`, `trees` |
| Other | `geometry`, `combinatorics`, `bit-manipulation` |

Adding one later is a contracts change and a dictionary entry.

## Scope

**Phase 1: teachers (catalog and frontend only)**
- **Contracts:**
  - `Topics` (ids, vi/en labels, groups) and `TOPIC_ALIASES`;
  - `ProblemTagDto {tag, count}`;
  - `ListProblemsQuery.tags` (repeated, AND).
- **Catalog:**
  - aliases are mapped when a problem is saved, imported or copied;
  - `GET /problems/tags?scope=` returns the tags in the caller's bank scope, with counts;
  - `GET /problems?tag=a&tag=b` returns problems that have all of them.
- **Frontend:**
  - The problem form suggests the standard topics (grouped) and the teacher's own tags as they type.
  - The bank gets a topic bar with counts; several topics can be chosen.
  - Labels follow the interface language.
- **Data:** a one-off script (`pnpm --filter @oj/backend topics:normalize`) applies the aliases to existing problems. It
  is idempotent and reports what it changed. The seed is updated. Since OJ-5 it is the migration `NormalizeTopics1794528060000`, run at startup before the API
  accepts requests, with the rows locked.

**Phase 2: students (assessment and learning record)**
- **Session copies:** a session's copy of each problem includes its tags (`SessionProblem.tags`). Sessions made earlier
  read as `[]`; "refresh from the bank" fills them in.
- **`SessionProblemDto.tags`** carries them, and the session problem list shows them. In tests and exams
  (`TEST`/`EXAM`) they are visible to students only after the session closes. Teachers always see them.
- **Practice by topic:** a topic picker on the Luyện tập (practice) page lists the problems of open public PRACTICE and
  HOMEWORK sessions that have the chosen topic, each linking to its solve page. Tests and exams are never listed, for
  anyone. New endpoints: `GET /practice/problems?topic=` and `GET /practice/topics` (counts), both
  `@Roles('ADMIN', 'TEACHER', 'STUDENT')`.
- **Học bạ:** per topic, solved/attempted counts across the student's sessions, counting only sessions whose topics the
  student may see. New field: `LearningRecordDto.topics: {topic, solved, attempted}[]`.

Out:
- Topic hierarchies, prerequisites, recommendations ("next problem to try").
- Teacher reports per topic for a class (a natural follow-up, separate spec).
- AI tagging of problems (could use the existing import parser later; separate spec).

## Done when

**Phase 1**
- [x] Saving a problem with "Quy hoạch động" stores `dp` and shows "Quy hoạch động" in vi and "Dynamic programming" in
      en.
- [x] The bank shows topic counts for the chosen scope, and choosing "arrays" + "prefix-sums" lists only problems with
      both.
- [x] The form suggests standard topics and the teacher's own tags.
- [x] The normalize script converts the seed's Vietnamese tags and changes nothing on a second run.

**Phase 2**
- [x] A student sees topics on a practice session's problems, and does not see them in a running test or exam (API and
      page). They appear after it closes.
- [x] The practice page lists open public practice problems for a topic.
- [x] Học bạ shows solved/attempted per topic, and a running exam's topics are not counted.
- [x] A session made before the change shows no topics until it is refreshed, and nothing breaks.

**Both**
- [x] `docs/API.md` lists the new routes and fields.
- [x] The vi/en dictionaries cover every label.
- [x] `pnpm build:shared && pnpm typecheck && pnpm test` pass.

## Contexts and contracts

- **Catalog (phase 1):** tag normalisation in the domain (`problem.ts`), the tags query in the repository. No new
  dependency.
- **Assessment (phase 2):** `SessionProblem.tags` comes from the catalog through the existing `ProblemCatalog` port
  (assessment → catalog: allowed). The learning record's copy of a session gets per-problem tags, inside the same
  context.
- **Contracts:**
  - `Topics`, `TopicId`, `TOPIC_ALIASES`, `normalizeTag()`;
  - `ProblemTagDto`;
  - the repeated `tag` filter, in the backend `ProblemListQuery` and the frontend `ProblemQuery` (neither type is in
    `@oj/contracts`; the earlier text here said otherwise);
  - `SessionProblemDto.tags`;
  - `PracticeProblemDto`;
  - `LearningRecordDto.topics`.
- **Database:**
  - no new tables;
  - session copies are JSON and gain an optional field;
  - the learning record's session copy gains per-problem tags (a nullable column or JSON field, created by
    `DB_SYNC`/migration as today);
  - existing problems are converted by the normalize script.

## Security

- `GET /problems/tags`: staff, with the same scope rules as `GET /problems` (own bank, organization, public). Counts
  never include problems the caller cannot list.
- `GET /practice/problems`: any signed-in user. Only open public practice sessions; no test data.
- **Exam rule:** in the API, tags are left out of `SessionProblemDto` and the session problem list for non-managers
  while a `TEST`/`EXAM` session is not closed. The frontend only shows what it gets.
- **Input:** tags stay limited to 20 per problem, and each tag gets a length limit (40 characters, new).

## Tests

- `backend/test/topics.test.ts`:
  - alias mapping and normalisation (case, diacritics, spaces);
  - the tag length limit;
  - the multi-tag AND filter;
  - tag counts respecting scope;
  - the normalize script being idempotent.
- **Assessment:**
  - tags copied into a session and filled in by refresh;
  - tags hidden from students in a running test/exam and shown after it closes;
  - the practice-by-topic list (public, open only);
  - học bạ topic counts excluding hidden sessions.
- `frontend/test`: topic labels by locale, the topic bar's query building, i18n coverage.

## Rollout and risks

- **Order:** phase 1 first (it is useful on its own and produces clean data); phase 2 after the normalize script has run.
- **Risk: tags that look like topics but are not mapped.** They stay free text and still filter. Teachers can pick the
  standard topic from the suggestions.
- **Risk: topics as hints.** They are hidden in running tests and exams. Homework shows them; if teachers object, a
  per-session "show topics" setting can follow.
- **Rollback:** phase 1 data stays valid as plain tags. Phase 2 fields are optional and can be ignored.

## Results and notes (2026-11-13, test system with a fresh seed)

- **Seed:** stored as topic ids through the normal save path ("quy hoạch động" → `dp`, "mảng" → `arrays`, "chuỗi" →
  `strings`).
- **Normalize script:** one problem was set back to `Quy hoạch động, qhđ, Bài thi HSG`.
  - `--dry-run` showed `[dp, bài thi hsg]`.
  - The real run changed 1 of 9 problems, and a second run changed 0.
- **Teacher:**
  - The bank's topic bar shows names with counts.
  - "Quy hoạch động" + "Tìm kiếm nhị phân" narrows the list to the one problem with both.
  - `?tag=quy hoạch động` finds `dp`.
  - In the form, "mang" suggests "Mảng" and "Tổng tiền tố, mảng con", "qhđ" + Enter adds "Quy hoạch động", and a free
    tag stays as written.
- **Student:**
  - The running exam and the upcoming exam return no topics; the teacher sees them.
  - A closed test, homework and practice show them.
  - Practice by topic lists the public practice problem with "Đã giải" (solved) and keeps the topic in the address
    (`?topic=dp`).
  - Học bạ shows solved/attempted per topic.
  - Students get 403 on `/problems/tags`.
- **Postgres:** the multi-topic filter (`@>`) and the tag counts (`unnest`, scope) were checked on a real database
  (`organization.integration.test.ts`).
- **Gate:** `pnpm build:shared && pnpm typecheck && pnpm test`: frontend 70, backend 291, engine 169, all passing.
- **Kept as specified, worth revisiting:** practice by topic covers open *public* sessions only. In the seed that is
  one problem, so a student's own class homework and practice do not appear there. Including the student's open class
  practice and homework sessions would make it more useful; it is a small change in `practiceProblems`.
- **Not covered at first:** real devices; teacher reports per topic (out of scope). See "Follow-up checks" below.

## Review (2026-11-13) and fixes

A senior review plus an independent reviewer found nothing leaking topics during exams. Their findings, all fixed:

| # | Finding | Fix |
|---|---|---|
| 1 | The practice route (and the OJ-18 trial routes) were added to the "may only shrink" allowlist instead of carrying `@Roles` | `@Roles('ADMIN', 'TEACHER', 'STUDENT')` on those controllers; allowlist entries removed |
| 2 | No test that topics travel from the bank into sessions | Tests through the real catalog facade and adapter (create, refresh, learning-record copy) and for a stored row without tags |
| 3 | Enter in the tag input added the wrong topic ("cây" → advanced data structures) | Exact matches first, then prefix, then substring, in one list of at most 8; Enter adds the exact topic or own tag, as Tab does |
| 4 | NFC and NFD spellings of a free tag were two tags | `normalizeTag` applies NFC |
| 5 | Tags from before the 40-character limit broke copying (also of sets, and when a teacher leaves an organization) | `copyFor` cuts them; the normalize script cuts them in the database |
| 6 | Học bạ loaded every test or exam in full (with hidden tests), one at a time | `SessionRepository.findListing` (one query, no test data) and `accessMany` (one class lookup, roles once per class); also used by result visibility and session lists |
| 7 | Practice by topic listed public homework and, for a manager or admin, running exams; it loaded every public session ever | Types PRACTICE and HOMEWORK only, for everyone; type and open window filtered in SQL |
| 8 | Old sessions could only get topics through refresh plus a full rejudge | The normalize script backfills missing session and learning-record topics from the bank; frozen topics are left alone |
| 9 | Practice topic counts came from a list capped at 300; `?topic=Quy hoạch động` matched nothing | `GET /practice/topics` (uncapped counts); the list is asked of the server by topic; the address topic is normalised |
| nits | Limits, picker, stale counts, links, a11y, script weight | Tag limits aligned (query 40; body a loose 200 guard, the domain gives the message) and `maxLength` on the input; a chosen topic missing from the counts stays visible with 0; bank counts reload with the list; học bạ links a topic only when practice has it; `aria-controls` only while the list is open; the single-topic picker is a radio group; the normalize script uses TypeORM alone (no queue or Redis) |

**Kept, with reasons:**
- **Folded matching of free tags:** diacritics carry meaning ("mạng" network vs "mảng" array), and folding in SQL needs
  the `unaccent` extension. Standard topics already match in any spelling.
- **A GIN index on `problems.tags`:** not needed at classroom scale. Add one with the first real migration if banks
  grow to tens of thousands of problems.

## Follow-up checks (2026-11-13, test system)

- **Running public exam, live:**
  - A public EXAM session was created from the seeded "Kiểm tra giữa kỳ" set.
  - While it ran, `GET /practice/problems` and `/practice/topics` left it out for the student, for the teacher who
    created it, and for the administrator.
  - Its own page gave students no topics and gave the creator all of them.
  - After it closed, students saw its topics, and practice still left it out.
- **Phone size (375 px, Chromium device emulation):** bank topic bar, tag suggestions, practice by topic, học bạ, and a
  session's problem list. Nothing overflows the screen.
  - Topic chips are 28 px tall and suggestions 32 px, above the 24 px WCAG 2.2 AA target size.
  - Tapping a suggestion adds it and keeps the field focused, so the phone keyboard stays open.
- **Found and fixed during the phone check:**
  - **Practice by topic rows** were 162 px tall: difficulty, session and topics each wrapped onto their own line. They
    are now three short lines (title with the solved mark, then difficulty and topics, then the session cut to one
    line): 90 px.
  - **A session's problem list** squeezed the title column on phones, so titles broke mid-word and rows were 148 and
    172 px. The topic badges made it worse. As for session rows (P1-5), the title now takes the line, and status and
    points go under it: 96 and 124 px. At 1024 px it is unchanged (72 px, one line).
- **Still not covered at that point:** physical phones and Safari. The emulator delivers taps as mouse clicks, so real
  touch events were not exercised. See "Safari check" below.
- **Gate after these changes:** frontend 73, backend 298, engine 169, all passing.

## Safari check (2026-11-13, Safari 18.6 on macOS, driven by safaridriver)

Safari was driven through WebDriver at 375 px (and at 1280 px for the bank) in the light and the dark theme.
- **Teacher:**
  - The bank topic bar works: two topics narrow the list to one problem.
  - In the tag field, "cây" suggests "Cây" first and Enter adds it, clicking "Tổng tiền tố, mảng con" adds it, and
    "Thi HSG" + Enter adds a free tag. The field keeps focus.
- **Student:**
  - Practice by topic (`?topic=dp`, radio group), học bạ by topic (links only for topics with open practice), and the
    closed public exam's problem list (topics shown).
  - Row heights match Chrome (90, 30, 96 and 124 px). No page overflows, and diacritics render correctly.
- **Found and fixed:**
  - **Blocking, Safari only, from OJ-17 (U2):** the bank's "whole row opens the problem" used a stretched link (an
    absolute `::after` over a `position: relative` table row). Safari does not position table rows (computed
    `position: static`), so the overlay covered the whole page. On Safari at every width, clicking the search box, the
    filters, the topic chips or the heading opened the last problem in the list. Chrome positions rows, so earlier
    checks missed it.
    - The row now handles the click itself (`lib/row-link.ts`): its own links and buttons and a text selection are left
      alone, and Ctrl/⌘ or middle click opens a new tab. The title stays the real link.
    - Checked in Safari and Chrome: controls are on top, a row's topic filters, and a row click opens the problem.
    - `test/row-link.test.ts` fails if a stretched-link overlay comes back, and covers the click rule.
  - **Drop-downs:** Safari drew its own glossy `<select>` (gradient, stacked arrows), which ignored the theme. All
    drop-downs now use `appearance: none` with an arrow drawn from the tokens. Checked flat in both themes.
- **Still not covered:** a physical phone (Mobile Safari, the on-screen keyboard and real touch). Desktop Safari is the
  same WebKit engine, but WebDriver clicks are mouse events.
- **Gate:** frontend 75, backend 298, engine 169, all passing.

