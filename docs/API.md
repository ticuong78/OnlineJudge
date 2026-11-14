# REST API

Base URL: `${NEXT_PUBLIC_API_URL}` (dev: `http://localhost:4000/api`).
All request/response types live in `@oj/contracts` (`src/shared/src/api.ts`).

Auth: `Authorization: Bearer <accessToken>` (JWT, 7 days). The server checks the token against the account on every call:
the role and name come from the account, and a token stops working as soon as the account is deleted or its password is
changed or reset (signing in again gives a new one).
Errors: JSON `ApiErrorBody` `{ statusCode, message, code, details? }`. `message` is human readable (Vietnamese); `code` is a
stable English identifier on every error, so clients branch on `code`, never on `message`:
domain codes (`identity.wrong_code`, `organization.no_seats`, …, listed per endpoint; `identity.wrong_code` carries
`details.attemptsLeft`, so a client using its own wording can still show it); request errors raised before the
use case: `request.invalid` (400, body checks; `message` joins the reasons with "; "), `auth.required` (401),
`auth.forbidden` (403, role), `request.not_found` (404, unknown route), `request.too_large` (413), other statuses
`request.failed`; unexpected failures `server.error` (500, generic message, details only in the server log).

### Rate limits (HTTP 429)
Public auth endpoints are limited. Over the limit the answer is `429` with code `identity.too_many_attempts` (sign-in) or
`rate.limited`, the wait in the `Retry-After` header (seconds) and in `message`. Counters are kept in Redis, so they survive a backend restart and hold across instances; if Redis is unreachable these endpoints fail rather than let attempts through uncounted. Limits are per client IP (the address the
API sees: behind a reverse proxy set `TRUST_PROXY`, see README; IPv6 clients are counted per /64 block) and, where noted, per mailbox:

| Endpoint | Limit |
|---|---|
| `POST /auth/login` | wrong passwords only: 10 per account per IP and 300 per IP, per 10 minutes, and 100 per account from all IPs together per hour (more than one IP may send in an hour, so a single address cannot fill it). Successful sign-ins are not counted; while blocked even the right password is refused. The account-wide limit skips addresses that signed in to that account in the last 30 days (so an attack cannot lock the owner out), is lifted by a password reset (which also exempts the address the reset was done from), and emails the owner once per hour while it is hit. Unknown addresses are limited the same way |
| `POST /auth/register` | 60 per IP per hour; 2 per mailbox per minute |
| `POST /auth/password/forgot` | 30 per IP per hour; 2 per mailbox per minute |
| `POST /auth/verification/resend` | 30 per IP per hour; 2 per verification per minute |
| `POST /auth/register/verify`, `/auth/password/reset`, `/auth/invitations/accept` | 300 per IP per 10 minutes (a code additionally allows only 5 attempts, however they arrive). Sign-up codes also have a budget of 20 wrong codes per address per 24 hours, across resends and new sign-ups (`identity.too_many_attempts`) |
| `GET /auth/invitations/:id` | 120 per IP per 10 minutes |

Roles: `ADMIN` (exactly one, seeded from env), `TEACHER` (invited by admin by email), `STUDENT` (self-registered with a class's join code + email OTP).
"Staff" = ADMIN or TEACHER.

## Auth / users
| Method | Path | Who | Body | Response |
|---|---|---|---|---|
| POST | /auth/login | public | LoginRequest | AuthResponse (401 `identity.bad_credentials` for an unknown email or a wrong password alike; 429 when throttled, see above) |
| GET | /auth/me | any | – | UserDto |
| POST | /auth/register | public | RegisterRequest (`classCode` optional) | 202 VerificationTicketDto — a 6-digit OTP is emailed; no account yet. With a class code, a JOIN request to that class is created once verified (the teacher approves); without one the student is a free candidate. An address that already has an account gets the same answer (never 409 `email_taken`); its owner is emailed a notice with no code, so that ticket can never be verified |
| POST | /auth/register/verify | public | VerifyCodeRequest | AuthResponse (account created, role STUDENT). Sign-up is completed only with the 6-digit code typed on the screen that asked for it; the sign-up email has no link, so the mailbox owner cannot be made to confirm a sign-up someone else started |
| POST | /auth/verification/resend | public | ResendCodeRequest | VerificationTicketDto (409 if before `resendAvailableAt`). Answers the same whether or not the address has an account; a reset code is only sent to an existing account, in the background |
| POST | /auth/password/forgot | public | ForgotPasswordRequest | 202 VerificationTicketDto. The answer does not depend on whether the email has an account, including when asked again within the resend cooldown (the same ticket comes back; no second email is sent), and neither do the answers to resend or to a wrong code on that ticket. Only an existing account is emailed a code, in the background |
| POST | /auth/password/reset | public | ResetPasswordRequest (`verificationId` + `token` from the emailed link) | AuthResponse (signed in with the new password). The reset email carries only a link `FRONTEND_URL/forgot-password?v=<id>#t=<token>`, valid once until the ticket expires. There is no reset code, so nothing short can be guessed and wrong tries never use up the owner's link |
| GET | /auth/invitations/:id | public | – | InvitationPreviewDto (400 if expired/used) |
| POST | /auth/invitations/accept | public | AcceptInvitationRequest | AuthResponse (account created, role TEACHER) |
| GET | /users | ADMIN | – | UserDto[] |
| DELETE | /users/:id | ADMIN | – | 204 (cannot delete admin). A teacher leaves their organizations first, as if removed (seats freed; the organizations keep their classes and problem copies); 409 `organization.last_admin` while they are the only org admin of one |
| PUT | /users/:id/vip | ADMIN | SetVipRequest `{ vip }` | UserDto — teachers only. VIP moves a teacher from the FREE to the PLUS AI plan (see "AI usage limits"). The session `checkAiUsage` setting still needs PLUS or admin (403 `ai.vip_required`). |
| GET | /ai/usage?userId= | ADMIN, TEACHER | – | AiUsageDto — the caller's AI plan, the month (Vietnam time), when it resets, and per feature the limit (null = none) and the uses so far. `userId` (another account) is for ADMIN only: 403 `ai.usage_forbidden` |
| GET | /users/invitations | ADMIN | – | InvitationDto[] (pending teacher invitations) |
| POST | /users/invitations | ADMIN | InviteTeacherRequest | InvitationDto — email with link `${FRONTEND_URL}/invite?id=<id>#c=<code>` |
| POST | /users/invitations/:id/resend | ADMIN | – | InvitationDto (new code, old link stops working; 1-minute cooldown) |
| DELETE | /users/invitations/:id | ADMIN | – | 204 (an invitation sent for an organization also frees its seat) |

`UserDto.organizations`: the teacher's organizations (OJ-8). `canUseAi` is also true for a member of an active organization with AI included.

## Server features (OJ-13)
| Method | Path | Who | Body | Response |
|---|---|---|---|---|
| GET | /features | ADMIN, TEACHER | – | FeaturesDto `{ ai }`: whether a Claude key is configured, so AI controls can be shown disabled with the reason (OJ-13). Never returns the key or the model |

## Organizations (OJ-8: centers and schools)
An organization has teacher seats, a plan end date (`activeUntil`, inclusive, Vietnam time) and whether AI is included.
A teacher may belong to several organizations, in each as org admin (`ADMIN`) or `TEACHER`. Members plus pending,
unexpired invitations use seats; reservations are checked in one transaction (409 `organization.no_seats`). After
`activeUntil`: AI from the organization stops and no new invitations (409 `organization.inactive`); nothing is deleted.
"Org admin" below = org admin of that organization, or the system administrator. Organization ids are always checked
against the caller's memberships; outsiders get 404 `organization.not_found`.

| Method | Path | Who | Body | Response |
|---|---|---|---|---|
| GET | /organizations | ADMIN, TEACHER | – | OrganizationDto[] — admin: all; teacher: their own (`myRole`) |
| POST | /organizations | ADMIN | CreateOrganizationRequest (terms + `adminUserId`, an existing teacher) | OrganizationDetailDto |
| GET | /organizations/:id | admin or member | – | OrganizationDetailDto (`invitations` only for org admins) |
| PUT | /organizations/:id | ADMIN | UpsertOrganizationRequest | OrganizationDetailDto (409 `organization.seats_in_use` below the seats in use) |
| POST | /organizations/:id/members | ADMIN | AddOrganizationMemberRequest | OrganizationDetailDto — existing teacher joins directly (a pending invitation of theirs is withdrawn) |
| PUT | /organizations/:id/members/:userId/role | org admin | SetOrganizationRoleRequest | OrganizationDetailDto (409 `organization.last_admin`) |
| DELETE | /organizations/:id/members/:userId | org admin; the member themselves (= leave) | – | 204 — the organization's classes taught by them go to the remover (or the longest-standing other org admin); problems they shared with it are unshared and copied into that org admin's bank; 409 `organization.last_admin` |
| POST | /organizations/:id/invitations | org admin (60 per IP per hour) | InviteToOrganizationRequest | OrganizationInvitationDto — existing teacher: accepts on their home page (notice email, no code); new email: the teacher invitation (email + code) that creates the account and joins; 409 `organization.not_a_teacher`, `already_member`, `already_invited`, `no_seats`, `inactive` |
| DELETE | /organizations/:id/invitations/:invitationId | org admin | – | 204 (seat freed) |
| GET | /organizations/:id/classes | org admin | – | ClassroomDto[] (class module) |
| GET | /organization-invitations/mine | TEACHER | – | OrganizationInvitationDto[] (pending, addressed to the caller) |
| POST | /organization-invitations/:id/accept | TEACHER (addressee) | – | OrganizationDto |
| POST | /organization-invitations/:id/decline | TEACHER (addressee) | – | 204 (seat freed) |

OTP rules: 6 digits, valid 10 minutes (invitations: 7 days), 5 attempts per code then "send again", resend cooldown 60s.
An attempt is claimed before the code is compared, atomically, so 5 is a hard limit even for parallel requests. A code can be used once.
Phone is optional, Vietnamese format, stored for contact only (not verified).

## Concepts (since "Đợt 1")

- **Bank (ngân hàng)**: problems and problem sets are *blueprints* owned by a teacher (or the admin).
  Nobody submits to a blueprint. The admin may view and edit every bank.
- **Sharing**: a blueprint is private by default. A problem can be made public at three independent
  levels: statement (`isPublic`), hidden tests (`publicTests`), solution (`publicSolution`). Other teachers
  can view public blueprints and **copy** them into their own bank (the copy records `copiedFrom`).
- **Session (phiên)**: an *instance* of a set blueprint (or of a single problem) given either to a class
  or to everyone (public). Problems are **frozen** (snapshot) when the session is created, so editing the bank
  never changes a running session. Each session has an optional open/close time. Submissions, scores and
  "solved" status belong to a session: solving problem P in session A does not count for session B.
- **Solved**: a problem is solved in a session when the student has an AC submission in that session.
  A session is completed when every problem in it is solved.
- **Class lifecycle**: ACTIVE → ARCHIVED (course finished: read-only, no new students, no submissions;
  students can still open the sessions) → can be restored, or deleted for good (scheduled after N days,
  or immediately with name confirmation). Deleting removes the class and its sessions; students keep their
  learning record (titles and results, no access to statements) and their own submitted code.
- A student may be in **several classes** at once, or in none (free candidate: public sessions and practice only).
  Students only *ask* to join (by class code) or to leave; the class manager approves or rejects. Managers act
  directly: add a student by email, remove a student. Classes a student left or that were archived remain as history.

## Classes (lớp)
"Manager" of a class = its teacher, the admin, or an org admin of the organization the class belongs to (OJ-8).
Managers have every class power (roster, requests, sessions, results, submissions, rejudge, integrity, board, archive),
except that deleting a class for good (`schedule-deletion`, `delete-now`) is for its teacher and the admin only
(403 `classroom.only_teacher_deletes` for org admins).

| Method | Path | Who | Body | Response |
|---|---|---|---|---|
| GET | /classes | any | – | ClassroomDto[] — admin: all; teacher: classes they teach plus the classes of organizations where they are org admin; student: current classes + history (`code` null, `isCurrent`); managers also get `pendingRequestCount`. `organization` null = personal class |
| POST | /classes | staff | UpsertClassroomRequest | ClassroomDto. Teachers always create for themselves; admin may pass `teacherId`. Optional `organizationId`: one of the creator's organizations (403 `classroom.not_in_organization`) |
| PUT | /classes/:id/organization | class teacher or admin | MoveClassToOrganizationRequest | ClassroomDto — a personal class joins one of the teacher's organizations; one way (409 `classroom.already_in_organization`) |
| GET | /classes/:id | manager or (former) member | – | ClassroomDto |
| PUT | /classes/:id | manager | UpsertClassroomRequest | ClassroomDto (changing `teacherId`: admin, or an org admin to a member of the class's organization; not allowed while archived) |
| POST | /classes/:id/archive | manager | – | ClassroomDto (status ARCHIVED) |
| POST | /classes/:id/restore | manager | – | ClassroomDto (ACTIVE again, cancels scheduled deletion) |
| POST | /classes/:id/schedule-deletion | manager | ScheduleClassDeletionRequest | ClassroomDto (`purgeAt` set; class must be archived) |
| POST | /classes/:id/cancel-deletion | manager | – | ClassroomDto |
| POST | /classes/:id/delete-now | manager | DeleteClassNowRequest | 204 (class must be archived; `confirmName` must equal the name) |
| GET | /classes/:id/students | manager | – | ClassStudentDto[] (current students) |
| POST | /classes/:id/students | manager | AddStudentRequest | ClassStudentDto — adds a registered student by email (404 if no such student account); settles their pending requests for the class |
| DELETE | /classes/:id/students/:studentId | manager | – | 204 — removes the student; the class stays in their history |
| GET | /classes/unassigned-students | ADMIN | – | ClassStudentDto[] (students with no current class) |
| PUT | /classes/students/:studentId | manager of the target class | MoveStudentRequest | ClassStudentDto — adds the student to that ACTIVE class; other classes are not affected |

### Join and leave requests
| Method | Path | Who | Body | Response |
|---|---|---|---|---|
| POST | /classes/join | STUDENT | JoinClassRequest | 201 MembershipRequestDto (PENDING). 400 wrong code or archived class; 409 already a member or already pending |
| POST | /classes/:id/leave | STUDENT (current member) | LeaveClassRequest | 201 MembershipRequestDto (PENDING). 409 already pending or class archived |
| GET | /membership-requests/mine | STUDENT | – | MembershipRequestDto[] — last 30, newest first, every status |
| POST | /membership-requests/:id/cancel | STUDENT (sender) | – | MembershipRequestDto (CANCELLED) |
| GET | /classes/:id/requests | manager | – | MembershipRequestDto[] — pending JOIN and LEAVE requests, oldest first |
| POST | /membership-requests/:id/approve | manager | – | MembershipRequestDto (APPROVED; JOIN opens the membership, LEAVE ends it). Class must be ACTIVE |
| POST | /membership-requests/:id/reject | manager | – | MembershipRequestDto (REJECTED) |
| POST | /classes/:id/requests/approve-all | manager | – | `{ approved: number }` — approves every pending JOIN request |

A decided request cannot be decided again (409). Requests are deleted with their class or the student account.

Class codes: 4–20 chars `A-Z 0-9 -`, case-insensitive, unique (e.g. `22DTHC5`). Only ACTIVE classes accept join requests.
Deleting a teacher account hands their classes to the admin.

## Problem bank (catalog)
Staff only (students reach problems through sessions).

| Method | Path | Who | Body | Response |
|---|---|---|---|---|
| GET | /problems?scope=mine\|public\|organization\|all&organizationId=&search=&difficulty=&tag=&tag=&page=1&pageSize=20 | staff (`all`: admin) | – | Paginated<ProblemSummaryDto>. `organization`: shared with one of the caller's organizations (narrowed by `organizationId`). `tag` may repeat (at most 5): problems carrying all of them; each is normalised like a stored tag, so `tag=quy hoạch động` finds `dp` (OJ-20) |
| GET | /problems/tags?scope=&organizationId= | staff (`all`: admin) | – | ProblemTagDto[] — every tag in the scope with how many problems carry it, most used first; same scope rules as the list (OJ-20) |
| GET | /problems/:id | owner, admin, any staff if public, teachers of an organization it is shared with | – | ProblemDetailDto (tests/solution filtered by sharing; organization colleagues see everything) |
| POST | /problems | staff | CreateProblemRequest (UpsertProblemRequest + optional `testCases`, ≤ 200; examples are tests with `isSample`) | ProblemDetailDto (owned by the caller), saved together with its tests |
| POST | /problems/suggest-tests | staff | SuggestDraftTestsRequest (`problem` as typed, `tests` it already has, `count`, `focus`) | 200 TestCaseSuggestionsDto — AI test suggestions for a problem **not saved yet** (creating, importing); same as `/problems/:id/test-cases/suggest` without the stored solution |
| PUT | /problems/:id | owner or admin | UpsertProblemRequest | ProblemDetailDto |
| DELETE | /problems/:id | owner or admin | – | 204 (removed from the owner's sets; running sessions keep their frozen copy) |
| PUT | /problems/:id/sharing | owner or admin | SharingDto | ProblemDetailDto. `organizationIds` (required): organizations of the caller (403 `catalog.not_in_organization` otherwise); their teachers see the whole problem and can copy it |
| POST | /problems/:id/copy | staff, problem public (or admin) | – | ProblemDetailDto — copy in the caller's bank (hidden tests / solution only if shared) |
| POST | /problems/:id/test-cases | owner or admin | UpsertTestCaseRequest | TestCaseDto |
| POST | /problems/suggest-section | staff | SuggestProblemSectionRequest (`section`: title (OJ-22: one line, no numbering, ≤ 120 characters, never the file-I/O fallback), statement, inputFormat, outputFormat or constraints; `problem`: the content as typed, saved or not) | 200 ProblemSectionSuggestionDto — AI rewrite of that section, **not saved** (the "Dùng gợi ý" switches). Text never comes back with file input/output. Without an API key only the file-to-standard-I/O rewrite of a text section is offered; otherwise 400 `catalog.ai_unavailable` |
| POST | /problems/:id/test-cases/suggest | owner or admin | SuggestTestCasesRequest (`count` 1–10, default 5; optional `focus`) | 200 TestCaseSuggestionsDto — AI-proposed tests, **not saved**; the editor adds the ones they keep with POST /problems/:id/test-cases. Claude computes outputs by running code (`outputVerified`). Inputs the problem already has are dropped. The statement, input/output and constraints always win over `focus`: parts of `focus` that contradict them are not followed and are explained in `focusRejections`. 400 `catalog.ai_unavailable` without ANTHROPIC_API_KEY, `catalog.ai_failed` when the AI call fails. Takes 30 s – 2 min |
| PUT | /problems/:id/test-cases/:testCaseId | owner or admin | UpsertTestCaseRequest | TestCaseDto |
| DELETE | /problems/:id/test-cases/:testCaseId | owner or admin | – | 204 |
| PUT | /problems/:id/solution | owner or admin | UpsertSolutionRequest | SolutionDto |
| DELETE | /problems/:id/solution | owner or admin | – | 204 |

`code` of a problem is auto-generated (`P0001`, ...).

## Importing exam documents (into the caller's bank)
| Method | Path | Who | Body | Response |
|---|---|---|---|---|
| POST | /imports/parse | staff | multipart/form-data, field `file` (.docx or .pdf, ≤ 10MB; or a photo of a problem, .png/.jpg/.webp ≤ 5MB, OJ-23) | ParsedExamDto. Photos are read by AI only: 403 `ai.vip_required` for teachers without an `IMAGE_IMPORT` allowance, 429 `ai.quota_exceeded` at the limit, 400 `import.image_needs_ai` (no key), `import.image_unreadable` (the use is given back), `import.image_too_large`, 409 `import.ai_busy` (the allowance cannot be checked). 400 `import.no_file`, `import.unsupported_type` (other extensions), `import.invalid_file` (the content is not a Word document or PDF, checked by its signature, e.g. a text file renamed to `.docx`), `import.empty_document` (no text, e.g. a scanned PDF) |
| POST | /imports/parse-text | staff | `{ text }` (≤ 100,000 characters) | ParsedExamDto (`fileName` = "Nội dung đã dán") — the same reading as `parse`, for exam text pasted by the teacher ("Tái cấu trúc bằng AI"). 400 `import.empty_text` |
| POST | /imports/confirm | staff | ImportProblemsRequest (each draft carries its `tests`; examples read from the document arrive as tests with `isSample`) | ImportProblemsResponse (problems owned by the caller, saved with their tests). 400 `import.file_io` (nothing imported) when a draft still reads or writes files |

## Problem set bank
| Method | Path | Who | Body | Response |
|---|---|---|---|---|
| GET | /problem-sets?scope=mine\|public\|all | staff (`all`: admin) | – | ProblemSetDto[] |
| GET | /problem-sets/:id | owner, admin, or staff if public | – | ProblemSetDto |
| POST | /problem-sets | staff | UpsertProblemSetRequest (items from own bank) | ProblemSetDto |
| PUT | /problem-sets/:id | owner or admin | UpsertProblemSetRequest | ProblemSetDto |
| DELETE | /problem-sets/:id | owner or admin | – | 204 (sessions created from it are kept) |
| PUT | /problem-sets/:id/sharing | owner or admin | ProblemSetSharingRequest | ProblemSetDto (public requires all its problems public) |
| POST | /problem-sets/:id/copy | staff, set public (or admin) | – | ProblemSetDto — copies the set and its problems into the caller's bank |
| GET | /problem-sets/:id/answer-key | owner or admin | – | AnswerKeyDto (for printing the paper / answer key) |

## Sessions (phiên)
"Manager" of a session = teacher of its class (class sessions), its creator (public sessions), or the admin.

| Method | Path | Who | Body | Response |
|---|---|---|---|---|
| GET | /sessions?classId=&audience=CLASS\|PUBLIC | any | – | SessionDto[] — students: sessions of their current/former classes + public; teachers: their classes + public; admin: all |
| GET | /sessions/:id | manager, class (former) member, anyone for public | – | SessionDto (with `myProgress`) |
| GET | /sessions/:id/problems/:key | same as above | – | SessionProblemDto |
| POST | /sessions | staff | CreateSessionRequest | SessionDto — source must be in the caller's bank (admin: any); class must be managed and ACTIVE. A problem or set is assigned **once per audience** (a class, or public): again → 409 `assessment.already_assigned` with `details.sessionId` of the existing session (also when two requests race, e.g. a double click) |
| PUT | /sessions/:id | manager | UpdateSessionRequest | SessionDto |
| DELETE | /sessions/:id | manager | – | 204 (also removes its submissions and progress) |
| GET | /sessions/:id/results | manager | – | SessionResultsDto — class: every current student (zeros included) plus anyone who submitted; public: participants |

Submitting is allowed when: the session is OPEN (now within opensAt/closesAt), and for class sessions the class is
ACTIVE and the user is a current student of it or its manager. Public sessions: any signed-in user.

### Exam mode and session settings (Đợt 2)
`CreateSessionRequest.settings` / `UpdateSessionRequest.settings` (`SessionSettingsDto`):
- `durationMinutes`: timed session. Each participant presses **start** (`POST /sessions/:id/start`) and gets
  `min(start + duration, closesAt)` (`SessionDto.myAttempt.endsAt`). Before starting, `needsStart` is true and
  problem statements return 403; after `endsAt` submissions are refused. Managers are never timed.
- `allowedLanguages` (empty = all), `maxSubmissionsPerProblem` (per participant and problem; null = unlimited).
- `feedback`: `FULL` | `SCORE_ONLY` (verdict + score, no per-test results) | `HIDDEN_UNTIL_CLOSED` (only "submitted").
  Applies to participants until the session closes; managers always see everything. Hidden results show as
  `SubmissionDto.resultsHidden` / `testsHidden`, `MySessionProgressDto.resultsHidden` and học bạ `resultsHidden`.
- `SessionDto.serverNow` lets clients correct their countdown for clock skew.

| Method | Path | Who | Body | Response |
|---|---|---|---|---|
| POST | /sessions/:id/start | participant | – | SessionDto (idempotent; timer starts once) |
| POST | /sessions/:id/refresh | manager | – | SessionDto — re-freezes problems from their current bank version (keys/points kept). Follow with a rejudge |
| GET | /sessions/:id/sync | manager | – | SessionSyncPreviewDto — what syncing with the source set would change (added/removed problems, order, points, content); nothing saved. 400 for sessions given from a single problem |
| POST | /sessions/:id/sync | manager | – | SessionSyncResultDto — makes the session match its source set. Kept problems keep their key, removed keys are never reused (their submissions stay but stop counting and are skipped by rejudges). Follow with a rejudge of `changes.contentChanged` |
| POST | /sessions/:id/rejudge | manager | RejudgeRequest | RejudgeResponse — every submission (or of one problem) is judged again with the session's current tests; scores and học bạ are rebuilt from the new results |

## Submissions (judging)
| Method | Path | Who | Body | Response |
|---|---|---|---|---|
| POST | /submissions | see above | SubmitRequest | SubmissionDto (status PENDING). 409 `judging.too_many_pending` (a student may have `MAX_PENDING_SUBMISSIONS` waiting at once) or `judging.submission_limit` (the session's per-problem limit); both limits are enforced atomically, also for parallel requests. A submission ended by a system error (verdict `IE`) does not count as an attempt, with one exception: a system error that happened after the program had started running (`faultSource` = `program`) counts from the third one per student and problem, for good (a program could otherwise make the sandbox fail on purpose and probe the hidden tests for free). System errors before any of the program ran (`infrastructure`: queue down, sandbox start, compiler missing, lost result) never count |
| GET | /submissions?sessionId=&problemKey=&mine=true&page=1&pageSize=20 | any | – | Paginated<SubmissionDto> — students: own only; staff: own, or all of a session they manage (`sessionId` required unless admin) |
| GET | /submissions/:id | owner, session manager, admin | – | SubmissionDetailDto |

Clients poll `GET /submissions/:id` (≈1s) until `status === 'DONE'`.

A submission whose judge job vanished (queue data lost, engine crashed on it) is ended with verdict `IE` and an explanatory
`compileOutput` after `JUDGE_STALE_AFTER_SECONDS` (default 300); jobs still queued or running are left alone until
`JUDGE_GIVE_UP_AFTER_SECONDS` (default 1800). `IE` is a system error: it does not reach the scoreboard or học bạ, does not count
as an attempt, and the student can submit again (or the teacher can rejudge).

## Trial runs on the sample tests (judging, OJ-18)

A trial runs code on a problem's sample tests only and returns each sample's program output next to the expected one.
Nothing is recorded: no submission, no attempt, no score, no integrity check. Trials live in Redis for 15 minutes.

| Method | Path | Who | Body | Response |
|---|---|---|---|---|
| POST | /sessions/:id/problems/:key/trial-runs | ADMIN, TEACHER, STUDENT who may read the statement (same rule as `GET /sessions/:id/problems/:key`, including "start a timed session first") | CreateTrialRunRequest | TrialRunDto (status PENDING). 409 `judging.no_samples` (the problem has no sample tests), `judging.trial_pending` (one trial in flight per user), `judging.trial_unavailable` (queue down); 429 `judging.too_many_trials` (20 per 10 minutes per user, with `Retry-After`); 400 `judging.language_not_allowed` |
| GET | /trial-runs/:id | ADMIN, TEACHER, STUDENT: the user who started it | – | TrialRunDto. 404 `judging.trial_not_found` for anyone else, or after it expired |

Clients poll `GET /trial-runs/:id` (≈1s for a minute, then every few seconds) until `status === 'DONE'`. Trial jobs
are queued behind every waiting submission, run at most the first 10 samples, and carry program output (at most 4,000
characters per test). The input and expected output shown for a sample are cut to 4,000 characters too (the judge
still gets the whole sample). Starting a trial removes the user's previous trial job if it is still waiting, and an
engine skips a trial job that waited longer than 15 minutes. `:key` must be 1–3 letters (400 otherwise). Submissions
never carry program output.

## Learning record (học bạ)
| Method | Path | Who | Body | Response |
|---|---|---|---|---|
| GET | /progress/me | any | – | LearningRecordDto — grouped by class (current, archived, deleted) and public practice. `topics`: attempted/solved per topic, leaving out tests and exams whose topics the student may not see yet (OJ-20) |
| GET | /practice/problems?topic= | ADMIN, TEACHER, STUDENT | – | PracticeProblemDto[] — problems of open public PRACTICE and HOMEWORK sessions (never tests or exams, for anyone), optionally of one topic in any spelling, with `solved` for the caller; newest sessions first, at most 300 (OJ-20) |
| GET | /practice/topics | ADMIN, TEACHER, STUDENT | – | ProblemTagDto[] — every topic of those problems with its count, uncapped (OJ-20) |

## Đợt 3: AI exam reader, integrity checks, class community

### AI usage limits (OJ-21)
Every AI request counts against a monthly allowance per account and feature, reset on the 1st (Asia/Ho_Chi_Minh). Only
successful requests count: a use is reserved before the Claude call (atomically, so parallel requests never exceed it)
and given back when the call fails. Without `ANTHROPIC_API_KEY` nothing is counted and the features behave as before.

| Plan (`UserDto.aiPlan`) | Who | `IMPORT` | `SECTION` | `TESTS` | `AI_USAGE_CHECK` |
|---|---|---|---|---|---|
| `NONE` | students | – | – | – | – |
| `FREE` | teachers without VIP | 3 | 20 | 3 | 0 |
| `PLUS` | VIP teachers, teachers of an active organization with AI | 100 | 500 | 100 | 2000 |
| `UNLIMITED` | the administrator | no limit | no limit | no limit | no limit |

`IMAGE_IMPORT` (OJ-23, photos of a problem): FREE 0, PLUS 100, admin no limit.

The numbers are the defaults of `AI_LIMIT_<PLAN>_<FEATURE>` (`.env`; "unlimited" allowed). What counts:
- `IMPORT`: one document or pasted text read by AI (`/imports/parse`, `/imports/parse-text`);
- `IMAGE_IMPORT`: one photo read by AI (`/imports/parse` with an image);
- `SECTION`: one rewrite of a section or the title (`/problems/suggest-section`);
- `TESTS`: one request to `/problems/suggest-tests` or `/problems/:id/test-cases/suggest` (up to 10 tests);
- `AI_USAGE_CHECK`: one submission reviewed, counted for the session's teacher. Only a student's **first accepted
  (AC) solution per problem** is reviewed, once, so resubmitting cannot spend the teacher's allowance. A rejudge or a
  redelivered event never takes a use.

At the limit:
- `SECTION` and `TESTS` answer 429 `ai.quota_exceeded`, with `details` `{ feature, limit, resetsAt }` and `Retry-After`.
  A plan with no allowance for the feature gets 403 `ai.vip_required`. The rule-based file-to-standard-I/O rewrite
  stays free.
- `IMPORT` falls back to the rule-based reader, and `ParsedExamDto.aiQuotaExhausted` is `true`. An import is never
  refused, not even when the allowance cannot be checked (Redis down): AI is then not used.
- `AI_USAGE_CHECK` is skipped for further submissions until the reset.

Separately, every account may make at most `AI_RATE_PER_MINUTE` (default 10) AI requests a minute, across features;
the administrator, who has no monthly limit, `AI_ADMIN_RATE_PER_MINUTE` (default 60), so a stolen admin token cannot
run up an unbounded bill. Over it: 429 `rate.limited` with `Retry-After`. This does not apply to the background
AI-usage checks.

### Importing with AI
`POST /imports/parse` uses Claude when the server has `ANTHROPIC_API_KEY` (PDF is sent as a document, so messy layouts and
scanned pages work; DOCX is sent as extracted text with tables). If there is no key or the AI call fails, the rule-based
reader is used, and also when this month's `IMPORT` uses are gone (`aiQuotaExhausted`). `ParsedExamDto.parser` says
which one produced the drafts (`AI` | `BASIC`).

### Integrity checks (teacher-only "gợi ý cần xem lại")
Two independent switches in `SessionSettingsDto`: `checkPlagiarism`, `checkAiUsage`. After a submission is judged
(not CE/IE), the server checks it in the background:
- plagiarism: code fingerprints (tokens normalised, identifiers ignored) compared with every other participant's
  submissions of the same problem in the same session; flagged at similarity ≥ 0.75 (≥ 0.9 = HIGH);
- AI usage: Claude reviews statement + code and returns a risk with reasons and line ranges; MEDIUM/HIGH are flagged.
Flags are never shown to students and never change scores.

| Method | Path | Who | Body | Response |
|---|---|---|---|---|
| GET | /integrity-flags?status=OPEN\|ACKNOWLEDGED&sessionId= | staff | – | IntegrityFlagDto[] — flags of sessions the caller manages |
| GET | /integrity-flags/:id | session manager | – | IntegrityFlagDetailDto (both codes for side-by-side comparison) |
| POST | /integrity-flags/:id/acknowledge | session manager | – | IntegrityFlagDto (status ACKNOWLEDGED, "Đã xem") |

### Class community
| Method | Path | Who | Body | Response |
|---|---|---|---|---|
| GET | /classes/:id/threads?sessionId=&problemKey= | class teacher/admin, current or former students | – | ThreadSummaryDto[] (pinned first, then latest activity; `awaitingAnswer` marks students' questions no teacher or admin has replied to, OJ-13) |
| POST | /classes/:id/threads | ANNOUNCEMENT: manager; QUESTION: current students and manager | CreateThreadRequest | ThreadDto |
| GET | /threads/awaiting | ADMIN, TEACHER | – | ThreadSummaryDto[]: students' questions no teacher or admin has answered yet, in the active classes the caller runs (all classes for ADMIN), newest first, at most the 50 newest (OJ-26). Used by the teacher home (OJ-13) |
| GET | /threads/:id | as above | – | ThreadDto |
| POST | /threads/:id/replies | current students and manager | CreateReplyRequest | ThreadReplyDto |
| DELETE | /threads/:id | author or manager | – | 204 |
| DELETE | /threads/:id/replies/:replyId | author or manager | – | 204 |
| POST | /threads/:id/pin | manager | PinThreadRequest | ThreadDto |

Archived classes are read-only (no new threads or replies); threads are deleted with the class.

### Standard input/output only
Programs are judged on standard input and standard output. Creating or updating a problem (and confirming an import)
is refused with 400 `catalog.file_io` / `import.file_io` when the statement, input, output or constraints still ask to
read or write files ("Đọc từ file BAI1.INP", "Ghi ra tệp BAI1.OUT", "Tên file chương trình"). `@oj/contracts` exports
the same check (`fileIoFields`, `hasFileIo`) and the suggested rewrite (`toStandardIo`), which the web app offers as a
"Dùng gợi ý" switch next to each section. Imports keep the document's wording; only AI hints about files are dropped.

## Learning paths (OJ-24)

A learning path is a teacher's ordered list of steps through open **public PRACTICE or HOMEWORK sessions**, from easy to
harder, each with a note on what is new. Steps are recommended, not locked. A step whose session has the setting
`hideTopics` is a **mixed review**: students see no topics there while it runs.

| Method | Path | Who | Body | Response |
|---|---|---|---|---|
| GET | /paths?scope=public\|mine&limit=&before= | ADMIN, TEACHER, STUDENT | ListPathsQuery | LearningPathPageDto `{ items: LearningPathSummaryDto[], next }` — `public`: public paths; `mine`: the caller's own (staff; empty for students). Each with the caller's solved/total. Newest first by creation (OJ-28). `limit` 1–100 (default `PATHS_PAGE_SIZE`, 24). `next` is an opaque cursor for `before=`, or null on the last page, so pages never skip or repeat a path. 400 `validation` for a bad `limit`, 400 `assessment.invalid_cursor` for a bad `before` |
| GET | /paths/:id | ADMIN, TEACHER, STUDENT | – | LearningPathDto — steps with their session's problems (topics as the session shows them to the caller), the caller's progress, and `next` (the first unsolved problem of the first open unfinished step). A private path is 404 `assessment.path_not_found` for anyone but its owner and admins |
| POST | /paths | ADMIN, TEACHER | UpsertLearningPathRequest | LearningPathDto. 400 `assessment.path_step_missing` (a step's session no longer exists), `assessment.path_step_not_public` (a step that is not a public PRACTICE/HOMEWORK session), `assessment.invalid_path_steps` (1–30), `assessment.duplicate_path_step`, `assessment.invalid_path_title` / `_description` / `_step_title` / `_step_note` |
| PUT | /paths/:id | owner or ADMIN | UpsertLearningPathRequest | LearningPathDto. 403 `assessment.not_path_owner` |
| DELETE | /paths/:id | owner or ADMIN | – | 204. Sessions and results are not touched |

`SessionSettingsDto.hideTopics` (optional in requests, default false): students see no topics on the session, its
problems and paths until the session closes (managers always do); such a session is left out of practice by topic,
and its topics are not counted in học bạ while it runs. Tests and exams always hide them. Path descriptions and step
notes have links to other places removed when saved.

## Topics (OJ-20)

A problem's `tags` holds standard topic ids from `@oj/contracts` (`Topics`: `arrays`, `prefix-sums`, `dp`, …) and
free tags. Tags are normalised on save, import and copy (`normalizeTag`): a standard topic in any spelling or a known
alias (`TOPIC_ALIASES`, e.g. "Quy hoạch động", "qhđ") becomes its id, and other tags are trimmed, lowercased and get
single spaces. At most 20 tags of at most 40 characters (400 `catalog.tag_too_long`). The frontend shows a topic id by
its vi/en name.

Sessions copy each problem's tags (`SessionProblemSummaryDto.tags`, also on `SessionProblemDto`). For students the list
is empty while a `TEST` or `EXAM` session is not closed, because a topic gives away the method; managers always get it.
A session freezes its topics when it is created, like its statements; "refresh from the bank" and a sync bring later
bank changes. Free tags keep their diacritics on purpose ("mạng" and "mảng" are different words), so a filter matches
them as written (after NFC), while standard topics match in any spelling.

Existing data is brought to this form by the migration `NormalizeTopics1794528060000`, which runs at startup before
the API accepts requests (OJ-5). It runs in the migrations' transaction with the rows it reads locked, and it:
- normalises every problem's tags, cutting tags from before the 40-character limit;
- gives sessions created before OJ-20 the tags of their bank problems, and the learning record's copies the same,
  without refreshing or rejudging anything.

