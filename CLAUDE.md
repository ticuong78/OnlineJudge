# CLAUDE.md: rules for working in OnlineJudge

Read this before touching code. The playbook behind these rules is `docs/ai-engineering-playbook.md`.

## What this is

A classroom online judge. pnpm monorepo, Node 24, TypeScript, ESM.

| Package | Path | Role |
|---|---|---|
| `@oj/contracts` | `src/shared` | DTOs, enums, judge queue messages. Shared by all packages. |
| `@oj/backend` | `src/backend` | NestJS REST API under `/api`, DDD bounded contexts, TypeORM on PostgreSQL, BullMQ on Redis |
| `@oj/engine` | `src/engine` | Judge worker: takes jobs from Redis, runs code in a Docker sandbox (`oj-runner` image) |
| `@oj/frontend` | `src/frontend` | Next.js app router, Vercel |

Documentation: `README.md` (Vietnamese, product behaviour), `docs/API.md` (every endpoint, roles, DTO names), `docs/specs/` (one spec per change), `docs/adr/` (decisions).

## Commands

```bash
pnpm install
pnpm build:shared          # build @oj/contracts first; backend and frontend typecheck depend on it
pnpm infra:up              # postgres + redis in Docker
pnpm runner:build          # sandbox image oj-runner:latest
pnpm dev:backend | pnpm dev:engine | pnpm dev:frontend
pnpm typecheck             # all packages
pnpm test                  # backend and engine: node --test under test/*.test.ts
pnpm --filter @oj/backend test -- --test-name-pattern "classroom"   # one area
```

Verification gate before any push: `pnpm build:shared && pnpm typecheck && pnpm test`. The pre-push hook runs it on changed packages; CI runs it on everything.

## Architecture rules

1. Bounded contexts live in `src/backend/src/modules/<context>` with four layers: `domain` (aggregates, value objects, repository abstract classes, domain services), `application` (services, facades, ports), `infrastructure` (TypeORM entities and repositories, mailers, Claude adapters), `presentation` (controllers, guards, DTO validation). Keep new code in the right layer; do not import infrastructure from domain.
2. Contexts: identity, classroom, catalog, importing, assessment, integrity, community, judging. Dependency direction: `integrity -> judging -> assessment -> catalog, classroom -> identity`; `community -> assessment, classroom`. Never add a dependency against this direction. Reactions in the other direction go through domain events (`<context>.events.ts`) and `@nestjs/event-emitter`.
3. A context talks to another only through that context's published facade (`application/<context>.facade.ts`) behind a local port (anti-corruption layer). No reaching into another context's repository or ORM entity.
4. Repositories are abstract classes in `domain/`; TypeORM implementations in `infrastructure/`. The domain never sees TypeORM.
5. Errors: throw `DomainError` subclasses from `shared/domain/domain-error.ts`; `ApiExceptionFilter` maps them to `ApiErrorBody`. Messages shown to users are Vietnamese; error `code` values are stable English identifiers.
6. Contracts first: any new request, response or enum goes into `src/shared/src/api.ts` or `enums.ts`, then `pnpm build:shared`, then backend and frontend use it. No duplicated DTO shapes in packages.
7. Judge jobs are self-contained (`judge-messages.ts`): the engine never reads the database. Keep it that way.
8. Frontend: `src/frontend/src/lib/api.ts` is the only HTTP client; pages under `app/(auth)`, `app/(main)`, `app/(print)`; shared UI in `components/`. Business rules stay in the backend; the frontend validates for usability only.

## Security rules (non-negotiable)

1. `AuthGuard` is global. Every controller route that mutates data or reads non-public data carries `@Roles(...)` with the narrowest role set; public routes carry `@Public()` explicitly (both in `shared/presentation/decorators.ts`), never by omission. Use `@CurrentActor()` to get the caller.
2. Ownership is checked in the application layer with the `Actor` (`shared/application/actor.ts`): teachers see their own bank and classes, students their own enrollments and submissions, admin everything. Every new query that lists or loads by id is scoped to the actor.
3. Validation: every request body is a DTO class with class-validator decorators; `ValidationPipe({ whitelist: true })` strips unknown fields, so new fields must be declared.
4. Passwords use the scrypt hasher in `identity/infrastructure/security.ts`; OTP and invitation codes are stored hashed with expiry and attempt limits. Do not introduce another hashing or token scheme.
5. The sandbox floor is `docs/adr/0004-sandbox-baseline.md`, enforced by `docker-sandbox-flags.test.ts`: `--network none`, CPU, memory and swap caps (lowered to the run cap before tests, failing closed), `--pids-limit`, `--cap-drop ALL` plus only SETUID/SETGID/KILL, `no-new-privileges`, `--read-only` with size- and inode-capped tmpfs `/box` and `/tmp`, `--ipc none` with System V and POSIX IPC limited to nothing, no host mount, the build output sealed root-owned before the first test, and every compile and run going through `oj-run` (drop to user 65534, CPU and file-size limits, wall-clock kill, output size limit, leftovers killed and the scratch space emptied after every test). Changes in `src/engine/src/infrastructure/docker-sandbox.ts`, `src/engine/runner/` (the Dockerfile and `oj-run.c`) or `local-sandbox.ts` require the security-verifier agent and a human reviewer. Every new `docker exec` must go through `oj-run`. `SANDBOX=local` is development only.
6. Never read, print or commit `.env` files or keys; `.env.example` is the only template. Never log tokens, OTP codes, passwords or full student emails.
7. Uploaded documents (docx, pdf), pasted text and submitted code are untrusted input: size limits, filtering (`shared/domain/external-links.ts`) and schema validation of AI output stay in place.

## AI feature rules (Claude calls in the product)

1. Adapters live in `*/infrastructure/claude-*.ts` and use `shared/infrastructure/claude.ts`; the model per task comes from `.env` (`CLAUDE_MODEL`, `CLAUDE_TESTGEN_MODEL`, `CLAUDE_REVIEW_MODEL`). No hard-coded model names elsewhere.
2. Prompts are versioned constants next to the adapter; user content is placed in clearly delimited sections and never concatenated into instructions.
3. Parse every response with a zod schema; on failure use the rule-based fallback (`ExamParser`) or raise a `DomainError`. Never write unvalidated model output to the database.
4. AI features are gated (`ai.vip_required`) and must work without a key (feature off, not crash).
5. Add or update fixtures in `src/backend/test/` when prompts or parsing rules change; run `exam-parser.test.ts`, `test-suggestions.test.ts` and `external-links.test.ts` before and after.

## Coding conventions

1. TypeScript strict, ESM imports with `.js` suffix inside the backend and engine (`import { X } from './x.js'`).
2. Names: aggregates and value objects in `domain/` are nouns (`Classroom`, `Enrollment`); services end with `Service`, facades with `Facade`, ORM entities with `OrmEntity` in `*.orm-entity.ts`.
3. Small functions, explicit types at module boundaries, no `any` in domain or application code.
4. Tests: `node --test` files under `src/<package>/test/*.test.ts`, named by area (`classroom.test.ts`). Test invariants directly on the aggregates (as the existing tests do) and use cases through the application services with in-memory repositories; reserve TypeORM for the few integration tests. A bug fix adds a failing-then-passing test.
5. Comments explain why, not what. Keep Vietnamese for user-facing strings and English for code, comments and docs.
6. Keep `docs/API.md` in sync with controllers: method, path, role, request and response DTO names.

## Workflow rules for the assistant

1. Start from a spec in `docs/specs/`. If there is none, write one with `/spec` and get it approved before editing code.
2. Present a plan (files per context, contract changes, tests) before the first edit on anything larger than a one-file fix.
3. Work on a branch `feat/<spec-id>-<slug>` or `fix/<spec-id>-<slug>`; commit with Conventional Commits (`feat(scope): subject`), scope = package or context.
4. Run the verification gate before saying a task is done. Report what was run and what the result was; do not claim tests passed without running them.
5. Do not run `git push --force`, do not rewrite history on `main`, do not delete branches, do not change CI or hooks without saying so in the PR.
6. When unsure about a rule here, ask rather than guess. When a rule is wrong, propose a change to this file in the same PR.

## Done means

The spec's "done when" list holds, `pnpm build:shared && pnpm typecheck && pnpm test` pass, docs are updated, the PR template is filled in, and `/review` found nothing blocking.
