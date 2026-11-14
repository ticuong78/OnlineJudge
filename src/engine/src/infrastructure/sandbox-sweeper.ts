import type { DockerCli } from './docker-cli';
import { CONTAINER_GRACE_MS, DEADLINE_LABEL, SANDBOX_LABEL } from './sandbox-labels';

export interface SandboxRow {
  id: string;
  /** Epoch ms from the container's deadline label; null when the label is missing or unreadable. */
  deadlineAt: number | null;
}

/** Parses `docker ps --format '{{.ID}} {{.Label "oj.deadline"}}'`. Lines that do not start with a container id are ignored. */
export function parseSandboxRows(stdout: string): SandboxRow[] {
  const rows: SandboxRow[] = [];
  for (const line of stdout.split('\n')) {
    const [id, deadline] = line.trim().split(/\s+/);
    if (!id || !/^[0-9a-f]{6,64}$/.test(id)) continue;
    rows.push({ id, deadlineAt: deadline && /^\d{1,16}$/.test(deadline) ? Number(deadline) : null });
  }
  return rows;
}

/**
 * Ids of containers that are past their deadline plus the grace period. A container without a readable deadline is
 * treated as expired: every container we create has one, so such a container is not ours to keep alive.
 * Several engines may share a host, so a live (not yet expired) container is never touched.
 */
export function expiredSandboxIds(rows: SandboxRow[], now: number, graceMs: number = CONTAINER_GRACE_MS): string[] {
  return rows.filter((r) => r.deadlineAt === null || r.deadlineAt + graceMs <= now).map((r) => r.id);
}

export interface SweeperOptions {
  graceMs?: number;
  intervalMs?: number;
  now?: () => number;
  log?: (message: string) => void;
}

/** Janitor for containers left behind by a crashed or killed engine. Never throws. */
export class SandboxSweeper {
  private timer: NodeJS.Timeout | undefined;
  private running = false;
  private readonly graceMs: number;
  private readonly intervalMs: number;
  private readonly now: () => number;
  private readonly log: (message: string) => void;

  constructor(
    private readonly docker: DockerCli,
    options: SweeperOptions = {},
  ) {
    this.graceMs = options.graceMs ?? CONTAINER_GRACE_MS;
    this.intervalMs = options.intervalMs ?? 60_000;
    this.now = options.now ?? Date.now;
    this.log = options.log ?? ((m) => console.warn(`[engine] ${m}`));
  }

  /** One pass; resolves to the ids it removed. */
  async sweepOnce(): Promise<string[]> {
    if (this.running) return [];
    this.running = true;
    try {
      const listed = await this.docker.run(
        ['ps', '-a', '--filter', `label=${SANDBOX_LABEL}=1`, '--format', `{{.ID}} {{.Label "${DEADLINE_LABEL}"}}`],
        { timeoutMs: 20_000 },
      );
      if (listed.timedOut || listed.exitCode !== 0) {
        this.log(`sandbox sweep: cannot list containers: ${listed.timedOut ? 'timed out' : listed.stderr.trim()}`);
        return [];
      }
      const ids = expiredSandboxIds(parseSandboxRows(listed.stdout), this.now(), this.graceMs);
      if (ids.length === 0) return [];
      const removed = await this.docker.run(['rm', '-f', ...ids], { timeoutMs: 60_000 });
      if (removed.timedOut || removed.exitCode !== 0) {
        this.log(`sandbox sweep: removing ${ids.length} expired container(s) was incomplete: ${removed.stderr.trim() || 'timed out'}`);
      } else {
        this.log(`sandbox sweep: removed ${ids.length} expired container(s)`);
      }
      return ids;
    } catch (error) {
      this.log(`sandbox sweep failed: ${(error as Error).message}`);
      return [];
    } finally {
      this.running = false;
    }
  }

  /** Sweeps now and then every interval; the timer does not keep the process alive. */
  start(): void {
    if (this.timer) return;
    void this.sweepOnce();
    this.timer = setInterval(() => void this.sweepOnce(), this.intervalMs);
    this.timer.unref();
  }

  stop(): void {
    clearInterval(this.timer);
    this.timer = undefined;
  }
}
