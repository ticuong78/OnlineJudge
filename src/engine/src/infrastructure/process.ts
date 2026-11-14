import { spawn } from 'node:child_process';
import { OperationAborted } from '../domain/sandbox';
import { signalNumber } from '../domain/signals';

export interface SpawnResult {
  exitCode: number;
  /** Name of the signal that terminated the process, if any. */
  signal: NodeJS.Signals | null;
  /** Decoded output; empty in `binary` mode, where the buffers below are the source of truth. */
  stdout: string;
  stderr: string;
  stdoutBuffer: Buffer;
  stderrBuffer: Buffer;
  timedOut: boolean;
  wallMs: number;
}

export interface SpawnOptions {
  cwd?: string;
  input?: string | Buffer;
  /** Kill the process after this long. */
  timeoutMs: number;
  /** Abort kills the process at once and rejects with `OperationAborted`. */
  signal?: AbortSignal;
  /** Keep at most this many bytes of each stream (the rest is read and dropped). Default 64 MiB. */
  maxCaptureBytes?: number;
  /** Do not decode the output into strings. */
  binary?: boolean;
}

const DEFAULT_MAX_CAPTURE = 64 * 1024 * 1024;
/** After `exit`, how long to wait for the stdio streams to flush before giving up on `close`. */
const STDIO_FLUSH_GRACE_MS = 2_000;
/** After we kill a process, how long to wait for it to be reaped before settling anyway. */
const KILL_REAP_GRACE_MS = 3_000;

/**
 * Spawns a process, feeds stdin, captures output (capped) and kills it after `timeoutMs` or on abort.
 * It settles even when the child never closes its pipes: a worker must never wait for ever on a `docker` client.
 */
export function runProcess(command: string, args: string[], options: SpawnOptions): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) {
      reject(new OperationAborted());
      return;
    }
    const started = process.hrtime.bigint();
    const max = options.maxCaptureBytes ?? DEFAULT_MAX_CAPTURE;
    const child = spawn(command, args, { cwd: options.cwd, windowsHide: true });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    let outSize = 0;
    let errSize = 0;
    let timedOut = false;
    let settled = false;
    let timer: NodeJS.Timeout | undefined;
    let flushTimer: NodeJS.Timeout | undefined;
    let reapTimer: NodeJS.Timeout | undefined;

    const cleanup = () => {
      clearTimeout(timer);
      clearTimeout(flushTimer);
      clearTimeout(reapTimer);
      options.signal?.removeEventListener('abort', onAbort);
    };
    const settle = (action: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      action();
    };
    const finish = (code: number | null, signal: NodeJS.Signals | null) =>
      settle(() => {
        const stdoutBuffer = Buffer.concat(out);
        const stderrBuffer = Buffer.concat(err);
        resolve({
          exitCode: code ?? (signal ? 128 + signalNumber(signal) : 1),
          signal,
          stdout: options.binary ? '' : stdoutBuffer.toString('utf8'),
          stderr: options.binary ? '' : stderrBuffer.toString('utf8'),
          stdoutBuffer: options.binary ? stdoutBuffer : Buffer.alloc(0),
          stderrBuffer: options.binary ? stderrBuffer : Buffer.alloc(0),
          timedOut,
          wallMs: Number(process.hrtime.bigint() - started) / 1e6,
        });
      });
    const kill = () => {
      child.kill('SIGKILL');
      reapTimer ??= setTimeout(() => finish(null, 'SIGKILL'), KILL_REAP_GRACE_MS);
    };
    const onAbort = () => {
      child.kill('SIGKILL');
      settle(() => reject(new OperationAborted()));
    };

    timer = setTimeout(() => {
      timedOut = true;
      kill();
    }, options.timeoutMs);
    options.signal?.addEventListener('abort', onAbort, { once: true });

    const keep = (chunks: Buffer[], size: number, chunk: Buffer): number => {
      if (size >= max) return size;
      const room = max - size;
      const part = chunk.length > room ? chunk.subarray(0, room) : chunk;
      chunks.push(part);
      return size + part.length;
    };
    child.stdout.on('data', (chunk: Buffer) => {
      outSize = keep(out, outSize, chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      errSize = keep(err, errSize, chunk);
    });
    child.on('error', (e) => settle(() => reject(e)));
    // `exit` can arrive without `close` when something else still holds the pipes: do not wait for ever.
    child.on('exit', (code, signal) => {
      flushTimer = setTimeout(() => {
        child.stdout.destroy();
        child.stderr.destroy();
        finish(code, signal);
      }, STDIO_FLUSH_GRACE_MS);
    });
    child.on('close', (code, signal) => finish(code, signal));

    // The program may exit before reading all input; ignore EPIPE.
    child.stdin.on('error', () => undefined);
    child.stdin.end(options.input ?? '');
  });
}
