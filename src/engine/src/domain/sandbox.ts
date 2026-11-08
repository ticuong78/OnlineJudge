/** Port: an isolated workspace in which untrusted code is compiled and executed. */
export interface Sandbox {
  open(options: SandboxOptions): Promise<SandboxSession>;
}

export interface SandboxOptions {
  files: { name: string; content: string }[];
  /** What the program itself may use: the problem's memory limit plus the language runtime's baseline. */
  memoryLimitMb: number;
  /** A build step (`exec`) runs before the tests and needs a larger, temporary memory budget than the program. */
  hasBuildStep: boolean;
  /**
   * Worst case, in bytes, that the sandbox keeps in memory-backed files during one run: the largest input plus the
   * capture buffers for stdout and stderr. These are charged to the same memory budget as the program.
   */
  ioBudgetBytes: number;
  /** Epoch ms after which nothing of this sandbox may still exist; a janitor removes leftovers past this point. */
  deadlineAt: number;
  /** Aborting kills every process the sandbox is waiting for; pending calls reject with `OperationAborted`. */
  signal?: AbortSignal;
}

export interface SandboxSession {
  /** Runs a build command (compiler); no stdin, generous time. */
  exec(argv: string[], timeoutMs: number): Promise<ExecResult>;
  /** Runs the program once against `input`. */
  run(argv: string[], input: string, limits: RunLimits): Promise<RunResult>;
  /** Best effort and idempotent: never throws. */
  dispose(): Promise<void>;
}

export interface ExecResult {
  /** Exit status; 128 + N when killed by signal N (shell convention). */
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  /** The command itself could not be started (e.g. the compiler is missing): a fault of the system, not the code. */
  startFailed: boolean;
}

export interface RunLimits {
  timeLimitMs: number;
  memoryLimitMb: number;
  /** Stop the program once stdout or stderr reaches this many bytes. */
  maxOutputBytes: number;
}

/**
 * Raw evidence about one run. The sandbox reports what happened; `classifyRun` decides what it means.
 * Signal numbers are always Linux numbers, whatever the host is.
 */
export interface RunResult {
  /** Exit status of the program; 128 + N when it was killed by signal N (shell convention). */
  exitCode: number;
  /** Terminating signal number, 0 when the program exited by itself. */
  signal: number;
  stdout: string;
  stderr: string;
  /** CPU time (user + system) when the sandbox can measure it, otherwise wall time. */
  timeMs: number;
  /** Peak RSS of the program, 0 when unknown. */
  memoryKb: number;
  /** The wall-clock deadline expired and the sandbox killed the program. */
  timedOut: boolean;
  /** The kernel killed the program for using more CPU time than allowed (RLIMIT_CPU). */
  cpuLimitKill: boolean;
  /** stdout or stderr reached the size cap, so the program was cut off. */
  outputLimit: boolean;
  /** The program could not be started at all; `stderr` explains why. */
  startFailed: boolean;
  /**
   * Processes the program started could not be stopped afterwards (e.g. a detached fork bomb holding every pid). The
   * program caused it, so it is its result; the sandbox is no longer trusted for another run.
   */
  leftovers: boolean;
}

/** A call was cancelled through the `AbortSignal` (job deadline hit, engine shutting down). */
export class OperationAborted extends Error {
  constructor(message = 'Operation aborted') {
    super(message);
    this.name = 'OperationAborted';
  }
}
