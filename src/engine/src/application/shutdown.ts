export interface ShutdownOptions {
  /** Stops accepting work and waits for running jobs and connections. May hang for ever on a dead connection. */
  close: () => Promise<void>;
  /** If `close` has not finished by then, give up and exit with status 1 anyway. */
  forceAfterMs: number;
  exit: (code: number) => void;
  log: (message: string) => void;
}

/**
 * Builds the SIGTERM/SIGINT handler. Graceful shutdown must never hold the process hostage: a process manager that
 * sends SIGTERM and then has to SIGKILL after a timeout cannot tell a clean stop from a hang.
 * Calling the handler more than once is harmless (the first call wins).
 */
export function createShutdown(options: ShutdownOptions): (reason: string) => Promise<void> {
  let started: Promise<void> | undefined;
  return (reason) => {
    started ??= (async () => {
      options.log(`${reason}: shutting down`);
      const force = setTimeout(() => {
        options.log(`graceful shutdown did not finish in ${Math.round(options.forceAfterMs / 1000)}s, exiting`);
        options.exit(1);
      }, options.forceAfterMs);
      try {
        await options.close();
        clearTimeout(force);
        options.exit(0);
      } catch (error) {
        clearTimeout(force);
        options.log(`error while shutting down: ${error instanceof Error ? error.message : String(error)}`);
        options.exit(1);
      }
    })();
    return started;
  };
}
