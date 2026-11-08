# Testing locally: setup, accounts, data and sample files

Everything needed to run Online Judge on one machine and test it by hand, with realistic data and files.
Automated suites and UAT scripts are in [test-plan.md](test-plan.md).

Contents
1. [Prerequisites](#1-prerequisites)
2. [Two stacks: development and test](#2-two-stacks-development-and-test)
3. [Accounts](#3-accounts)
4. [What the seed creates](#4-what-the-seed-creates)
5. [Sample files to upload and submit](#5-sample-files-to-upload-and-submit)
6. [Resetting](#6-resetting)
7. [Troubleshooting](#7-troubleshooting)

---

## 1. Prerequisites

| Tool | Version | Why |
|---|---|---|
| Node.js | 24 | backend, engine, frontend |
| pnpm | 12.17.0, as pinned in `package.json` (`packageManager`); `corepack enable` installs it | workspace |
| Docker Desktop | recent | Postgres, Redis, the judge sandbox |
| Chromium for Playwright | `pnpm exec playwright install chromium` (once) | browser tests and the sample PDFs |

```bash
pnpm install
```

```bash
pnpm build:shared
```

```bash
pnpm runner:build
```

Configuration: copy `src/backend/.env.example` to `src/backend/.env` (development defaults; never commit `.env`).
Leave `SMTP_HOST` empty: emails (codes, links) are printed in the log of the process that sends them. Set
`ANTHROPIC_API_KEY` only to test the AI features. If you set `JWT_SECRET` (to stay signed in across restarts), use
at least 32 random characters (`openssl rand -hex 32`): shorter or placeholder values stop the backend, even in development.
The frontend reads `NEXT_PUBLIC_API_URL` (default `http://localhost:4000/api`; see `src/frontend/.env.example`).

---

## 2. Two stacks: development and test

| | Development (manual testing, UAT) | Test (automated integration and end-to-end) |
|---|---|---|
| Start | `pnpm infra:up` | `pnpm infra:test:up` |
| Postgres / Redis | `localhost:5432` / `localhost:6379`, data kept in a Docker volume | `127.0.0.1:55432` / `127.0.0.1:56379`, data in memory only |
| Backend / frontend | `pnpm dev:backend` (4000), `pnpm dev:frontend` (3000) | started by the tests (4100; frontend build on 3100) |
| Engine | `pnpm dev:engine` (needed for verdicts) | not started (end-to-end submissions are queued only) |
| Stop | `pnpm infra:down` | `pnpm infra:test:down` |

The test stack can run next to the development stack. Integration and end-to-end tests refuse the development ports
(5432/6379) outside CI. Ports 5432 and 6379 may already be used by Postgres or Redis of another project on your
machine: stop those first, or the development stack will not start.

Start everything for manual testing, each command in its own terminal:

```bash
pnpm infra:up
```

```bash
pnpm dev:backend
```

```bash
pnpm dev:engine
```

```bash
pnpm dev:frontend
```

Then load the data (once per fresh database). **Start the engine first**: the seed submits 56 programs and waits up
to 3 minutes for each verdict; without an engine it fails, and a failed run cannot be completed by running it again
(see section 7).

```bash
pnpm --filter @oj/backend seed
```

The seed refuses `NODE_ENV=production` and any database or Redis that is not on this machine, checks this before
connecting, and does nothing if it already ran ("Already seeded").

Open http://localhost:3000.

---

## 3. Accounts

All seeded teachers and students share one password: `SEED_PASSWORD` in `src/backend/src/seed.ts`.
The administrator uses `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `src/backend/.env` (defaults in `.env.example` and the README).

| Account | Role | Use it to test |
|---|---|---|
| `admin@oj.local` | Administrator | users, VIP, invitations, organizations, everything |
| `gv.lan@oj.local` | Teacher, **VIP**, org admin of "Trung tâm Tin học Sao Mai" | AI features; class 10A1; organization management |
| `gv.minh@oj.local` | Teacher, member of the center | class 11B2 (plagiarism flag, timed midterm); organization class `SAOMAI-HSG`; problem shared in the organization |
| `gv.hoa@oj.local` | Teacher; org admin of the **expired** school; invited to the center | archived class 12C3; expired plan; accepting an invitation on the home page |
| `gv.tuan@oj.local` | (no account yet) | invited into the center by email: open the link from the backend log to activate |
| `gv.phuong@oj.local` | (no account yet) | pending teacher invitation from the administrator |
| `hs01@oj.local` | Student in 10A1 and 11B2 | mixed results, learning record |
| `hs02`–`hs06@oj.local` | Students in 10A1 | homework, quiz; `hs02` asked a question; `hs03`, `hs06` also in `SAOMAI-HSG` |
| `hs07`, `hs08@oj.local` | Students in 11B2 | flagged as a copied pair; started the timed midterm |
| `hs09@oj.local` | Student in 11B2 and `SAOMAI-HSG` | timed midterm not started (start screen) |
| `hs10@oj.local` | Student in 11B2 (joined by request) | |
| `hs11@oj.local` | Student, archived 12C3 | history; join request to 11B2 waiting |
| `hs12@oj.local` | Student without a class | empty home; join request to 10A1 waiting |

Codes and links: emails are printed by the process that sends them, as a block starting `To: <email>` followed by
the text (`Mã xác thực: 123456`, links with `#c=` or `#t=`).
- Invitations created **by the seed** (`gv.tuan`, `gv.phuong`, and the notice to `gv.hoa`) are in the **seed command's
  output**. If you no longer have it, the administrator (or the org admin) can resend the invitation from the UI.
- Everything you do in the app afterwards (sign-ups, password resets, new invitations) is in the **backend log**.

---

## 4. What the seed creates

| Data | Details |
|---|---|
| Classes | `10A1-TIN` (Lan, 6 students), `11B2-TIN` (Minh, 5), `12C3-TIN` (Hoa, archived), `SAOMAI-HSG` (Minh, in the center, 3) |
| Problems | P0001 "Tổng hai số" (public with tests and solution), P0002 "Tổng dãy số" (public), P0003 "Kiểm tra số nguyên tố", P0004 "Dãy con tăng dài nhất" (public with solution), P0005 "Đảo ngược chuỗi" (public with tests), P0006 "Đếm số từ" (shared in the center), P0007 "Số Fibonacci", P0008 "Giá trị lớn nhất", P0009 copy of P0004 |
| Sets | "Bài tập về nhà tuần 1" (public), "Kiểm tra 15 phút: vòng lặp", "Thi học kỳ I", "Luyện tập xử lý chuỗi", "Kiểm tra giữa kỳ" |
| Sessions | 10A1: homework **open** (closes 5 days after seeding), quiz **closed** (score only, 3 attempts), exam **upcoming** (opens 3 days after seeding; timed 90 min, results hidden, plagiarism, C++/Python only); 11B2: string practice (plagiarism on), midterm **timed and running** (closes 1 day after seeding); 12C3: last year's session (closed); `SAOMAI-HSG`: "Luyện đội tuyển: Số Fibonacci" |
| Public session | "Luyện tập mở: Dãy con tăng dài nhất" (anyone signed in) |
| Submissions | 56 judged (observed on 2026-11-08: AC 24, WA 19, RE 5, TLE 5, CE 3); a plagiarism flag for hs07/hs08 in "Luyện tập xử lý chuỗi" (one entry) |
| Boards | 10A1: **pinned** announcement, an answered question, an open question; 11B2: announcement and an answered question; `SAOMAI-HSG`: one announcement |
| Requests | `hs12` → 10A1 and `hs11` → 11B2 waiting |
| Organizations | "Trung tâm Tin học Sao Mai" (5 seats, 60 days, AI; Lan org admin, Minh member, invitations to Hoa and Tuấn); "THPT Chuyên Lê Quý Đôn (hết hạn)" (expired, Hoa org admin) |

---

## 5. Sample files to upload and submit

Rebuild the exam files any time with `node samples/make-samples.mjs` after `pnpm install` (it uses the backend's jszip
and Playwright's Chromium; no extra packages). The code files in `samples/code/` are written by hand.

### 5.1 Exam documents (`samples/exams/`, menu "Nhập đề")
Results below were checked against the running app with the pattern reader (a non-VIP teacher, e.g. `gv.minh`).

| File | What it contains | Expected result |
|---|---|---|
| `de-kiem-tra-vong-lap.docx` | Class test: "Bài 1.", "Bài 2:", "Câu 3."; examples as Input/Output lines and as a table; limits and difficulty; Zalo, Facebook and LeetCode lines | 3 problems: "TỔNG CÁC CHỮ SỐ" (Dễ, 2 examples), "ĐẾM SỐ CHẴN" (Trung bình, 2 from the table), "SỐ LỚN THỨ HAI" (Khó, 2000 ms); no warnings; all links and adverts removed |
| `de-thi-hsg-file-io.docx` | Provincial HSG style: `BAI1.INP`/`BAI1.OUT` wording, examples in `BAI1.INP | BAI1.OUT` tables | 3 problems (the third "Rất khó", 2000 ms); file-I/O blocker on each until "Chuyển sang nhập/xuất chuẩn"; warnings for missing difficulty/time where absent |
| `de-luyen-tap.pdf` | PDF with a text layer, 128 MB memory limit in the preamble | 2 problems ("Chia kẹo", "Năm nhuận"), 128 MB, 1 and 2 examples |
| `noi-dung-dan.txt` | Text for the "Dán nội dung" tab | 2 problems ("Đảo số", "Bảng cửu chương" with a 10-line output example) with the expected warnings |
| `de-scan-khong-co-chu.pdf` | An image only (a scan) | Refused: "Không đọc được chữ trong tài liệu (có thể là PDF dạng ảnh scan)…"; with AI (VIP + API key) it is read |
| `khong-phai-word.docx` | A text file renamed to `.docx` | Refused, nothing imported: "Tệp này không phải tài liệu Word (.docx) hoặc PDF hợp lệ…" (`import.invalid_file`) |

More cases to try by hand: an 11 MB file (`head -c 11000000 /dev/urandom > /tmp/qua-lon.pdf`) → "File lớn hơn 10MB";
a `.doc` or `.png` → not accepted; your own real exam documents.

### 5.2 Code to submit (`samples/code/`)
For "Tổng hai số" (P0001; homework "Bài tập về nhà tuần 1", Bài 1) unless noted. Checked against the real engine:

| File | Expected |
|---|---|
| `ac.py`, `ac.cpp`, `ac.c`, `ac.java`, `ac.js` | Chấp nhận, 100 |
| `wa-wrong-answer.py` | Sai kết quả, partial |
| `wa-int-overflow.cpp` | for P0002 (Bài 2): Sai kết quả, 60 (only the big test fails) |
| `tle-infinite-loop.py` | Quá thời gian |
| `re-index-error.py` | Lỗi khi chạy |
| `ce-missing-semicolon.cpp` | Lỗi biên dịch, with the compiler message |
| `mle-big-list.py` | Quá bộ nhớ |
| `copy-a.py` + `copy-b.py` | Both AC; flagged "giống 100%" although every name differs. **Setup**: no seeded session has P0001 with the plagiarism check, so as `gv.lan` give P0001 to 10A1 with "Kiểm tra đạo văn" on, then submit one file as `hs04` and the other as `hs05` (one entry appears) |

Solutions can also be uploaded on a problem's "Lời giải" tab ("Tải file code").

---

## 6. Resetting

| Goal | How |
|---|---|
| Fresh development data | Stop the backend and the engine, then `docker compose down -v` in the repository root (removes **this project's** volumes: **all development data is deleted**), `pnpm infra:up`, start the backend and the engine, run the seed |
| Throwaway test stack | `pnpm infra:test:down` (data was only in memory) |
| End-to-end leftovers | none: each run drops its database; `.next-e2e/`, `test-results/`, `playwright-report/` are ignored by git |
| One browser for several accounts | sign out before switching accounts, or use a private window per account (the sign-in is kept per browser) |

---

## 7. Troubleshooting

| Symptom | Cause and fix |
|---|---|
| Submissions stay "Đang chờ chấm" | The engine is not running (`pnpm dev:engine`), or the runner image is missing/old (`pnpm runner:build`) |
| Seed stops at "Submissions" or ends with "Seed failed" | The engine was not running: each verdict is awaited up to 3 minutes, then the run fails. The data is partial (no organizations) and a rerun only says "Already seeded": reset the database (section 6), start the engine, seed again |
| Seed says "Already seeded" | The database already has the seed (or a failed partial run); reset it (section 6) for a fresh copy |
| Seed refuses to run | `NODE_ENV=production`, or `DATABASE_URL`/`REDIS_URL` not on this machine |
| `pnpm test:integration` / `test:e2e:*` refuse or fail to connect | Start the test stack: `pnpm infra:test:up` |
| Browser tests: Chromium missing | `pnpm exec playwright install chromium` |
| Port already in use (3000, 4000, 4100, 3100, 5432, 6379) | Another server or another project's database is running; find it with `lsof -iTCP:<port> -sTCP:LISTEN` and stop it |
| Signed out after restarting the backend | `JWT_SECRET` is empty in development (a new key each start); set one in `.env` to stay signed in |
| "Đăng nhập sai quá nhiều lần" | Wrong-password limit; wait (up to an hour), or reset the password. In development you can clear only the sign-in limits: `docker compose exec redis sh -c "redis-cli --scan --pattern 'oj:rl:login*' \| xargs -r redis-cli del"` (restarting Redis does not clear them; never FLUSHDB, it also empties the judge queues) |
| Chrome "Translate to English" warnings in the console | Handled (translation-safe DOM); report anything that still crashes |
| macOS: tools cannot read the project in Downloads | Grant the app access in System Settings → Privacy & Security → Files and Folders |
