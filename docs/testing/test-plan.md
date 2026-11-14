# Online Judge: test plan

For testers, developers and the product owner. Covers every test type, how to run it, what it proves and what it does
not, the UAT scripts per role, and the release checklist. Local setup (stacks, accounts, sample files) is in
[local-setup.md](local-setup.md). Product known issues (K-n) are listed once, in
[technical-overview.md §9](../technical-overview.md#9-known-issues).

Contents
1. [Strategy](#1-strategy)
2. [Automated suites](#2-automated-suites)
3. [Manual and exploratory testing](#3-manual-and-exploratory-testing)
4. [UAT: acceptance scripts per role](#4-uat-acceptance-scripts-per-role)
5. [Security testing](#5-security-testing)
6. [Non-functional checks](#6-non-functional-checks)
7. [Traceability: specs to tests](#7-traceability-specs-to-tests)
8. [Regression checklist before a release](#8-regression-checklist-before-a-release)
9. [Defects: reporting, triage, flaky tests](#9-defects-reporting-triage-flaky-tests)
10. [Known gaps](#10-known-gaps)

---

## 1. Strategy

| Level | What it proves | Speed | Runs on | Command |
|---|---|---|---|---|
| Unit | Domain rules and pure logic (backend, engine, frontend) | seconds | anything | `pnpm test` |
| Integration | SQL and Redis statements are correct and atomic under parallel load | ~10 s | throwaway Postgres + Redis | `pnpm test:integration` |
| HTTP end-to-end | Real user journeys through the compiled backend's API | ~15 s | throwaway stack + built backend | `pnpm test:e2e:api` |
| Browser end-to-end | The same journeys through the real UI in Chromium | ~1 min with the build, then ~20 s | throwaway stack + built backend + frontend build | `pnpm test:e2e:browser` |
| Engine live sandbox | Code really runs in the Docker sandbox with the security flags | ~1–2 min | Docker + `oj-runner` image | part of `pnpm test` |
| Manual / exploratory | Look and feel, wording, edge cases not scripted | — | dev stack with the seed | [section 3](#3-manual-and-exploratory-testing) |
| UAT | The product does what each role needs | — | dev stack with a fresh seed | [section 4](#4-uat-acceptance-scripts-per-role) |

Principles
- Test rules where they live: invariants on the aggregates, use cases through application services with in-memory
  repositories, SQL only in integration tests (CLAUDE.md, "Coding conventions").
- Every bug fix adds a test that fails before and passes after.
- Integration and end-to-end tests never touch development data: both refuse the development ports (5432/6379) outside
  CI (`src/backend/test/support/throwaway.ts`, `e2e/support/stack.ts`); each end-to-end run uses its own database,
  dropped afterwards, and its own Redis database (HTTP suite 1, browser suite 5).
- Gate before any push: `pnpm build:shared && pnpm typecheck && pnpm test`. Before a release: [section 8](#8-regression-checklist-before-a-release).

Counts on 2026-11-11 (node --test and Playwright summaries, local run): unit 429 (frontend 34, backend 229, engine
166), browser end-to-end 9; all passing. Integration (36) and HTTP end-to-end (17) last run 2026-11-08 and not touched
by OJ-12 (frontend only). CI has never run (K-9).

---

## 2. Automated suites

### 2.1 Unit (`pnpm test`)
- Where: `src/backend/test/*.test.ts`, `src/engine/test/*.test.ts`, `src/frontend/test/*.test.ts` (node:test + tsx).
- No services needed. The `*.integration.test.ts` suites in the backend folder skip themselves without
  `TEST_DATABASE_URL` / `TEST_REDIS_URL` (node counts them under "suites", not "skipped").

| Area | Files |
|---|---|
| Identity: sign-up, codes, reset, sessions, rate limits, admin bootstrap | `account-security`, `identity`, `one-time-codes`, `rate-limit`, `recent-sign-ins`, `verification-sweeper`, `user-repository`, `environment`, `mail-transports` |
| Route guard rails, error bodies | `public-routes` (every public route is rate limited; every route declares `@Roles` or `@Public`, except the pinned "any signed-in user" list, K-12); `api-errors` (every error body has a stable `code`) |
| Organizations (OJ-8) | `organization`, `organization-access` |
| Classes and membership requests | `classroom`, `membership-request` |
| Catalog and sharing | `domain`, `sharing`, `standard-io` |
| Import, AI parsing, link filtering | `exam-parser`, `test-suggestions`, `external-links`, `document-signature` (content must match `.docx`/`.pdf`) |
| Sessions and sync | `session-sync` |
| Judging, admission, watchdog | `judging` |
| Integrity and class board | `integrity-community`, `fingerprint`, `integrity-pair` (one flag per copied pair) |
| Wiring, seed guard | `wiring`, `seed-guard` |
| Engine: sandbox flags, supervisor, verdicts, limits, clean-up | `docker-sandbox-flags`, `docker-sandbox`, `judge`, `classify`, `resource-plan`, `leftovers`, `deadline`, `process`, `supervisor-protocol`, `self-check`, `shutdown`, `sweeper`, `language` |
| Frontend logic | `lib.test.ts` (points identical to the backend's rounding, score labels, dates, class codes, sessions, exam settings, countdown), `last-problem.test.ts` ("Làm tiếp" per account, cleared on sign-out), `exam-home.test.ts` (waiting exams on the home page, exam settings by set type), `translation-safe-dom.test.ts`, `i18n.test.ts` (locale cookie, English keys and arguments match Vietnamese, every message is valid ICU, plurals, dates, API errors by code), `i18n-coverage.test.ts` (no Vietnamese text left outside the Vietnamese dictionary) |

### 2.2 Integration (`pnpm infra:test:up` → `pnpm test:integration`)
- Where: `src/backend/test/*.integration.test.ts`; each run creates a throwaway schema and drops it.
- Covers: parallel claims of one-time codes (exactly 5 attempts), one winner among parallel correct codes, atomic
  submission admission (pending and per-problem limits under 20–30 parallel requests), watchdog paging, Redis limiter and
  sign-in memory, OJ-8 seat reservation under 25 parallel invitations, conditional invitation acceptance, no membership
  overwrite, `uuid[]` sharing queries, classes by organization, one plagiarism flag per pair under 10 parallel inserts.
- Evidence they bite: on 2026-11-08, removing the seat lock in `typeorm-organization.repository.ts` made both parallel
  seat tests fail (recorded in OJ-9); removing the `pairKey` unique index made the parallel flag test fail (OJ-10).
- Limitation: the test Redis has no memory cap, so the "flood does not wipe a live counter" test cannot exercise eviction.

### 2.3 HTTP end-to-end (`pnpm test:e2e:api`)
- Where: `e2e/api/*.e2e.test.ts`; harness `e2e/support/` (`stack.ts` starts `src/backend/dist/main.js`; `journeys.ts`
  creates accounts the real way). Emails (codes, links) are read from the backend log, as in development.
- Each file is one journey: its tests run in order and share state on purpose; run a file as a whole.

| File | Journey (asserts exact status and error code) |
|---|---|
| `accounts` | admin sign-in; wrong password / no token / bad token refused; teacher invitation link (code in the fragment) → activation → sign-in; student sign-up with the emailed code, wrong code `identity.wrong_code`, code single-use; password reset by link, old password and old session end |
| `classroom` | class → student signs up with the class code → request approved → problem with a hidden test → session with 2 attempts → student sees samples only → 2 submissions admitted, 3rd `judging.submission_limit` → outsider refused → archive: submit `assessment.cannot_submit`, add `classroom.archived` → restore |
| `organization` | create organization → invite existing teacher → accept → AI through the organization → new-email invitation → seats full `organization.no_seats` → class in the organization → org admin manages it, delete `classroom.only_teacher_deletes` → sharing inside the organization → leaving (waits for the handovers): class stays, problem copied, AI and access end |
| `access-control` | teacher refused on 5 admin routes; student refused on 10 staff/admin routes; invalid body 400 with Vietnamese reasons and `code` `request.invalid`; unknown fields ignored (`teacherId`, `status`) |

- Not covered: judging (no engine in the run; submissions are admitted and queued). See [gaps](#10-known-gaps).

### 2.4 Browser end-to-end (`pnpm exec playwright install chromium` once → `pnpm test:e2e:browser`)
- Where: `e2e/browser/*.spec.ts`, config `playwright.config.ts`, setup `e2e/browser/global-setup.ts` (starts the
  isolated backend and creates people and data through the API). No retries: the organization spec is serial and
  changes data.
- The frontend is a production build in `.next-e2e` on port 3100; a running `pnpm dev:frontend` is not affected.
  Do not run the HTTP and browser suites at the same time (fixed ports 4100/3100).
- Flows: sign-in per role with the right menu; wrong password message; a student blocked from `/admin/users`; a student
  reads a problem (hidden test absent), types in the code editor, submits, sees exactly one Python row under "Bài nộp
  của tôi"; the org admin invites from the organization page; the invited teacher joins from the home page and gets
  "Tổ chức" in the menu; a new teacher opens the emailed link, the code is pre-filled and removed from the address bar,
  activates and is in the organization; a student switches to English on the sign-in page, signs in, sees English
  menu labels after a reload and switches back to Vietnamese from the header (`language`).
- Failure artefacts: `test-results/` (trace, screenshot); in CI the HTML report is uploaded.

### 2.5 Engine live sandbox (inside `pnpm test`)
- Needs Docker and `pnpm runner:build`; without them these tests skip with a reason.
- Covers the sandbox floor (ADR 0004) and verdict classification incl. TLE/MLE/RE/CE/output limit.
- Changes in `docker-sandbox.ts`, `src/engine/runner/` or `local-sandbox.ts` also need the security-verifier agent and a
  human reviewer (CLAUDE.md, security rule 5).

### 2.6 CI (`.github/workflows/ci.yml`)
- `verify`: install, build contracts, typecheck, build the runner image, `pnpm test` with its own Postgres and Redis
  services on 5432/6379 (allowed because `CI` is set), so the integration suites run there.
- `e2e` (after `verify`): services on the test ports, Chromium, `pnpm test:e2e:api`, `pnpm test:e2e:browser`, report on failure.
- Triggers: pushes to `master` and every pull request. The pre-push hook runs the same gate on the packages changed
  since `origin/master`.
- Status: not committed yet, never run (K-9).

---

## 3. Manual and exploratory testing

Use the dev stack with the seed ([local-setup.md](local-setup.md)). Time-box sessions (45–60 min) per charter; record
what you tried, what you saw, and any defect.

1. **Import robustness**: every file in `samples/exams/` plus your own real exams; check titles, examples, limits,
   warnings, file-I/O blocking, removed links. Try a 9 MB and an 11 MB file, a password-protected PDF, a `.doc`.
2. **Exam day**: a timed session with 3 attempts and "Chỉ điểm"; two browsers as two students; start late (timer ends at
   the session close), refresh mid-exam, run out of attempts, submit at the last second, a language that is not allowed,
   close the session early; what students see under "Chỉ điểm" and "Ẩn đến khi phiên đóng".
3. **Vietnamese text**: diacritics in names, class names, problem titles; search; sort order; CSV export opened in Excel.
4. **Browser translation**: Chrome "Translate to English" on every page; toggles (VIP, pin, share), dialogs, the editor.
5. **Small screens**: 375 px, 800 px, 1024 px; menu drawer, tables, the code editor.
6. **Roles by id**: as a student open another student's `/submissions/<id>`; as a teacher open another teacher's class,
   problem, session results or integrity flag by id. Expect "not found" or the refused page.
7. **Organization life cycle**: invite, seats full, cancel, decline, promote, remove the last admin (blocked), leave,
   plan expiry (admin sets the date in the past), accepting an invitation after expiry (refused).
8. **Recovery**: stop the engine during judging (after the watchdog delay the submission ends as "Lỗi hệ thống" and does
   not count as an attempt), restart Redis, restart the backend during a session.
9. **Life cycle of content**: leave-class requests, reject / approve all, delete a problem/set/session already given,
   copy a public set, make a problem private while it is in a public set (refused), class deletion by its teacher.

---

## 4. UAT: acceptance scripts per role

**Entry criteria**
- A fresh dev database seeded within the last **24 hours** (session times are relative to the seed: the midterm closes
  after 1 day, the exam opens after 3, the homework closes after 5). Reset: [local-setup §6](local-setup.md#6-resetting).
- Engine running and runner image built (`pnpm runner:build`); backend and frontend running.
- The seed command's output kept (it contains the seeded invitation emails), or invitations resent from the UI.
- For V-01–V-04 only: `ANTHROPIC_API_KEY` set on the backend.

**Test data rules**
- Run the sections in this order: Student, Teacher, VIP, Org admin, Administrator. Scripts change shared data; the order
  below accounts for it (noted where it matters).
- Re-seed (reset) before a second full run. Sign out between accounts, or use a private browser window per account.

Mark each step Pass / Fail / Blocked; attach a screenshot and ids for every Fail.

### 4.1 Student

| ID | Account | Steps | Expected |
|---|---|---|---|
| S-01 | new | Sign up with class code `10A1-TIN`; code from the backend log | Account created; home shows "Đang chờ giáo viên duyệt: Tin học 10A1" |
| S-02 | hs01 | Open "Bài tập về nhà tuần 1" | 2 problems (40 and 60 points); "Cao nhất x/y điểm" in points, "Đã giải ✓" where solved |
| S-03 | hs01 | Bài 1 → submit `samples/code/ac.py` | "Chấp nhận"; the result card shows "40/40"; the list shows "Đã giải ✓" and "Cao nhất 40/40 điểm" |
| S-04 | hs01 | Bài 1 → submit `wa-wrong-answer.py`, `tle-infinite-loop.py`, `re-index-error.py`, `ce-missing-semicolon.cpp` (C++17) | WA with a partial score; TLE; RE; CE with "Thông báo biên dịch" |
| S-05 | hs01 | Open "Kiểm tra 15 phút: vòng lặp" | "Phiên đã đóng, không nhận bài nộp mới."; no "Còn n/m lần nộp"; submit disabled |
| S-06 | hs09 | Home page, then open "Kiểm tra giữa kỳ" (within 24 h of the seed) | Home: main card "Vào thi", the exam first in "Bài đang mở" with "Chưa bắt đầu, 60 phút". Session: rules shown, problems hidden; "Bắt đầu làm bài" → "Bắt đầu tính giờ?" → timer runs, problems open |
| S-07 | hs01 | Open "Thi học kỳ I" | "Phiên mở lúc …"; "Bắt đầu làm bài" disabled |
| S-08 | hs02 | Homework, Bài 2 → "Hỏi về bài này" | Question on the 10A1 board, labelled with the session and problem |
| S-09 | hs01 | "Học bạ" | Groups "Tin học 10A1", "Tin học 11B2", "Luyện tập tự do"; solved counts |
| S-10 | hs12 | "Lớp của tôi" → join `11B2-TIN` → "Hủy yêu cầu" | Two requests listed (the seeded 10A1 one stays "Chờ giáo viên duyệt"); the new one "Đã hủy" |
| S-11 | hs05 | "Quên mật khẩu?" → link from the backend log → new password | New password works; the old one is refused |
| S-12 | hs01 | Open `/bank` and `/admin/users` | "Bạn không có quyền truy cập trang này" |

### 4.2 Teacher

| ID | Account | Steps | Expected |
|---|---|---|---|
| T-01 | admin → new | Admin invites a new teacher (keep this account for A-01/A-03); link from the backend log; activate | Teacher home with "Tạo lớp đầu tiên" |
| T-02 | T-01 teacher | Create a class ("Gợi ý" code); a new student signs up with that code; "Duyệt vào lớp" | Student in "Học sinh trong lớp" |
| T-03 | gv.minh | "Nhập đề" → `samples/exams/de-kiem-tra-vong-lap.docx` → "Nhập 3 bài" | "TỔNG CÁC CHỮ SỐ" (Dễ, 2 examples), "ĐẾM SỐ CHẴN" (Trung bình, 2), "SỐ LỚN THỨ HAI" (Khó, 2000 ms, 1); no warnings; Zalo/Facebook/LeetCode lines gone; 3 problems imported |
| T-04 | gv.minh | Upload `de-thi-hsg-file-io.docx` | 3 drafts ("SỐ HOÀN HẢO" Trung bình with warning "Đề không ghi độ khó…", "XÂU ĐỐI XỨNG" Khó with warning "Không thấy giới hạn thời gian…", "ĐƯỜNG ĐI NGẮN NHẤT" Rất khó 2000 ms); file-I/O blocker on each; importing as-is is refused; "Chuyển sang nhập/xuất chuẩn" fixes each |
| T-05 | gv.minh | Upload `de-luyen-tap.pdf`; paste `noi-dung-dan.txt` | PDF: "Chia kẹo", "Năm nhuận", 128 MB, no warnings. Paste: "Đảo số" (warnings: no difficulty, no time limit), "Bảng cửu chương" (warning: no time limit) |
| T-06 | gv.minh | Upload `de-scan-khong-co-chu.pdf`, then `khong-phai-word.docx` | Both refused, nothing imported: "Không đọc được chữ trong tài liệu…" for the scan, "Tệp này không phải tài liệu Word (.docx) hoặc PDF hợp lệ…" for the renamed file |
| T-07 | gv.minh | "Tạo bài" with "Đọc từ file BAI1.INP" in "Dữ liệu vào" | Save blocked: "Chưa lưu được vì đề còn yêu cầu đọc/ghi file" |
| T-08 | gv.minh | "Tạo đề" with the 3 problems from T-03; "In đề"; "In đáp án" | Student sheet and answer key render (answer key: "Chưa có hướng dẫn." for problems without a solution) |
| T-09 | gv.minh | Give that set to 11B2 with preset "Bài kiểm tra"; give it again | Session created; the second time: already given, with "Mở phiên đã giao" |
| T-10 | gv.lan, hs04, hs05 | Give P0001 to 10A1 with "Kiểm tra đạo văn" on; `hs04` submits `copy-a.py`, `hs05` submits `copy-b.py` | Both AC; "Cần xem lại" shows "giống 100%" (exactly one entry); side-by-side code; "Đánh dấu đã xem" |
| T-11 | gv.lan | Homework → "Kết quả" → "Tải bảng điểm (CSV)" | CSV with Vietnamese names, points per problem, total |
| T-12 | gv.lan | Edit a hidden test of P0001 in the bank (e.g. points 2 → 4); homework → "Chấm lại tất cả"; then "Cập nhật nội dung bài từ ngân hàng & chấm lại" | "Chấm lại tất cả" keeps the old test (session copy); the update applies the new test and recomputes scores |
| T-13 | gv.minh, gv.hoa | Minh shares P0007 publicly with "Cho xem test ẩn"; Hoa "Lưu vào ngân hàng của tôi" | Copy in Hoa's bank, "Dựa trên P0007 của Trần Văn Minh", hidden tests included, no solution |
| T-14 | T-01 teacher | Archive the class; try "Thêm học sinh"; "Khôi phục"; try again | Refused while archived ("…đã được lưu trữ…"); works after restore |
| T-15 | T-01 teacher | Post an announcement, "Ghim"; a student replies | Pinned on top; reply visible |
| T-16 | gv.lan | "Thi học kỳ I" (Đề thi) → "Giao bài"; then "Bài tập về nhà tuần 1" → "Giao bài" (cancel both) | Exam: settings open with 90 phút, 3 lần, "Ẩn đến khi phiên đóng", "Kiểm tra đạo văn" on and a note that they were filled in. Homework: "Mặc định: không giới hạn" |

### 4.3 VIP teacher (`gv.lan`; V-01–V-04 need `ANTHROPIC_API_KEY`)

| ID | Account | Steps | Expected |
|---|---|---|---|
| V-01 | gv.lan | Import `de-scan-khong-co-chu.pdf` | "Đọc bằng AI"; the problem is read from the image |
| V-02 | gv.lan | "Tạo bài" → "Dùng gợi ý" on "Đề bài"; switch off | AI text appears ("AI đang viết…"); switching off restores the original |
| V-03 | gv.lan | P0001 → "Gợi ý bằng AI" | Tests with "Output đã chạy thử"; nothing saved until "Thêm N test đã chọn" |
| V-04 | gv.lan | Give a problem with "Kiểm tra dùng AI" on; a student submits after that | AI-usage hints with reasons and highlighted lines |
| V-05 | gv.hoa (**before O-02**) | Open "Tạo bài" and "Nhập đề" | AI buttons show "· chỉ dành cho VIP" (her own organization is expired); import uses "Đọc theo mẫu" |

### 4.4 Organization admin (`gv.lan` in "Trung tâm Tin học Sao Mai")

| ID | Account | Steps | Expected |
|---|---|---|---|
| O-01 | gv.lan | "Tổ chức" → the center | "Đến hết …", "Có AI", "4/5 chỗ", members Lan and Minh, invitations to gv.hoa and gv.tuan, class `SAOMAI-HSG` |
| O-02 | gv.hoa | Home → "Lời mời vào tổ chức" → "Tham gia" | "Tổ chức" in the menu; Hoa listed in the center (she now has AI through it) |
| O-03 | gv.tuan | Open the invitation link from the **seed output** (or have Lan resend it); activate | New teacher in the center |
| O-04 | gv.lan | Invite new emails until refused | Refused with "…đã dùng hết 5 chỗ giáo viên…" |
| O-05 | gv.lan | Open `SAOMAI-HSG` (taught by Minh) | "Thuộc Trung tâm Tin học Sao Mai"; roster (3), sessions, results, board all manageable |
| O-06 | gv.lan | "Lưu trữ lớp"; look for "Xóa ngay"; "Khôi phục" | Archive works; no "Xóa ngay" or "Hẹn xóa" (the API refuses too); restore works |
| O-07 | gv.lan | "Sửa lớp" → teacher Hoa; then back to Minh | Both allowed; a teacher outside the center is not offered |
| O-08 | gv.lan | "Ngân hàng" → "Tổ chức" | P0006 "Đếm số từ" (shared by Minh), opens with hidden tests and solution |
| O-09 | gv.lan | Remove Minh ("Mời ra") | Seat freed; `SAOMAI-HSG` now taught by Lan; Lan's bank has a copy of P0006 ("Dựa trên …"); Minh can no longer open the class |
| O-10 | gv.lan | Hover "Bỏ quyền quản lý" / "Rời tổ chức" on her own row | Disabled; tooltip "Tổ chức cần ít nhất một quản lý" |

### 4.5 Administrator

| ID | Account | Steps | Expected |
|---|---|---|---|
| A-01 | admin | "Nâng cấp VIP" then "Bỏ VIP" on the T-01 teacher (no organization) | Label updates at once; that teacher's AI buttons follow |
| A-02 | admin | gv.phuong's invitation: "Gửi lại lời mời" twice in a row; wait a minute, resend; "Hủy lời mời" | Second resend refused (wait a minute); new code works and the old one not; the cancelled link is refused |
| A-03 | admin | "Tạo tổ chức" "Trường UAT", 2 seats, manager = the T-01 teacher | Organization with that "Quản lý" |
| A-04 | admin | On "Trường UAT": "Thêm giáo viên có sẵn" (gv.hoa); "Sửa gói" seats 1; then end date in the past | Seats below use refused; expired: banner, invitations and adding disabled |
| A-05 | admin | "Sửa gói": date in the future, 3 seats; "Thêm giáo viên có sẵn" gv.minh as "Quản lý" | Minh is a "Quản lý" of "Trường UAT" |
| A-06 | admin | Delete gv.lan | Refused: she is the only "Quản lý" of the center |
| A-07 | admin | Bank "Tất cả"; any class; any session | Full access |

### 4.6 Any role: interface language (OJ-12)

| ID | Account | Steps | Expected |
|---|---|---|---|
| X-01 | each role, phone (375 px) and desktop | On the sign-in page press "EN"; sign in; open every menu item and one dialog per page; reload; sign out and in; press "VI" | All labels, buttons, empty states, toasts and API errors in English (user content as written); nothing cut off, overlapping or scrolling sideways; still English after reload and sign-in; "VI" brings back the same Vietnamese text |

**Exit criteria**: every script Pass, or Fail with a defect accepted and logged as a known issue; no open Critical or
High defect; sign-off by the product owner (Cường) and the developer (Htet).

| Role | Tester | Date | Result | Sign-off |
|---|---|---|---|---|
| Student | | | | |
| Teacher | | | | |
| VIP teacher | | | | |
| Org admin | | | | |
| Administrator | | | | |

**Execution record, 2026-11-08** (API-level run of every script on a fresh seed, throwaway stack, engine running):
45 Pass, 1 Blocked (V-01–V-04: no API key), 0 Fail. UI-only expectations (labels, disabled buttons, tooltips) were
checked against the code by review, not clicked through.

---

## 5. Security testing

| Area | How it is tested |
|---|---|
| Authentication, codes, reset links, rate limits | unit `account-security`, `one-time-codes`, `rate-limit`; integration (parallel claims); e2e `accounts` |
| Authorization by role | unit `public-routes` (`@Roles`/`@Public` on every route, pinned exceptions K-12); e2e `access-control` (15 refusals); browser roles spec |
| Ownership and isolation (teachers, classes, organizations) | unit `sharing`, `organization-access`, `classroom`; e2e `organization`, `classroom`; exploratory charter 6 (ids) |
| Hidden tests never sent to students | e2e `classroom`; browser `student-submits` |
| Input validation | e2e `access-control` (400, unknown fields ignored) |
| Sandbox | engine `docker-sandbox-flags`, `docker-sandbox`, `leftovers`; security-verifier review for any change |
| Untrusted documents and AI output | unit `exam-parser`, `external-links`, `test-suggestions` |
| Reviews on record | `docs/security/` audit; security-verifier reviews OJ-1–3 and OJ-8 (OJ-8 findings M1, M2, L1, L2, L4, L5 fixed; L3 open as K-4) |

Before a release, by hand: other users' ids in URLs and API calls (charter 6); a student token on staff routes; uploads
with tricky names (`../x.docx`, very long, Unicode); the backend log contains no full emails, codes or tokens except the
development mail output.

---

## 6. Non-functional checks

| Check | How | Target (pass if) |
|---|---|---|
| Judging time | Submit `samples/code/ac.py` with the engine idle | verdict within 10 s |
| Burst | 30 students submit at once | at most 3 pending per student; every submission ends DONE within 5 min; none lost |
| Exam load | two engines, `JUDGE_CONCURRENCY=2` each, 100 submissions | finishes ≤ 60 % of the time of one engine |
| Accessibility | keyboard only through sign-in, solve, submit; icon buttons have names | every step reachable; no unnamed button on those pages |
| Browsers | Chrome, Edge, Safari, Firefox; 375 px phone | no horizontal page scroll; every UAT S-script passes |
| Language | all user-facing text Vietnamese; error `code`s English | no English sentence on screen; codes match `^[a-z_.]+$` |

No automated load, accessibility or cross-browser tests exist yet (G-3).

---

## 7. Traceability: specs to tests

| Spec | Automated | UAT |
|---|---|---|
| OJ-1 identity hardening | `account-security`, `one-time-codes`, `rate-limit`, `recent-sign-ins`, `verification-sweeper`, `public-routes`; integration codes/limiter; e2e `accounts` | S-01, S-11, T-01, A-02 |
| OJ-2 sandbox supervisor | engine `docker-sandbox*`, `leftovers`, `supervisor-protocol`, `judge`, `classify` | S-03, S-04 |
| OJ-3 judging admission and watchdog | `judging`; integration admission and `findStale`; e2e `classroom` (limits) | S-05, charter 8 |
| OJ-4 integrity fingerprint | `fingerprint`, `integrity-community` | T-10 |
| OJ-5 migrations | `migrations.integration.test.ts` (empty, old `master` with data, `DB_SYNC`-built, revert, drift guard); the other integration suites build their schema through migrations | Dev database upgraded 2026-11-14 |
| OJ-7 product-review UX fixes | frontend `lib.test` (points), browser `student-submits` | S-02, S-03, S-05, S-07, O-06 |
| OJ-8 organization plan | `organization`, `organization-access`, `organization.integration`; e2e `organization`; browser `organization` | O-01–O-10, A-03–A-06 |
| OJ-9 test suites | this plan | — |
| OJ-10 review fixes (K-1, K-2, K-3, K-11, K-13) | frontend `lib.test`, `last-problem`; backend `document-signature`, `integrity-pair`, `integrity.integration`, `api-errors`; e2e `access-control` | S-03, T-06, T-10 |
| OJ-11 exam visibility and defaults | frontend `exam-home` | S-06, T-16 |
| OJ-12 interface languages (vi, en) | frontend `i18n`, `i18n-coverage`; browser `language` | X-01 |

---

## 8. Regression checklist before a release

1. `pnpm build:shared && pnpm typecheck && pnpm test` (with Docker and the runner image).
2. `pnpm infra:test:up && pnpm test:integration`.
3. `pnpm test:e2e:api`, then `pnpm test:e2e:browser`.
4. Fresh seed on a clean dev database; smoke: S-02, S-03, T-03, T-09, O-01, A-01.
5. UAT scripts mapped to the release's specs ([section 7](#7-traceability-specs-to-tests)).
6. Security-verifier agent for changes in identity, judging, engine, Claude adapters or owner-scoped queries.
7. `docs/API.md`, README, the user manual and this plan updated.
8. CI green on the pull request.

---

## 9. Defects: reporting, triage, flaky tests

```
Title: <screen> — <what is wrong>, in one line
Severity: Critical (data loss, security, everyone blocked) | High (a role blocked, wrong scores) | Medium (workaround exists) | Low (cosmetic)
Environment: local dev / e2e / staging; browser and size; commit
Account and role: e.g. hs01 (student)
Steps: 1. … 2. … 3. …
Expected: …
Actual: … (exact message text, verdict, numbers)
Evidence: screenshot, submission id, session id, time, backend log lines (no passwords or codes)
Regression test: file/name that will cover it
```

- Triage: the developer (Htet) triages within one working day; the product owner (Cường) decides on Medium/Low.
  Critical and High block a release.
- Flaky tests: a test that fails once and passes on rerun is a defect (Medium), not noise. Note it, keep it running,
  fix or quarantine it within a week with a linked issue. No automatic retries (Playwright `retries: 0`).

---

## 10. Known gaps

| ID | Gap | Risk / plan |
|---|---|---|
| G-1 | End-to-end runs do not judge (no engine); the backend↔queue↔engine wiring is only exercised by the seed and UAT | Add one smoke test with the engine running |
| G-2 | CI has never run (K-9) | Commit the workflow; first PR run validates the `e2e` job on Ubuntu |
| G-3 | No load, accessibility or cross-browser automation | Manual targets in section 6 |
| G-4 | AI features not tested end to end (need a key; cost) | Unit tests with fakes; VIP UAT with a key |
| G-5 | API e2e covers 15 role refusals out of ~104 routes; no automated cross-user id tests (another student's submission, another teacher's results/flags) | Charter 6 by hand; add e2e cases |
| G-6 | No automated or scripted test for: leave-class requests, reject / approve-all, moving students, unassigned students, class deletion by its teacher, public-session listing, resend of a sign-up code, deleting problems/sets/sessions, declining or cancelling an organization invitation, timed-exam expiry and language refusal, feedback modes as seen by students, CSV content, upload limits | Charters 2, 7, 9; add UAT scripts or e2e cases by risk (exam day first) |
| G-7 | Frontend components are tested only through the browser end-to-end flows | UI regressions outside the scripted flows |
| G-8 | The Redis flood test cannot fail for its stated reason (no memory cap on the test Redis) | Give the test Redis `maxmemory` with the production eviction policy, or rename the test |

Product issues seen while testing are tracked as K-1 … K-14 in [technical-overview.md §9](../technical-overview.md#9-known-issues).
