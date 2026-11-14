# OJ-27: Paging for the list of learning paths

Status: done (approved by the user 2026-11-14: "proceed", after OJ-26 listed paging of paths as not covered)
Owner: Htet Oo Naing
Risky area: no. A read-only list, with the same actor scoping as before.

## Outcome

`GET /paths` no longer returns every path at once. The OJ-24 security check (N4) kept it unpaged because classroom
scale allowed it. The user asked to cover it now, so the list stays fast and small however many teachers publish paths.

## Scope

In:
- **Contracts:**
  - `PATHS_PAGE_SIZE = 24` and `PATHS_MAX_PAGE = 100`;
  - `GET /paths` takes `limit` (1 to 100, default 24) and `offset` (0 or more, default 0).
  - The response stays `LearningPathSummaryDto[]`, newest first by last update.
- **Backend:**
  - `LearningPathRepository.list(filter, { limit, offset })`, ordered by `updatedAt` then `id`, so pages are stable;
  - the service and the controller pass the page through;
  - the query DTO validates both numbers.
- **Frontend:** the "Lộ trình" (learning paths) section on the practice page shows the first 24 public paths and the
  teacher's first 24. A "Xem thêm" (show more) button under a full page loads the next one. vi/en strings.
- **Docs:** `docs/API.md`.

Out: a total count, and search over paths.

## Done when

- [x] `GET /paths?limit=2&offset=2` returns the third and fourth newest public paths. Private paths are never included,
      and `scope=mine` still lists only the caller's own.
- [x] `limit=0`, `limit=101` and `offset=-1` are rejected with a 400.
- [x] The practice page shows a full first page and a "Xem thêm" button, and the button adds the next page. Checked live.
- [x] Tests: service paging and scoping, the DTO limits, and a PostgreSQL round trip with stable order. The gate passes.

## Results and notes (2026-11-14)

- **API:**
  - On the throwaway stack, which now builds its database through migrations, a teacher published 30 paths.
  - A student got 24, then 6 with `offset=24`.
  - `limit=101` gave a 400.
- **Browser:**
  - The practice page showed 24 path cards and a "Xem thêm" (show more) button.
  - One click added the remaining 6 (30 unique, ending at "Lộ trình thử 01"), and the button disappeared.
  - No console errors from the page.
- **OJ-26 heading, checked on the same stack:** with 55 unanswered questions, gv.lan's home page reads "Từ 50 câu
  hỏi trở lên chờ trả lời" (50 or more questions awaiting an answer), newest first.
- **Checks run:**
  - the gate: backend 347, engine 169, frontend 78;
  - the integration suites: 54.
