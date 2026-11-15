/** Linux signal numbers: the sandbox runs Linux code whatever the host is, and reports them this way. */
const NAMES: Record<number, string> = {
  1: 'SIGHUP',
  2: 'SIGINT',
  3: 'SIGQUIT',
  4: 'SIGILL',
  5: 'SIGTRAP',
  6: 'SIGABRT',
  7: 'SIGBUS',
  8: 'SIGFPE',
  9: 'SIGKILL',
  10: 'SIGUSR1',
  11: 'SIGSEGV',
  12: 'SIGUSR2',
  13: 'SIGPIPE',
  14: 'SIGALRM',
  15: 'SIGTERM',
  24: 'SIGXCPU',
  25: 'SIGXFSZ',
  31: 'SIGSYS',
};

export const SIGKILL = 9;

export function signalName(signal: number): string {
  return NAMES[signal] ?? `signal ${signal}`;
}

/** Linux number for a signal name such as `SIGSEGV` (0 when unknown). */
export function signalNumber(name: string | null | undefined): number {
  if (!name) return 0;
  for (const [number, known] of Object.entries(NAMES)) if (known === name) return Number(number);
  return 0;
}
