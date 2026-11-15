# OJ-2: Sandbox supervisor (oj-run) and container hardening

Status: approved 2026-11-07 by Htet Oo Naing (retroactive; still needs a second human reviewer before the PR)
Owner: Htet Oo Naing
Risky area: yes (engine sandbox, runner Dockerfile; CLAUDE.md security rule 5)

## Outcome

Untrusted code runs in a read-only container with no host mount and all capabilities dropped except three. A small C supervisor (`oj-run`) drops to user 65534 and measures each test exactly, replacing GNU time and a shared stats file that a submission could forge. This covers week 0, item 5 (read-only root, cap-drop, capped compile output).

## Scope

In:
- `src/engine/runner/oj-run.c` and `runner/Dockerfile` (oj-run build, `oj.runner.version` label, `time` removed).
- `docker-sandbox.ts` and `docker-cli.ts`, plus the labels, sweeper, self-check, deadline, shutdown and supervisor-protocol modules.
- `domain/resource-plan.ts`, `signals.ts`, `verdict.ts`, `sandbox.ts`, `local-sandbox.ts`, `process.ts`, `config.ts`, `main.ts`.

Out: gVisor or other runtimes, and per-user concurrency limits in the engine.

## Done when

- [x] Sandbox ADR written (`docs/adr/0004-sandbox-baseline.md`). It records the new floor and replaces the old "`--user 65534`" line in CLAUDE.md security rule 5 with: root in the container with only SETUID, SETGID and KILL; privilege drop to 65534 in oj-run; `no-new-privileges` both inside and outside; `--read-only` with tmpfs `/box` and `/tmp`. It also records the memory cap formula. Done; updated 2026-11-07 for C4 and N4.
- [x] Review finding B3 fixed: a failed `docker update` lowering the memory cap ends the job as IE and disposes the container (fail closed), with tests using a fake `DockerCli` (`docker-sandbox-flags.test.ts`: refused, timed out, docker unavailable, abort; failed before the fix, passes after).
- [x] Review finding S4 / audit C4 fixed: `kill_leftovers` failure is reported, and the container is disposed. A regression test covers the live repro: a setsid fork bomb exhausting pids. Done 2026-11-07: `kill_leftovers` returns failure when no helper could be forked or the helper could not drop privileges or kill, and `oj-run` then sets flag 16. Live test in `docker-sandbox.test.ts` (a detached fork bomb filling every pid slot: either reported, or the container is left clean and usable). The exact all-forks-fail branch could not be forced live.
- [x] Audit N3: students see a generic Vietnamese IE message; the Docker stderr goes only to the engine log. Done: `SYSTEM_ERROR_MESSAGE`; the error is logged by the engine (`deadline.test.ts`).
- [x] Audit N4 (CPU and memory of un-waited children) measured, then fixed (e.g. cgroup `cpu.stat` / `memory.peak`) or accepted in ADR 0004. Done: measured live (2.5 s of CPU in an un-waited child was reported as 14 ms and the run passed a 1 s limit). Reported CPU is now the larger of rusage and the container cgroup's `cpu.stat` delta, so it is TLE (`docker-sandbox.test.ts`). Peak memory stays rusage-based; the cgroup cap bounds the rest. Accepted: N5 (a program that SIGKILLs itself is MLE rather than RE; both are failures, it is rare, and there is no security impact).
- [x] security-verifier confirms the flag list is at least as strong as the old floor. Recorded in `docs/security/audit-2026-11-07.md`.
- [x] CLAUDE.md security rule 5 updated to the floor in ADR 0004, in the same PR. Done.
- [x] Live Docker tests pass (`docker-sandbox.test.ts`, the fork bomb, forgery and escape cases) after `pnpm runner:build`. Done 2026-11-07 after rebuilding the image: engine 149/149, nothing skipped.
- [x] security-verifier run on these fixes (2026-11-07): C4 and N4 fixed (with caveats), N3 partly. It found NEW-1 (Medium) and several Lows, all fixed the same day:
  - NEW-1 (Medium): a program that leaves processes behind that cannot be stopped gets a counted verdict on that test (RE, or TLE if its CPU went over), not a free system error. Without this it could probe hidden tests without spending attempts. Judging stops after that test (`leftovers.test.ts`, `classify.test.ts`, `docker-sandbox-flags.test.ts`, and the live C4 test).
  - N3 rest: the supervisor's "cannot start" text is replaced by a fixed Vietnamese message, and a compiler that cannot start is a system error, not a counted compile error.
  - N4-a: `--cgroupns private` is part of the floor (flags test), and `oj-run` trusts `cpu.stat` only when `/proc/self/cgroup` is `0::/`.
  - C4 hardening: the clean-up helper closes the reply pipe and every inherited fd before dropping privileges.
  - NEW-2: runner image version bumped to 3 (Dockerfile, `RUNNER_IMAGE_VERSION`, self-check tests including "2 is out of date"). The image was rebuilt.

  Live after the rebuild: engine 154/154. Not re-verified by the security-verifier after these last fixes.
- [x] Re-verified on 2026-11-07: N3, N4-a, the C4 helper and NEW-2 are fixed; NEW-1 is partly fixed. Htet chose "fixes + IE policy", and these were fixed the same day:
  - NF-1 (Medium, reproduced live first: `docker exec exit 137`): the run cap now reserves both tmpfs mounts in full plus 16 MB for `oj-run` (`SCRATCH_ALLOWANCE_MB`, derived; `/box` 48 MB, `/tmp` 32 MB). There is a test of that invariant and a live regression test with the verifier's probe; the disk-fill test was updated to the new guarantee.
  - NF-2: with leftovers alive `oj-run` sends no captured output, and a short read is padded rather than cutting the reply. This is defensive; the race was never reproduced.
  - NF-3: the reap grace is 2 s, and a test reads it from `oj-run.c` and ties it to the engine's docker overhead.
  - NF-5: a Java public class name too long for a file name falls back to `Main.java`, so javac reports a compile error (`language.test.ts`).
  - IE backstop (backend, OJ-3): engine system errors count as attempts from the third per student and problem within 24 hours; the backend's own failures never count.
  - Runner version bumped to 4, because `oj-run.c` changed after v3 was built; the image was rebuilt.

  Accepted: NF-7 (a run-time start failure the system caused is charged as RE; a deliberate fail-safe). Gate: backend 188/188, engine 158/158 with live Docker. Not re-verified after this round.
- [x] Re-verified 2026-11-07: NF-2, NF-3, NF-5 and v4 fixed; NF-1 partly. F-1, F-2 and F-4 were approved (Htet: "all three") and fixed the same day:
  - F-1: `--ipc none` plus IPC sysctls set to nothing, and `nr_inodes=4096` on both tmpfs mounts (flags test).
  - F-1 and F-4:
    - The build output is sealed before the first test. It is copied to root-owned files and replaced, since root has no CAP_CHOWN under the floor.
    - After every test the kill helper, running as the program's user, removes everything the program left in `/box` and `/tmp`; a failure is reported as flag 16.
    - Python's syntax check writes its bytecode to `/tmp` so `/box` can be sealed.
    - Live tests: `/dev/shm`, SysV and inode probes never give IE; deleting `/box/main` and carrying state across tests no longer work. The failing side of the probes was reproduced by the verifier on v4.
  - F-2 (engine side): `cleanText` strips NUL and lone surrogates from every program-controlled text (`leftovers.test.ts`).
  - F-3 (engine side): every IE is tagged `infrastructure` (before the first test started) or `program` (`leftovers.test.ts`).
  - Runner version 5; image rebuilt.

  The remaining MLE gap: data a program holds in tmpfs during one test is not in `ru_maxrss` (Low; it is emptied after the test). Gate: backend 191/191, engine 166/166 with live Docker. `sweeper.test.ts` (pre-existing, untouched) failed once under load and passed 5 of 5 alone: a timing flake to watch. Not re-verified after this round.
- [ ] Second human reviewer signs off.
- [x] `pnpm build:shared && pnpm typecheck && pnpm test` pass. (2026-11-07, latest: backend 185/185, engine 154/154 with live Docker.)

## Contexts and contracts

Engine only. The judge job message is unchanged and the engine still never reads the database.

## Security

The container now runs as root with three capabilities, so every path to untrusted code must go through oj-run. That is the property the verifier checks.

## Tests

`docker-sandbox.test.ts`, `docker-sandbox-flags.test.ts`, `supervisor-protocol.test.ts`, `resource-plan.test.ts`, `classify.test.ts`, `deadline.test.ts`, `shutdown.test.ts`, `sweeper.test.ts`, `self-check.test.ts`, `process.test.ts`.

## Rollout and risks

Deploy order: build and push the runner image with label version 2 first, then the engine, which refuses to start against an old image. Rollback is both together. Watch for unexpected MLE verdicts (review nit N5) and IE rates after deploy.
