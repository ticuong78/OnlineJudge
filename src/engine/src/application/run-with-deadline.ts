export type DeadlineOutcome<T> = { timedOut: false; value: T } | { timedOut: true };

/**
 * Runs `work` with a hard deadline. At the deadline the `AbortSignal` handed to `work` fires (so it can kill the
 * processes it is waiting for) AND this function resolves at once with `timedOut: true`, whether or not `work`
 * reacts. That second part is what frees the worker slot when something below hangs and never settles.
 *
 * If `work` fails before the deadline the error propagates. If it fails after losing the race it is passed to
 * `onLateError` (default: ignored), so it can never become an unhandled rejection.
 */
export async function runWithDeadline<T>(
  deadlineMs: number,
  work: (signal: AbortSignal) => Promise<T>,
  onLateError: (error: unknown) => void = () => undefined,
): Promise<DeadlineOutcome<T>> {
  const abort = new AbortController();
  let timer: NodeJS.Timeout | undefined;
  let lost = false;
  try {
    const deadline = new Promise<'deadline'>((resolve) => {
      timer = setTimeout(() => resolve('deadline'), deadlineMs);
    });
    const task = Promise.resolve()
      .then(() => work(abort.signal))
      .then(
        (value) => ({ ok: true as const, value }),
        (error: unknown) => {
          if (lost) {
            onLateError(error);
            return { ok: false as const };
          }
          throw error;
        },
      );
    const first = await Promise.race([task, deadline]);
    if (first === 'deadline') {
      lost = true;
      abort.abort();
      return { timedOut: true };
    }
    if (!first.ok) return { timedOut: true };
    return { timedOut: false, value: first.value };
  } finally {
    clearTimeout(timer);
  }
}
