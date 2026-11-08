/**
 * Wire format of `oj-run` (see runner/oj-run.c). One reply per invocation, on the supervisor's stdout:
 *
 *   OJRUN1 <exit> <signal> <cpu_ms> <wall_ms> <rss_kb> <flags> <stdout_len> <stderr_len>\n
 *   <stdout_len bytes><stderr_len bytes>
 */
export const SUPERVISOR_MAGIC = 'OJRUN1';
/** Value of the `oj.runner.version` image label this engine was written for. */
export const RUNNER_IMAGE_VERSION = '5';

export const SupervisorFlags = {
  WALL_TIMEOUT: 1,
  CPU_KILL: 2,
  OUTPUT_LIMIT: 4,
  START_FAILED: 8,
  UNREAPED: 16,
} as const;

export interface SupervisorReply {
  /** Exit status 0..255, or -1 when the program was killed by a signal. */
  exitStatus: number;
  /** Terminating signal number, 0 when the program exited by itself. */
  signal: number;
  cpuMs: number;
  wallMs: number;
  rssKb: number;
  flags: number;
  stdout: Buffer;
  stderr: Buffer;
}

/** The supervisor's answer is missing, cut short or not what we expect: the sandbox itself is broken. */
export class SupervisorProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SupervisorProtocolError';
  }
}

const MAX_HEADER_BYTES = 256;

export function parseSupervisorReply(raw: Buffer): SupervisorReply {
  const newline = raw.subarray(0, MAX_HEADER_BYTES).indexOf(0x0a);
  if (newline < 0) throw new SupervisorProtocolError('Supervisor reply has no header line');
  const fields = raw.subarray(0, newline).toString('latin1').split(' ');
  if (fields[0] !== SUPERVISOR_MAGIC) throw new SupervisorProtocolError('Supervisor reply has the wrong magic');
  if (fields.length !== 9) throw new SupervisorProtocolError(`Supervisor header has ${fields.length} fields, expected 9`);

  const numbers = fields.slice(1).map((f) => {
    if (!/^-?\d{1,18}$/.test(f)) throw new SupervisorProtocolError(`Supervisor header has a bad number: '${f.slice(0, 20)}'`);
    return Number(f);
  });
  const [exitStatus, signal, cpuMs, wallMs, rssKb, flags, outLen, errLen] = numbers;
  if (outLen < 0 || errLen < 0 || cpuMs < 0 || wallMs < 0 || rssKb < 0 || signal < 0 || flags < 0) {
    throw new SupervisorProtocolError('Supervisor header has a negative value');
  }
  const body = raw.subarray(newline + 1);
  if (body.length !== outLen + errLen) {
    throw new SupervisorProtocolError(
      `Supervisor reply is cut short or has trailing bytes: header announces ${outLen + errLen} body bytes, got ${body.length}`,
    );
  }
  return {
    exitStatus,
    signal,
    cpuMs,
    wallMs,
    rssKb,
    flags,
    stdout: Buffer.from(body.subarray(0, outLen)),
    stderr: Buffer.from(body.subarray(outLen)),
  };
}

export interface SupervisorLimits {
  cpuMs: number;
  wallMs: number;
  /** Cap on each of stdout and stderr (and on any single file the program writes). */
  fsizeBytes: number;
  /** Cap on the input the supervisor will accept from us. */
  maxInputBytes: number;
  /** Remove what the program left in /box and /tmp afterwards (tests only: a build's output must stay). */
  cleanScratch?: boolean;
}

/** Arguments for `oj-run` up to and including `--`; the program's argv goes after them. */
export function supervisorArgs(limits: SupervisorLimits): string[] {
  const whole = (name: string, value: number) => {
    if (!Number.isFinite(value) || value < 0) throw new RangeError(`${name} must be a non-negative number`);
    return String(Math.ceil(value));
  };
  return [
    '--cpu-ms', whole('cpuMs', Math.max(1, limits.cpuMs)),
    '--wall-ms', whole('wallMs', Math.max(1, limits.wallMs)),
    '--fsize-bytes', whole('fsizeBytes', Math.max(1, limits.fsizeBytes)),
    '--max-input-bytes', whole('maxInputBytes', limits.maxInputBytes),
    ...(limits.cleanScratch ? ['--clean-scratch', '1'] : []),
    '--',
  ];
}
