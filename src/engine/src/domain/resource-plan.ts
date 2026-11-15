import type { JudgeJob, JudgeJobTestCase } from '@oj/contracts';

export const MIB = 1024 * 1024;

/** Compiler diagnostics and intermediate files: bounded by the tmpfs size anyway, this just stops one runaway file. */
export const BUILD_FSIZE_BYTES = 32 * MIB;

/**
 * Size caps of the two tmpfs mounts; whatever a program writes there is charged to the container's memory and stays
 * after it ends. `/box` holds the source and the binary (at most BUILD_FSIZE_BYTES) plus the program's own files.
 */
export const BOX_TMPFS_MB = 48;
export const TMP_TMPFS_MB = 32;
/** Files per tmpfs mount: every file costs kernel memory outside the size cap, so their number is capped too. */
export const TMPFS_INODES = 4096;

/** Memory the supervisor (`oj-run`) needs after the program ended: its memfds, the clean-up helper, the reply. */
export const SUPERVISOR_HEADROOM_MB = 16;

/**
 * Memory-backed scratch space the run cap reserves on top of the program's own budget: both tmpfs mounts full, plus
 * the supervisor's headroom. Anything less lets a program fill them and get the supervisor itself killed, which reads
 * as a (free) system error instead of the program's result (audit NF-1).
 */
export const SCRATCH_ALLOWANCE_MB = BOX_TMPFS_MB + TMP_TMPFS_MB + SUPERVISOR_HEADROOM_MB;

/** Fixed costs around every `docker` call that are not the program's fault. */
export const DOCKER_START_MS = 60_000;
export const DOCKER_CALL_OVERHEAD_MS = 5_000;
export const SOURCE_WRITE_MS = 20_000;
export const MEMORY_UPDATE_MS = 15_000;
export const BUILD_TIMEOUT_MS = 30_000;
export const DEADLINE_MARGIN_MS = 30_000;

/**
 * Wall-clock limit for one run. TLE is decided on CPU time (the kernel enforces it); the wall limit only catches
 * programs that sleep or block. Three times the CPU limit plus a second, in whole seconds.
 */
export function wallLimitMs(timeLimitMs: number): number {
  return (Math.ceil((timeLimitMs * 3) / 1000) + 1) * 1000;
}

/**
 * How much a program may print before it is cut off. Output much longer than the expected answer cannot be the
 * answer, so the cap follows the size of the expected output (with room for a trailing newline style mismatch and
 * for chatty stderr), clamped to 4..64 MiB.
 */
export function maxOutputBytes(expectedOutput: string): number {
  const wanted = 2 * Buffer.byteLength(expectedOutput) + MIB;
  return Math.min(64 * MIB, Math.max(4 * MIB, wanted));
}

/** Largest amount of memory-backed capture a single run of this job can need: its input plus stdout plus stderr. */
export function ioBudgetBytes(testCases: Pick<JudgeJobTestCase, 'input' | 'expectedOutput'>[]): number {
  let worst = 0;
  for (const t of testCases) {
    worst = Math.max(worst, Buffer.byteLength(t.input) + 2 * maxOutputBytes(t.expectedOutput));
  }
  return worst;
}

/**
 * Memory cap of the container while tests run:
 *
 *   program budget (problem limit + language baseline)
 * + capture buffers (largest input + stdout cap + stderr cap; memfd pages count against the cgroup)
 * + scratch allowance for /box and /tmp (tmpfs pages count against the cgroup too)
 *
 * The problem's own limit is still enforced exactly: the sandbox compares the program's peak RSS with it.
 */
export function runMemoryCapMb(programMb: number, ioBytes: number): number {
  return programMb + Math.ceil(ioBytes / MIB) + SCRATCH_ALLOWANCE_MB;
}

/**
 * Hard deadline for judging one job, from the moment the engine takes it: start the container, write the source,
 * build, lower the memory cap, then every test at its own wall limit plus the cost of a `docker exec`, and a margin.
 * A hung Docker daemon must not be able to hold an engine worker longer than this.
 */
export function jobDeadlineMs(job: Pick<JudgeJob, 'timeLimitMs' | 'testCases'>, hasBuildStep: boolean): number {
  const perTest = wallLimitMs(job.timeLimitMs) + DOCKER_CALL_OVERHEAD_MS;
  const build = hasBuildStep ? BUILD_TIMEOUT_MS + DOCKER_CALL_OVERHEAD_MS + MEMORY_UPDATE_MS : 0;
  return DOCKER_START_MS + SOURCE_WRITE_MS + build + job.testCases.length * perTest + DEADLINE_MARGIN_MS;
}
