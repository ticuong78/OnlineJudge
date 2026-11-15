import { randomUUID } from 'node:crypto';
import {
  OperationAborted,
  type ExecResult,
  type RunLimits,
  type RunResult,
  type Sandbox,
  type SandboxOptions,
  type SandboxSession,
} from '../domain/sandbox';
import {
  BOX_TMPFS_MB,
  BUILD_FSIZE_BYTES,
  DOCKER_CALL_OVERHEAD_MS,
  DOCKER_START_MS,
  MEMORY_UPDATE_MS,
  SOURCE_WRITE_MS,
  TMP_TMPFS_MB,
  TMPFS_INODES,
  runMemoryCapMb,
  wallLimitMs,
} from '../domain/resource-plan';
import { ProcessDockerCli, type DockerCli } from './docker-cli';
import { CONTAINER_GRACE_MS, DEADLINE_LABEL, SANDBOX_LABEL } from './sandbox-labels';
import {
  parseSupervisorReply,
  supervisorArgs,
  SupervisorFlags,
  type SupervisorLimits,
  type SupervisorReply,
} from './supervisor-protocol';

export interface DockerSandboxConfig {
  image: string;
  /** Memory cap while the build step runs (g++ on `bits/stdc++.h` needs ~250 MB); lowered before the tests. */
  compileMemoryMb: number;
}

/** The harness side of the sandbox is root inside the container, whatever user an image declares: `oj-run` drops privileges itself. */
const AS_ROOT = ['-u', '0:0'];

/**
 * Makes everything in /box root-owned and not writable by others. Root here has no CAP_CHOWN (the floor), so each file
 * the compiler made is copied to a root-owned copy that replaces it: root owns the sticky /box, so it may replace those
 * entries, and build output is readable to it. Anything that is not a plain file (a directory, a link) is refused.
 */
const SEAL_SCRIPT = [
  'cd /box || exit 1',
  'for f in * .[!.]*; do',
  '  [ -e "$f" ] || [ -L "$f" ] || continue',
  '  if [ ! -O "$f" ]; then',
  '    if [ -L "$f" ] || [ ! -f "$f" ]; then echo "not a plain file: $f" >&2; exit 1; fi',
  '    cp --preserve=mode -- "$f" .oj-seal && mv -f -- .oj-seal "$f" || exit 1',
  '  fi',
  '  chmod go-w -- "$f" || exit 1',
  'done',
].join('\n');

/** Names are used in a path and as a shell positional parameter: keep them boring. */
const FILE_NAME = /^[A-Za-z0-9_$][A-Za-z0-9_$.-]{0,127}$/;

/**
 * Production sandbox. One throw-away container per submission:
 *
 *  - no network, 1 CPU, 128 pids, all capabilities dropped except the three `oj-run` needs (SETUID, SETGID, KILL),
 *    no-new-privileges, read-only root file system, `--init` so killed process trees are reaped;
 *  - NO bind mounts. `/box` (workspace) and `/tmp` are size-capped tmpfs mounts, so a program cannot touch the
 *    host's disk and cannot fill more than the tmpfs sizes; the test input goes in through `docker exec`'s stdin and
 *    the captured output comes back through its stdout;
 *  - every untrusted process (compiler and program) is started by `oj-run`, which runs as root inside the container
 *    but drops to an unprivileged user, enforces CPU/size limits and does all the measuring (so a program cannot
 *    forge its own CPU time or memory: it shares no file with the harness);
 *  - memory: the container starts with a generous build budget and is lowered to the run cap before the first test
 *    (`docker update`), see `runMemoryCapMb`;
 *  - the container removes itself at its deadline (+ grace) even if the engine dies, and carries labels for the
 *    sweeper.
 */
export class DockerSandbox implements Sandbox {
  constructor(
    private readonly config: DockerSandboxConfig,
    private readonly docker: DockerCli = new ProcessDockerCli(),
    private readonly now: () => number = Date.now,
  ) {}

  async open(options: SandboxOptions): Promise<SandboxSession> {
    for (const file of options.files) {
      if (!FILE_NAME.test(file.name)) throw new Error(`Unsafe file name for the sandbox: ${JSON.stringify(file.name)}`);
    }
    const runCapMb = runMemoryCapMb(options.memoryLimitMb, options.ioBudgetBytes);
    const createCapMb = options.hasBuildStep ? Math.max(this.config.compileMemoryMb, runCapMb) : runCapMb;
    const name = `oj-${randomUUID().slice(0, 12)}`;
    const lifetimeSeconds = Math.max(60, Math.ceil((options.deadlineAt + CONTAINER_GRACE_MS - this.now()) / 1000));

    const started = await this.docker.run(
      [
        'run', '-d', '--rm', '--init', '--name', name,
        '--network', 'none',
        // No /dev/shm and no System V or POSIX IPC: memory held there would outlive a test outside the scratch
        // allowance and could get the supervisor killed on the next one (audit F-1).
        '--ipc', 'none',
        '--sysctl', 'kernel.shmmax=0', '--sysctl', 'kernel.shmall=0', '--sysctl', 'kernel.shm_rmid_forced=1',
        '--sysctl', 'kernel.msgmni=0', '--sysctl', 'kernel.sem=0 0 0 0', '--sysctl', 'fs.mqueue.queues_max=0',
        // oj-run reads this container's cgroup (cpu.stat) to measure CPU; with the host's cgroup namespace it would see the host's.
        '--cgroupns', 'private',
        '--cpus', '1',
        '--memory', `${createCapMb}m`, '--memory-swap', `${createCapMb}m`,
        '--pids-limit', '128',
        '--cap-drop', 'ALL', '--cap-add', 'SETUID', '--cap-add', 'SETGID', '--cap-add', 'KILL',
        '--security-opt', 'no-new-privileges',
        '--read-only',
        '--tmpfs', `/box:rw,exec,nosuid,nodev,size=${BOX_TMPFS_MB}m,nr_inodes=${TMPFS_INODES},mode=1777`,
        '--tmpfs', `/tmp:rw,noexec,nosuid,nodev,size=${TMP_TMPFS_MB}m,nr_inodes=${TMPFS_INODES},mode=1777`,
        '--label', `${SANDBOX_LABEL}=1`,
        '--label', `${DEADLINE_LABEL}=${Math.round(options.deadlineAt)}`,
        '-w', '/box',
        this.config.image,
        'sleep', String(lifetimeSeconds),
      ],
      { timeoutMs: DOCKER_START_MS, signal: options.signal },
    ).catch(async (error) => {
      await this.remove(name); // an aborted or failed start may have left a half-created container
      throw error;
    });
    if (started.timedOut || started.exitCode !== 0) {
      await this.remove(name);
      throw new Error(`Cannot start sandbox container: ${started.timedOut ? 'docker did not answer in time' : started.stderr.trim()}`);
    }

    const session = new DockerSession(this.docker, name, { runCapMb, createCapMb }, options.signal);
    try {
      for (const file of options.files) await session.putFile(file.name, file.content);
    } catch (error) {
      await session.dispose();
      throw error;
    }
    return session;
  }

  private async remove(name: string): Promise<void> {
    await this.docker.run(['rm', '-f', name], { timeoutMs: 30_000 }).catch(() => undefined);
  }
}

class DockerSession implements SandboxSession {
  private memoryLowered: boolean;
  private sealed = false;
  private disposed = false;

  constructor(
    private readonly docker: DockerCli,
    private readonly name: string,
    private readonly plan: { runCapMb: number; createCapMb: number },
    private readonly signal: AbortSignal | undefined,
  ) {
    this.memoryLowered = plan.createCapMb <= plan.runCapMb;
  }

  /** Source files are written by root; the program (another user) can read but not change them. */
  async putFile(fileName: string, content: string): Promise<void> {
    const r = await this.docker.run(
      ['exec', '-i', ...AS_ROOT, this.name, 'sh', '-c', 'chmod 1777 /box && cat > "/box/$1"', '_', fileName],
      { input: content, timeoutMs: SOURCE_WRITE_MS, signal: this.signal },
    );
    if (r.timedOut || r.exitCode !== 0) {
      throw new Error(`Cannot write ${fileName} into the sandbox: ${r.timedOut ? 'timed out' : r.stderr.trim()}`);
    }
  }

  async exec(argv: string[], timeoutMs: number): Promise<ExecResult> {
    const reply = await this.supervise(argv, Buffer.alloc(0), {
      cpuMs: timeoutMs,
      wallMs: timeoutMs,
      fsizeBytes: BUILD_FSIZE_BYTES,
      maxInputBytes: 0,
    });
    // The compiler is not the student's code: processes it left that cannot be stopped are a sandbox failure.
    if (reply.flags & SupervisorFlags.UNREAPED) throw new Error('A process inside the sandbox could not be stopped');
    return {
      exitCode: exitCodeOf(reply),
      stdout: reply.stdout.toString('utf8'),
      stderr: reply.stderr.toString('utf8'),
      timedOut: (reply.flags & (SupervisorFlags.WALL_TIMEOUT | SupervisorFlags.CPU_KILL)) !== 0,
      startFailed: (reply.flags & SupervisorFlags.START_FAILED) !== 0,
    };
  }

  async run(argv: string[], input: string, limits: RunLimits): Promise<RunResult> {
    await this.sealOnce();
    await this.lowerMemoryOnce();
    const data = Buffer.from(input, 'utf8');
    const reply = await this.supervise(argv, data, {
      cpuMs: limits.timeLimitMs,
      wallMs: wallLimitMs(limits.timeLimitMs),
      fsizeBytes: limits.maxOutputBytes,
      maxInputBytes: data.length,
      cleanScratch: true,
    });
    return {
      exitCode: exitCodeOf(reply),
      signal: reply.signal,
      stdout: reply.stdout.toString('utf8'),
      stderr: reply.stderr.toString('utf8'),
      timeMs: reply.cpuMs,
      memoryKb: reply.rssKb,
      timedOut: (reply.flags & SupervisorFlags.WALL_TIMEOUT) !== 0,
      cpuLimitKill: (reply.flags & SupervisorFlags.CPU_KILL) !== 0,
      outputLimit: (reply.flags & SupervisorFlags.OUTPUT_LIMIT) !== 0,
      startFailed: (reply.flags & SupervisorFlags.START_FAILED) !== 0,
      // Reported as the program's result (it caused it), not thrown as a system error: a free IE would let a submission
      // probe hidden tests without spending attempts (audit NEW-1).
      leftovers: (reply.flags & SupervisorFlags.UNREAPED) !== 0,
    };
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    await this.docker.run(['rm', '-f', this.name], { timeoutMs: 30_000 }).catch(() => undefined);
  }

  /** Runs one program through `oj-run` and returns its measured reply. Throws when the sandbox itself fails. */
  private async supervise(argv: string[], input: Buffer, limits: SupervisorLimits): Promise<SupervisorReply> {
    const result = await this.docker.run(
      ['exec', '-i', ...AS_ROOT, this.name, 'oj-run', ...supervisorArgs(limits), ...argv],
      {
        input,
        timeoutMs: limits.wallMs + DOCKER_CALL_OVERHEAD_MS,
        signal: this.signal,
        binary: true,
        maxCaptureBytes: 2 * limits.fsizeBytes + 65_536,
      },
    );
    if (result.timedOut) {
      throw new Error(`The sandbox supervisor did not answer within ${limits.wallMs + DOCKER_CALL_OVERHEAD_MS} ms`);
    }
    if (result.stdoutBuffer.length === 0) {
      const why = result.stderrBuffer.toString('utf8').trim().slice(0, 500);
      throw new Error(`The sandbox supervisor failed (docker exec exit ${result.exitCode})${why ? `: ${why}` : ''}`);
    }
    return parseSupervisorReply(result.stdoutBuffer);
  }

  /**
   * Before the first test: the sources and the build output become root-owned and read-only for others. In the sticky
   * /box the program can then neither delete nor change them, and the clean-up after each test (which removes what the
   * program owns) leaves them alone (audit F-1, F-4). If this fails no test may run.
   */
  private async sealOnce(): Promise<void> {
    if (this.sealed) return;
    const r = await this.docker.run(
      ['exec', ...AS_ROOT, this.name, 'sh', '-c', SEAL_SCRIPT],
      { timeoutMs: SOURCE_WRITE_MS, signal: this.signal },
    );
    if (r.timedOut || r.exitCode !== 0) {
      throw new Error(`Cannot seal the build output: ${r.timedOut ? 'docker did not answer in time' : r.stderr.trim()}`);
    }
    this.sealed = true;
  }

  /**
   * The container was created with the (larger) build budget. Before the first test it is lowered to the run cap so a
   * runaway program is killed by the cgroup. If that fails no test may run: untrusted code under the build budget
   * would breach the memory floor (ADR 0004), so the job ends as a system error and the container is disposed.
   */
  private async lowerMemoryOnce(): Promise<void> {
    if (this.memoryLowered) return;
    const mb = this.plan.runCapMb;
    const r = await this.docker.run(['update', '--memory', `${mb}m`, '--memory-swap', `${mb}m`, this.name], {
      timeoutMs: MEMORY_UPDATE_MS,
      signal: this.signal,
    }).catch((error: unknown) => {
      if (error instanceof OperationAborted) throw error;
      throw new Error(`Cannot lower the memory cap of ${this.name} to ${mb}MB: ${(error as Error).message}`);
    });
    if (r.timedOut || r.exitCode !== 0) {
      throw new Error(`Cannot lower the memory cap of ${this.name} to ${mb}MB: ${r.timedOut ? 'docker did not answer in time' : r.stderr.trim()}`);
    }
    this.memoryLowered = true;
  }
}

/** Shell convention: a program killed by signal N "exits" with 128 + N. */
function exitCodeOf(reply: SupervisorReply): number {
  return reply.signal ? 128 + reply.signal : Math.max(reply.exitStatus, 0);
}
