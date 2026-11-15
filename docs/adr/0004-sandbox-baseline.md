# ADR 0004: Sandbox baseline with an in-container supervisor

Date: 2026-11-07
Status: proposed (decision owner: Htet Oo Naing; needs a second human reviewer per CLAUDE.md security rule 5; implementation in `docs/specs/OJ-2-sandbox-supervisor.md`)

## Context

The old sandbox ran each step with `docker exec` as `--user 65534:65534`, measured time and memory with GNU `time` writing to a stats file in a host-mounted `/box`, and kept Docker's default capabilities. That gave two weaknesses:
- The submission could write the stats file, so it could forge its own measurements.
- `/box` was a world-writable host directory.

The CLAUDE.md floor named `--user 65534` as a required flag.

## Decision

The floor is now the following set, enforced by `docker-sandbox-flags.test.ts`:

- `docker run` flags:
  - `--network none`, `--cpus 1`, `--pids-limit 128`
  - `--memory` and `--memory-swap` set to the same cap
  - `--cap-drop ALL` plus only `SETUID`, `SETGID` and `KILL`
  - `--security-opt no-new-privileges`, `--read-only`, `--init`
  - `--tmpfs /box` (exec, nosuid, nodev, 48 MB) and `--tmpfs /tmp` (noexec, nosuid, nodev, 32 MB), each capped at 4096 inodes
  - `--cgroupns private`
  - `--ipc none` (no `/dev/shm`) and sysctls limiting System V and POSIX IPC to nothing (`kernel.shmmax`, `kernel.shmall`, `kernel.msgmni`, `kernel.sem`, `fs.mqueue.queues_max` = 0; `kernel.shm_rmid_forced=1`)
  - no host bind mount
- The container runs as root. Every compile and test runs through `oj-run` (root-owned, mode 0700, not setuid), which:
  - drops to 65534:65534 (`setgroups(0)`, `setresgid`, `setresuid`), then checks that `setuid(0)` fails;
  - sets `PR_SET_NO_NEW_PRIVS` and `PR_SET_DUMPABLE 0`;
  - clears the environment and closes inherited file descriptors;
  - applies `RLIMIT_CPU`, `RLIMIT_FSIZE` and `RLIMIT_CORE 0`;
  - kills the whole process group at the wall limit;
  - measures with `wait4` rusage and returns the result over the exec pipe, which the program cannot write.
- Memory cap: the compile cap while building (`max(compileMemoryMb, runCap)`), then `docker update` lowers it to `runCap = problem limit + I/O budget + scratch allowance` before the first test, where the scratch allowance is both tmpfs mounts in full plus 16 MB for `oj-run` (96 MB). A program that fills the scratch space therefore cannot get the supervisor killed (audit NF-1). If lowering fails, the job fails as IE (fail closed; OJ-2, finding C3).
- After the build and before the first test, the build output is sealed: every file in `/box` becomes root-owned and not writable by others (copied and replaced, since root has no CAP_CHOWN). In the sticky `/box` the program cannot delete or change it.
- After every test, `oj-run` kills the program's leftovers and removes everything the program left in `/box` and `/tmp`. The removal runs as the program's own user, in the same helper. If either step fails the run is reported like leftovers (flag 16) and the container is not used again. No memory, file or state outlives a test (audit F-1, F-4).
- The engine refuses to start unless the runner image label `oj.runner.version` matches (currently 5).

CLAUDE.md security rule 5 names this set instead of "user 65534" (updated with OJ-2, as CLAUDE.md workflow rule 6 asks).

## Consequences

- The security verifier confirmed live that the untrusted child has no capabilities and cannot signal root processes (`docs/security/audit-2026-11-07.md`).
- Docker no longer enforces the uid: any new exec path that skips `oj-run` would run as container root. Reviewers must check that every new `docker exec` goes through `supervise()`.
- `oj-run.c` is security-critical C. Changes to it need the security verifier and a second human reviewer, like the Dockerfile.
- CPU time is the larger of the program's `wait4` rusage and the container cgroup's `cpu.stat` usage during the run, so children the program never waits for still count (finding N4, fixed). Peak memory still comes from rusage; the memory cgroup cap bounds what un-waited children can add.
- If `oj-run` cannot kill the program's leftovers (no pid free to start its killer), it says so (flag 16) and the engine drops the container (finding C4, fixed).
