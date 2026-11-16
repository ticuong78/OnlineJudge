# Online Judge (classroom)

An automatic judge for programming classes. The interface is in Vietnamese (default) and English; this README describes
the product and how to run it. Interface labels are given in English, with the Vietnamese label in parentheses where it
helps to find the button.

## What it does

- **Teacher's bank.** Every teacher has their own bank of problems and problem sets (the "blueprint"). Teachers write
  problems themselves or **upload a `.docx` / `.pdf` exam**; the system splits it into problems for the teacher to review
  and grade by difficulty. Every problem has tests and a **solution** (explanation and code).
- **Sharing.** Problems are private by default. The statement, hidden tests and solution can each be made public.
  Other teachers can view them and **save a copy** to their own bank (the source is recorded). A problem set can be
  public only when every problem in it is public.
- **Sessions (assignments).** A teacher creates a session from a problem set or a single problem and assigns it to a
  class or makes it **public**, with optional opening and closing times. A session snapshots the problems when it is
  created, so editing the bank does not change a running session. Submissions, scores and "solved" status belong to the
  session.
- **Classes.** Each class has one teacher, many students and its own class code (for example `22DTHC5`). A student may
  be in **several classes at once**, or in none (a free participant who takes public sessions and practises). Students
  **send a request** to join or leave a class and the teacher approves it; teachers can also add students by email or
  remove them. Classes a student left stay in their history. At the end of a course the teacher **archives** the class:
  it becomes read-only and students can still review it. An archived class can be restored, scheduled for **permanent
  deletion** after N days, or deleted at once (the teacher types the class name to confirm).
- **Exam mode** (per session):
  - Each student has their own time: the clock starts only when they press "Start" (Bắt đầu làm bài), and only then is
    the statement shown. When time is up, submitting is locked; the server checks against its own clock.
  - A countdown with sound alerts at 15, 5 and 1 minutes left and when time is up.
  - Allowed languages and a limit on submissions per problem, which holds even for parallel submissions. A system error
    does not count as an attempt, except an error after the student's program has started running: each student gets 2
    such errors free per problem, and from the third on each one counts (and keeps counting), so nobody can provoke system
    errors to probe hidden tests for free. Errors before the program runs (queue unreachable, judge not starting, result
    lost) never count, and the teacher can always rejudge.
  - What students see: full results, score only, or nothing until the session closes. Teachers always see everything.
  - **Rejudge** a whole session or one problem, and "Update from the bank and rejudge" after fixing tests. Scores and the
    learning record are recalculated.
- **Off-topic content removed on import.** Links to other sites (for example `Link problem : https://leetcode.com/...`),
  invitations to groups or channels (Zalo, Facebook, Telegram, Discord) and advertising are removed; the AI is also told
  to drop propaganda or calls to break the law. Links are filtered again by rule after reading, also when the rule-based
  reader is used.
- **Paste an exam.** On the import page, the *Paste text* tab takes text with one or more problems; *Restructure with AI*
  splits it into problems as for an uploaded file.
- **AI exam reading** (with `ANTHROPIC_API_KEY`). Claude reads PDF files directly (even messy layouts or scans) or the
  text of a Word file. Without a key, or when the AI fails, the rule-based reader is used.
  The judge uses standard input and output only. A statement such as "read from BAI1.INP, write to BAI1.OUT" keeps the
  teacher's wording but cannot be saved until it is fixed: next to each section (Statement, Input, Output, Constraints)
  a **Use suggestion** (Dùng gợi ý) switch rewrites it to standard input and output, and switching it off restores the
  original. AI notes about file input and output are dropped.
- **Use suggestion (AI rewrites one section).** When creating, editing or importing a problem, each section has a *Use
  suggestion* switch: on, the AI rewrites that section from the rest of the problem; off, the original returns. *Use
  suggestions for the whole problem* switches every section. Suggestions are remembered by content: switching back on
  while the problem is unchanged reuses the earlier suggestion without another AI call; *Rewrite* asks for a new one.
  Suggestions never read or write files. The **problem title** has the same switch (OJ-22), counted as a rewrite.
- **Tests written with the problem.** When creating or importing a problem, the *Tests* section sits under the statement:
  type tests or ask the AI for suggestions. Each test has an *Is example* box (examples appear in the statement; the rest
  stay hidden). The problem and its tests are saved together. When editing an existing problem, tests are on the same
  *Statement and tests* page and each test change is saved at once.
- **Assign once.** A problem or problem set is assigned only once to the same target (a class, or public), even when
  "Assign" is pressed several times; assigning again leads to the existing session. After deleting that session it can be
  assigned again.
- **AI test suggestions.** In the Tests section, press *Suggest with AI*. Claude reads the statement, the existing tests
  and the reference solution, proposes edge and special cases, and **runs the code** in Anthropic's sandbox to compute the
  outputs. The teacher reviews, edits and picks which tests to add; tests whose output the AI computed without running
  code are marked for checking. The statement, input, output and constraints always win over the teacher's extra note:
  a note that contradicts the problem (for example asking for negative numbers when the statement says positive
  integers) is ignored, and the AI explains why in a red box.
- **Trial run** (OJ-18). On the solve page a student can run their code on the problem's **sample tests** and see the
  input, the expected output, their own output, the verdict and the time for each. A trial is not a submission: it does
  not count as an attempt, does not touch the score and is never saved in the database (results are kept briefly in
  Redis). One trial at a time per student, and at most 20
  per 10 minutes.
- **Topics** (OJ-20). Problems carry standard topics (for example dynamic programming, arrays), whatever spelling the
  teacher types ("dp", "quy hoạch động"). The bank filters by several topics at once. Students see a problem's topics in
  practice sessions, and in tests and exams only after the session closes. The practice page lists open public problems
  by topic, and the learning record shows attempted and solved problems per topic.
- **Integrity checks** (two switches per session, visible to teachers only, never change scores):
  - *Plagiarism*: compares code "fingerprints" between students in the same session, ignoring identifier names
    (including `main`), comments (including end-of-line comments), `#include` lines and formatting (the same idea as
    MOSS). No AI needed.
  - *AI use*: Claude reviews a student's first accepted solution per problem cautiously and points at suspicious code
    with reasons. Only the problem statement and the code are sent, with the words of every comment replaced by a
    marker (a student may write their name in one); no name, email or account id.
  - The teacher compares the two codes side by side or looks at the flagged lines, then marks the flag "Reviewed".
- **Class board.** Teachers post announcements (which can be pinned); students ask questions, optionally linked to a
  problem of a session. The teacher's home page lists the newest unanswered questions (up to 50). An archived class's
  board is read-only.
- **Learning record** (học bạ). Students see which problems they solved and which problem sets they completed, in which
  class. The record survives a class's permanent deletion (only the problems can no longer be opened), and students keep
  the code they submitted.
- **Sign-up.** Students register themselves and verify their **email with an OTP code**; a class code is optional
  (entering one sends a join request). Teachers are **invited by email** by the admin and set their own password.
  Forgotten passwords can be reset.
- **Admin** (exactly one account): manages accounts and can see every bank and every class.
- **Organization plan** (centres, schools). The admin creates an organization with a number of teacher seats, an end
  date and whether AI is included, then picks teachers as **organization admins**. Organization admins invite teachers by
  email (existing teachers accept on their home page; new addresses get a link and code to create an account), remove
  them, and make them organization admins. Every teacher and every pending invitation uses a seat; when seats run out, no
  more invitations. A teacher can belong to **several organizations**.
  - When creating a class, the teacher picks an organization or a personal class (a personal class can move into an
    organization, not out). Organization admins **see and manage every class of the organization** as its teacher would:
    students, sessions, results, submissions, rejudging, review flags, the board, and handing the class to another
    teacher of the organization. They can archive an organization class but not delete it permanently (only its teacher
    and the admin can).
  - Problems can be shared **within the organization**: its teachers see the whole problem (statement, hidden tests,
    solution) and can save a copy; outsiders cannot see it.
  - Teachers of an active organization that includes AI get the AI features (like a VIP account). When it expires, AI is
    turned off and no more invitations can be sent; classes, problems and data stay.
  - When a teacher leaves an organization, the organization's classes they taught **stay with the organization** (they go
    to an organization admin); the teacher keeps their problems, and the organization keeps a copy of the problems
    shared within it.
- **Learning paths** (OJ-24). A teacher arranges open public practice sessions into a path from easy to hard on one
  topic, with a note on what is new in each step. Students see their progress per step and a "Continue" button to the
  next unsolved problem; no step is locked. A "mixed review" step is a session with "Hide problem topics" on: students do
  not see the topics until the session closes. The list of paths loads 24 at a time with "Show more".
- **Exam import from a photo** (OJ-23, VIP). Upload a .png, .jpg or .webp photo (up to 5 MB); the AI reads it into
  problems to check before saving.
- **Monthly AI allowances** (OJ-21). Every teacher can try AI within monthly limits, reset on the 1st (Vietnam time):
  - **Free plan** (regular teachers): 3 AI exam imports, 20 rewrites and 3 test suggestions per month; no AI-use checks
    and no photo import.
  - **VIP plan** (VIP teachers, or teachers of an organization that includes AI): 100 imports, 100 photo imports, 500
    rewrites, 100 test suggestions and 2000 AI-use checks.
  - **Admin:** no monthly limit.
  - Only successful uses count; when the AI fails, the use is given back. With no imports left, exams can still be
    imported with the rule-based reader; with no rewrites or test suggestions left, the button shows when uses come back.
    Each teacher can also make at most 10 AI requests per minute.
  - Teachers see the uses left next to each AI button and in the "AI uses this month" card on the home page. The numbers
    are set in `.env` (`AI_LIMIT_*`).
- Automatic judging for C, C++, Python, Java and JavaScript; a scoreboard per session; printing of problem sets and
  solutions from the bank.
- **Two interface languages**: Vietnamese (default) and English, switched with **VI / EN** in the top bar and on the
  sign-in pages. The choice is kept in the `oj_locale` cookie. Only the interface changes language; problem statements,
  user content and emails do not. Interface text lives in `src/frontend/src/i18n/messages/{vi,en}` (`use-intl`); new text
  goes into both files, and a missing English key is a typecheck error.
- **Dark mode** (OJ-19): a "blackboard" theme. It follows the system setting by default; the switch in the header (and on
  the sign-in pages) cycles system, light and dark, and the choice is remembered on this computer.

## Architecture

pnpm monorepo:

| Folder | Package | Role |
|---|---|---|
| `src/shared` | `@oj/contracts` | Shared types: API DTOs, enums, judge queue messages |
| `src/backend` | `@oj/backend` | NestJS REST API, organised by DDD |
| `src/engine` | `@oj/engine` | Judge worker: takes jobs from Redis, runs code in a Docker sandbox |
| `src/frontend` | `@oj/frontend` | Next.js, deployed on Vercel |

```
 Next.js (Vercel) ──HTTP──▶ NestJS API ──▶ PostgreSQL
                               │  ▲
                   judge-jobs  ▼  │ judge-results       (BullMQ / Redis)
                            Engine worker × N ──▶ docker run oj-runner (no network, CPU/RAM/PID limits)
```

### Backend: bounded contexts (DDD)

Each context lives in `src/backend/src/modules/<context>`, in the layers `domain / application / infrastructure /
presentation`:

- **identity**: aggregates `User` and `Verification` (email OTP, teacher invitations), organizations, AI plans and the AI
  usage store. The "exactly one admin" invariant is held in two places: the domain can create an ADMIN only through
  `bootstrapAdmin` at startup, and the database has a partial unique index. Publishes `student-registered` and
  `user-deleted`.
- **classroom**: aggregates `Classroom` (code, teacher, lifecycle ACTIVE → ARCHIVED → permanently deleted, with a
  schedule), `Enrollment` (a student's classes, several at once; classes left are history) and `MembershipRequest`
  (join or leave requests awaiting the teacher). Publishes `class-purged`.
- **catalog**: the problem bank. Aggregate `Problem` (owner, sharing level `Sharing`, `TestCase`s, `Solution`, copy
  source, topics). Publishes `problem-deleted`.
- **importing**: domain service `ExamParser` (heuristics for Vietnamese and English exams), port `DocumentReader`
  (mammoth for docx, unpdf for pdf), the Claude exam reader for documents, pasted text and photos. Imported problems go to
  the importer's bank.
- **assessment**: aggregates `ProblemSet` (in the bank), `Session` (a snapshot of the problems plus opening and closing
  times, for a class or public) and `LearningPath`. The **learning record** projection (`learning_sessions`,
  `learning_progress`) is updated from the `submission-judged` event and outlives sessions and classes.
- **integrity**: aggregate `IntegrityFlag` (review flags), the code fingerprint domain service (`fingerprint.ts`) and the
  `AiUsageReviewer` port (Claude). Listens to `submission-judged` and checks in the background, without slowing judging.
- **community**: aggregate `Thread` (announcements and questions with replies). Who may post is decided by the class;
  listens to `class-purged`.
- **judging**: aggregate `Submission` (for a session and problem, PENDING → JUDGING → DONE), port `JudgeQueue` (BullMQ),
  and trial runs. Asks assessment who may submit; publishes `submission-judged`.

Dependency direction between contexts: `integrity → judging → assessment → catalog, classroom → identity`,
`community → assessment, classroom`, `importing → catalog`. There are no cycles: reactions in the other direction go
through events (the published language in the `*.events.ts` files). Each context uses another context's published
facade through its own port and adapter (anti-corruption layer). AI access and allowances are the one shared kernel
(ADR 0005). Repositories are abstract classes in the domain; the TypeORM implementations are in infrastructure.

### Judge queue

- The backend only pushes jobs to Redis. A job carries everything it needs (code, limits, test cases), so the engine
  never reads the database.
- Several engines can run in parallel (`JUDGE_CONCURRENCY` per engine). BullMQ handles distribution, retries and keeping
  jobs across engine restarts. Trial runs go through the same queue, behind submissions.
- Each student has at most `MAX_PENDING_SUBMISSIONS` submissions waiting, so one person cannot clog the queue. This
  limit and the per-problem submission limit are checked and recorded in **one transaction** (locked per student), so
  even dozens of parallel requests cannot exceed them.
- **A lost result does not lock the student out.** If a submission's job disappears from the queue (Redis lost data, the
  engine crashed while judging), after `JUDGE_STALE_AFTER_SECONDS` (default 300) the submission ends with the system error
  `IE` and an explanation, and the student can submit again at once (or the teacher rejudges). A job still in the queue
  or running is left alone (a long queue is not a lost job) until `JUDGE_GIVE_UP_AFTER_SECONDS` (default 1800), which also
  covers a hung engine. `IE` does not enter the scoreboard or the learning record and does not count as an attempt.
- **Sandbox**: every submission runs in its own single-use `oj-runner` container: `--network none`, 1 CPU,
  `--pids-limit`, all capabilities dropped (only SETUID/SETGID/KILL kept for the supervisor), `no-new-privileges`, a
  `--read-only` root filesystem, and **no host directory mounted**: `/box` (where code is compiled and run) and `/tmp`
  are size-capped tmpfs, so a program cannot fill the host disk. Input and output go through `docker exec`
  (stdin/stdout), not shared files.
- **The `oj-run` supervisor** (C, `src/engine/runner/oj-run.c`, built into the image): all untrusted code, compilers
  included, runs through it. It runs as root in the container, drops the program to `nobody`, limits CPU time and file
  size, enforces the wall-clock limit (killing the whole process group, never itself) and measures CPU time and peak RSS
  with `wait4`. The program shares no path with the judge, so it **cannot forge the measurements** (it once could, by
  overwriting `/box/.stat`). Leftover processes are cleaned up after every test.
- **Memory**: while compiling, the container has a generous cap (`COMPILE_MEMORY_MB`, default 768) so `g++` with
  `bits/stdc++.h` is not killed; before the tests the cap is lowered (`docker update`) to the problem's limit plus the
  language's baseline plus the I/O buffers and tmpfs (those pages count toward the cgroup). MLE is still decided by peak
  RSS against the problem's limit. Each program may write at most `max(4 MiB, 2 × answer + 1 MiB)` (at most 64 MiB) to
  stdout, stderr and each file; more is cut and judged Wrong Answer ("Output limit exceeded"). The kernel's CPU limit
  counts whole seconds, so a TLE costs about 2 CPU seconds even when the problem's limit is under 1 second (the time
  reported to the student is still the problem's limit).
- **Resilience**: a container removes itself when its deadline passes even if the engine died, and the engine removes
  expired containers (labels `oj.sandbox` / `oj.deadline`) at startup and every minute. Every job has a hard deadline of
  its own; if Docker hangs, the job ends with `IE` and the worker is freed. At startup the engine checks Docker and the
  image version (`oj.runner.version`) and stops with instructions to run `pnpm runner:build` if it is missing or old.

## Running locally (development)

Requirements: Node 24, pnpm, Docker Desktop.

```bash
pnpm install
```

```bash
pnpm build:shared
```

```bash
pnpm infra:up
```

```bash
pnpm runner:build
```

```bash
cp src/backend/.env.example src/backend/.env
```

Then run each of these in its own terminal:

```bash
pnpm dev:backend
```

```bash
pnpm dev:engine
```

```bash
pnpm dev:frontend
```

- API: http://localhost:4000/api. Frontend: http://localhost:3000
- The default admin comes from `.env` (`ADMIN_EMAIL` / `ADMIN_PASSWORD`, set in `.env.example` for development).
  **Change it before real use**: with `NODE_ENV=production` the server refuses to create the admin with a weak or
  well-known password (under 12 characters, or the example value).
- `JWT_SECRET` can stay empty in development: each run then uses a random key (restarting signs everyone out). To keep
  sessions, set a random string of at least 32 characters (`openssl rand -hex 32`). The server **refuses to start** with a
  key that is too short or an example value (such as the `change-me…` of an old `.env.example`), because anyone who knows
  the key can sign an admin token.
- **Email**: with `SMTP_HOST` empty, emails (OTP codes, invitation links) are **printed in the backend log** instead of
  sent. This is for development only: with `NODE_ENV=production` the backend does not start without `SMTP_HOST`. To send
  through Gmail, turn on 2-step verification for the Gmail account, create an **App Password**, and set
  `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_USER=<gmail address>` and `SMTP_PASS=<app password>`. Gmail allows
  about 500 emails a day, enough for a class.
- **AI**: set `ANTHROPIC_API_KEY` in `src/backend/.env`. The model is chosen per task: `CLAUDE_MODEL` for exam reading
  and rewrites (default `claude-sonnet-5-5`), `CLAUDE_TESTGEN_MODEL` for test suggestions (defaults to `CLAUDE_MODEL`) and
  `CLAUDE_REVIEW_MODEL` for AI-use checks (default `claude-haiku-5-5`, cheap because it runs per submission). Without a
  key, exam reading uses the rule-based reader, AI-use checks are skipped, and the other AI buttons say AI is
  unavailable. For Sonnet and Opus the server-side *refusal fallback* is on (`fallbacks: "default"`); Haiku does not
  support it, so it is not sent. The rules for AI code are in [the playbook](docs/ai-engineering-playbook.md).
- Teachers create a class and set its code on the **Classes** page. Students use the code to ask to join (when signing
  up or on **My classes**), and the teacher approves on the class page.
- **Database**: the backend creates and updates its tables with migrations at startup (see *Upgrading*).
- After changing engine code, rebuild the runner image with `pnpm runner:build` (the engine does not start with an old
  image).
- Sample data to try the interface: see **Sample data (seed)** below.
- No Docker? The engine can run with `SANDBOX=local`: code runs directly on the machine **without isolation**, for trying
  things only.

### Sample data (seed)

The seed creates enough data to try every role: 4 classes, 9 problems, 5 problem sets, sessions that are open, upcoming
and closed plus a timed exam, 56 submissions **judged for real**, class boards, pending join requests, a pair of
submissions flagged for plagiarism, and 2 organizations (the active "Sao Mai" centre and an expired school).

1. **If the machine has older development data** (for example after a pull): remove it first, or the seed adds to it.
   This **deletes all development data** of the project (Postgres and Redis on ports 5432/6379); stop the backend and the
   engine first:

   ```bash
   docker compose down -v
   ```

   ```bash
   pnpm infra:up
   ```

2. Start the **engine** (`pnpm dev:engine`): the seed waits for every submission to be judged and stops halfway without
   an engine. Then run:

   ```bash
   pnpm --filter @oj/backend seed
   ```

   The seed runs once: running it again prints "Already seeded" and changes nothing. To start over, go back to step 1.
   It refuses to run with `NODE_ENV=production` or when `DATABASE_URL` / `REDIS_URL` do not point at this machine.

3. Sign in at http://localhost:3000. Seeded teachers and students share the password `SEED_PASSWORD` in
   `src/backend/src/seed.ts`; the admin uses `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `src/backend/.env`.

| Account | Use it to try |
|---|---|
| `admin@oj.local` | Administration: users, VIP, teacher invitations, organizations |
| `gv.lan@oj.local` | **VIP** teacher, admin of the Sao Mai centre: AI features, class 10A1, organization management |
| `gv.minh@oj.local` | Teacher in the centre: class 11B2 (plagiarism flag, timed exam), class `SAOMAI-HSG` |
| `gv.hoa@oj.local` | Teacher with an archived class, an expired organization and a pending invitation to the centre |
| `hs01@oj.local` | Student in 10A1 and 11B2, with every kind of result and a learning record |
| `hs09@oj.local` | Student with an open mid-term exam not yet started |
| `hs12@oj.local` | Student without a class, waiting to join 10A1 |

The full list (`hs01`…`hs12`, email invitations for `gv.tuan` and `gv.phuong`), sample files to upload and code to
submit (the `samples/` folder: `.docx`/`.pdf` exams, correct, wrong, too-slow and non-compiling solutions, a copied
pair), how to reset the data and how to fix common problems are in
[docs/testing/local-setup.md](docs/testing/local-setup.md). Test scenarios per role (UAT):
[docs/testing/test-plan.md](docs/testing/test-plan.md).

Verification codes and invitation links (with `SMTP_HOST` empty) are printed in the backend log: look for the block that
starts with `To: <email>`.

### Testing

```bash
pnpm test
```

`pnpm test` also runs the engine's Docker tests (they need Docker and a built `oj-runner` image; without either they are
skipped with the reason). The backend's PostgreSQL tests (atomic statements against a real database, in a temporary
schema) run only with `TEST_DATABASE_URL` (and Redis with `TEST_REDIS_URL`); `pnpm test:integration` sets both to the
throwaway database.

| Kind | Command | Needs |
|---|---|---|
| Unit (backend, engine, frontend) | `pnpm test` | Nothing; the integration suites skip themselves without their variables |
| Integration (real PostgreSQL and Redis) | `pnpm infra:test:up`, then `pnpm test:integration` | Docker |
| End-to-end over HTTP (built backend, real API) | `pnpm infra:test:up`, then `pnpm test:e2e:api` | Docker |
| End-to-end in the browser (Playwright) | `pnpm exec playwright install chromium` (once), `pnpm infra:test:up`, then `pnpm test:e2e:browser` | Docker |

Integration and end-to-end tests use only the **throwaway database** of `docker-compose.test.yml` (ports 55432 and
56379, data in memory only) and never touch development data on 5432/6379. Every end-to-end run creates a new database
and drops it afterwards; the frontend is built separately into `.next-e2e` (port 3100), so a running `pnpm dev:frontend`
is not affected. Emails (OTP codes, invitation links) are read from the backend log as in development. The engine does
not run in end-to-end tests: submissions are accepted and queued, not judged. Stop the throwaway database with
`pnpm infra:test:down`.

## Security and limits

- **Rate limits** (answering `429` with `Retry-After`, details in [docs/API.md](docs/API.md)):
  - **Sign-in:** more than 10 wrong passwords in 10 minutes for one account from one IP is blocked. There are also caps
    of 300 per 10 minutes for one IP (against mass password guessing) and 100 per hour for one account across all IPs.
    That last cap is more than one IP may use in an hour, so a single address cannot fill it.
  - **Exemptions:** an address that signed in or reset the password for that account in the last 30 days is not blocked.
    A password reset lifts the block, and the owner gets an email about it.
  - **Other endpoints:** sign-up, forgotten password and resending a code are limited per IP and per mailbox (2 per
    minute).
  - Only **wrong** sign-ins count, so a whole class behind one school IP signs in normally. IPv6 clients are counted per
    /64 block.
  - **Storage:** the counters and the list of known addresses live in Redis (the same Redis as the judge queue), so they
    survive a backend restart and hold across several backends. If Redis is unreachable, these endpoints return an error
    instead of skipping the limit.
- **Password reset by link only** (in the email; there is no code to guess, and a wrong link does not spoil the owner's
  real one). The secret in the link sits after `#`, which the browser never sends to any server. **Sign-up by 6-digit
  code only**, typed on the screen that asked for it: the sign-up email has no link, so nobody can trick a mailbox owner
  into confirming an account someone else created. Each email may enter a wrong sign-up code 20 times in 24 hours
  (counting resends and new sign-ups), so the code cannot be guessed by asking for new ones. The code in a teacher
  invitation link sits after `#` and is removed from the address bar as soon as the page opens.
- **OTP codes**: each code has 5 tries and works once. A try is taken **atomically before the code is compared**, so even
  hundreds of parallel guesses get only 5 comparisons.
- **Sessions**: a token is tied to the current password. Changing or resetting the password, or deleting the account,
  invalidates every older token at once. Role and name always come from the account, never from the token.
- **Configuration**: there is no known secret. Without `JWT_SECRET` production does not start, and development uses a
  random key; short keys and example values are refused everywhere.
- **Behind a reverse proxy** (nginx, Caddy, a load balancer): set `TRUST_PROXY=<number of proxies in front of the API>`
  (usually `1`), or the backend sees everyone with the proxy's IP and the rate limits block a whole school. Do not set
  `TRUST_PROXY=true`: anyone could then fake their IP with `X-Forwarded-For` (with `NODE_ENV=production` the backend
  refuses to start).
- **AI and personal data**: AI calls send only what the task needs. The AI-use check sends the problem statement and the
  student's code, never a name, email or account id. The rules are in the playbook's section 7.
- **Upgrading from an older version**: see *Upgrading* below.

## Deployment

- **Frontend → Vercel**: Root Directory `src/frontend`, environment variable `NEXT_PUBLIC_API_URL=https://<api-domain>/api`.
  Details in `src/frontend/README.md`.
- **Backend + engine + Postgres + Redis** on a server or VPS with Docker. The engine needs permission to call `docker` to
  create sandboxes. In production set:
  - `NODE_ENV=production`;
  - a random `JWT_SECRET` (required; `openssl rand -hex 32`);
  - a strong admin password;
  - `CORS_ORIGINS` and `FRONTEND_URL` to the real domain;
  - `TRUST_PROXY` when behind a reverse proxy (see *Security and limits*);
  - `DB_SYNC=false`: tables are created and updated by migrations at startup (see *Upgrading*).

  The server warns when a production configuration still points at localhost. Redis must run with
  `maxmemory-policy noeviction` (Redis's default, which BullMQ also needs): if Redis may evict keys when memory is full,
  the rate-limit counters can be lost.

### Upgrading

The table structure is managed by **migrations** (`src/backend/src/migrations`, ADR 0003). At startup the backend runs
the missing migrations in one transaction, **before** it accepts requests; if a migration fails, the database is left
unchanged and the backend does not start. No manual SQL is needed.

1. **Back up** the database (`pg_dump`).
2. Deploy the new code and **rebuild the sandbox image** (`pnpm runner:build`; the engine does not run with an old
   image).
3. **Start** the backend, then the engine. The first start on this version creates the new tables and columns
   (organizations, AI uses, learning paths…) and normalises the topics of existing problems and sessions. A server that
   used `DB_SYNC` before upgrades the same way: the migrations add only what is missing.

   Several backends may start at once: one runs the migrations (a PostgreSQL lock) and the others wait up to 10
   minutes. A failed migration stops the backend at once, with no retry, and the database is left unchanged.
4. **Check `.env` against `.env.example`:**
   - `DB_SYNC` must be `false` in production (the server refuses to start otherwise).
   - An old `JWT_SECRET` still set to `change-me…` must be changed.
   - **AI for regular teachers.** From this version, teachers without VIP get a few AI uses a month (by default 3
     imports, 20 rewrites, 3 test suggestions). To keep the old behaviour, set `AI_LIMIT_FREE_IMPORT=0`,
     `AI_LIMIT_FREE_SECTION=0` and `AI_LIMIT_FREE_TESTS=0`.
   - Admins have no monthly limit but at most `AI_ADMIN_RATE_PER_MINUTE` (default 60) AI requests a minute.
5. Every old token stops working: users sign in again once.

Commands for developers (they read `DATABASE_URL` from `src/backend/.env`):

```bash
pnpm --filter @oj/backend migration:show
```

```bash
pnpm --filter @oj/backend migration:generate src/migrations/<change-name>
```

```bash
pnpm --filter @oj/backend migration:revert
```

**Every entity change ships with a migration.** `migration:generate` creates the file from the difference between the
entities and the database; then add the new class to `src/migrations/index.ts`.

**Generate against a database built only by migrations** (`DB_SYNC=false`). If `DB_SYNC` has already changed the tables
to match the new entities, there is no difference left to generate.

**Safety:**
- `migration:run` and `migration:revert` take the same lock as the backend, so they are safe while a backend is
  starting.
- The first migration (the baseline) cannot be reverted.
- `migration:check` and the `migrations.integration.test.ts` test fail when the entities and the migrations differ.

## Documentation

- User guide per role: [docs/guide/user-manual.md](docs/guide/user-manual.md)
- Running and testing locally (sample accounts, sample files, resetting data): [docs/testing/local-setup.md](docs/testing/local-setup.md)
- Test plan and UAT scenarios: [docs/testing/test-plan.md](docs/testing/test-plan.md)
- Technical overview, product and known issues: [docs/technical-overview.md](docs/technical-overview.md)
- REST API: [docs/API.md](docs/API.md)
- Interface design: [src/frontend/DESIGN.md](src/frontend/DESIGN.md)
- Rules for working in the code: [CLAUDE.md](CLAUDE.md) and the [AI engineering playbook](docs/ai-engineering-playbook.md);
  one spec per change: [docs/specs/](docs/specs/); architecture decisions: [docs/adr/](docs/adr/)
