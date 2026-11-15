# OJ-24: Learning paths (roadmaps)

Status: done (approved by the user 2026-11-13: "Make everything you can now", after the plan that described learning paths)
Owner: Htet Oo Naing
Risky area: yes. New owner-scoped data, and the visibility of sessions and topics.

## Outcome

A colleague asked for a roadmap: a set of linked problems per topic, moving from easy to harder, so students see how the
problems change from step to step and know whether they are progressing. Without it, they jump between unrelated DP
problems.

A **learning path** is a teacher's ordered list of **steps**. Each step is one open **public practice or homework
session**, whose problems are already ordered, plus a teacher's note on what is new in that step.
- Students see the path, the notes, their progress per step, and a "continue" button that opens the next unsolved
  problem.
- Nothing is locked: a strong student may skip ahead.
- A **mixed review step** is a session with the new session setting "hide topics". Its problems carry no topic labels
  for students while it runs, so recognising the technique is part of the exercise. This is the same reason tests and
  exams hide topics (OJ-20).

## Scope

In:
- **Session setting `hideTopics`:**
  - `SessionSettingsDto.hideTopics`, a checkbox in the session settings;
  - `Session.topicsVisibleTo` hides topics for students while such a session runs.
- **Assessment context:**
  - **The `LearningPath` aggregate:**
    - title (1–200), description (≤ 5,000, Markdown);
    - an optional topic, normalised like a tag;
    - public or private;
    - 1–30 steps of `{ sessionId, title (1–200), note (≤ 2,000) }`, each session appearing once.
  - **Invariant:** every step's session is public (no class) and of type PRACTICE or HOMEWORK. This is checked when
    saving, so a path can never expose a class session.
  - **`LearningPathRepository`** (abstract) with a TypeORM implementation; a `learning_paths` table with the steps as
    JSON.
  - **`LearningPathService`:**
    - create, update and delete (the owner or an admin);
    - list (`public`, or the caller's own as `mine`);
    - get with the caller's progress per step, and the next unsolved problem.
- **Routes:**
  - `GET /paths?scope=public|mine` and `GET /paths/:id` (all roles; private paths are for their owner and admins);
  - `POST /paths`, `PUT /paths/:id` and `DELETE /paths/:id` (ADMIN, TEACHER; the owner or an admin).
- **Contracts:** `LearningPathSummaryDto`, `LearningPathDto`, `PathStepDto`, `UpsertLearningPathRequest`.
- **Frontend:**
  - The Luyện tập (practice) page gets a "Lộ trình" (learning paths) section with path cards, the topic, the number of
    steps and the student's progress.
  - The path page `/paths/[id]`: steps with notes, progress bars, problems linking to the solve page, a "review" badge
    and the continue button.
  - For teachers: their paths, and an editor at `/paths/new` and `/paths/[id]/edit`.
    - The editor holds title, description, topic and public.
    - Steps are picked from the open public practice and homework sessions, with a per-step title and note, and can be
      moved up, moved down or removed.
- **Docs:** `docs/API.md` and README.

Out:
- Paths for one class (public only for now).
- Hard locks or prerequisites.
- Certificates.
- AI-generated paths (could use the topic tags later).

## Done when

- [x] A teacher builds a path from public practice sessions. A class or test session is refused (`assessment.path_step_not_public`).
- [x] A student sees public paths with their own progress, the next problem, and step notes. A private path is 404 for
      others.
- [x] A review step (`hideTopics`) shows no topics to students on the path, the session or the problem page while open.
- [x] Only the owner or an admin can edit or delete a path.
- [x] Tests:
  - the aggregate rules;
  - the service (visibility, progress, next problem, step validation);
  - `hideTopics`;
  - the routes' roles;
  - a Postgres round trip.
- [x] `docs/API.md` is updated, and `pnpm build:shared && pnpm typecheck && pnpm test` passes.

## Security

- **Roles** on every route. Private paths are visible to their owner and admins only (404 for others). Edits are for
  the owner or an admin.
- **Steps reference only public sessions,** checked on every save. Progress is the caller's own (learning record).
- **No test data:** a path shows problem titles, keys and topics (hidden for review steps).

## Results and notes (2026-11-13, test system)

- **Live:**
  - Two public practice sessions were created, and a third was set to "hide topics". A three-step path was built from
    them; the topic "Xâu" (strings) was stored as `strings`.
  - A class session as a step was refused.
  - **Student:**
    - The practice page shows the path card with progress.
    - The path page shows the step notes, progress per step, and "Làm tiếp: Đảo ngược chuỗi" (continue with the next
      problem).
    - The review step shows its badge and no topics, also on the session page.
  - **Access:**
    - Another teacher cannot edit or delete the path (`assessment.not_path_owner`).
    - A private path is 404 for students and not listed.
    - Students cannot create paths (403).
  - **Teacher:** the editor loads the path, saves it, and moving a step down keeps the new order.
- **Found and fixed during the check:**
  - **Practice by topic** listed the review session and counted its topic: "Xâu (chuỗi) (2)" gave the hidden topic
    away. Review sessions are now left out of it; checked live, the count is 1.
  - **The học bạ topic tally** counted a running review session's topics. It now hides them, like a running test.
  - The security-verifier reported the same two independently (its B1 and S1). Both have tests.
- **Security-verifier (OJ-22/23/24), further items fixed:**
  - **S2:** a path re-checks on reading that each step's session is still a public practice session.
  - **N1:** `assessment.path_step_missing` for a deleted session.
  - **N2:** the topic is cut to the tag limit after normalising.
  - **N3:** at least one step is required in the request.
  - **N5:** a photo import while Redis is down answers `import.ai_busy`, not a 500.
  - **N6:**
    - titles lose inline Markdown;
    - AI notes lose links;
    - the section writer's prompt now puts the teacher's content in a `<de_bai>` block that it cannot close (prompt v3;
      this was a gap from before against CLAUDE.md AI rule 2).
  - **N7:** path descriptions and step notes are saved without external links.
- **Kept:** the public path list has no paging (N4). It is fine at classroom scale; add paging when there are hundreds
  of paths.

