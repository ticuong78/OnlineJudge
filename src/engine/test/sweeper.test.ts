import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { DockerCli } from '../src/infrastructure/docker-cli';
import { CONTAINER_GRACE_MS } from '../src/infrastructure/sandbox-labels';
import { expiredSandboxIds, parseSandboxRows, SandboxSweeper } from '../src/infrastructure/sandbox-sweeper';
import type { SpawnOptions, SpawnResult } from '../src/infrastructure/process';

const result = (over: Partial<SpawnResult> = {}): SpawnResult => ({
  exitCode: 0, signal: null, stdout: '', stderr: '', stdoutBuffer: Buffer.alloc(0), stderrBuffer: Buffer.alloc(0),
  timedOut: false, wallMs: 1, ...over,
});

const NOW = 1_700_000_000_000;

test('parses docker ps rows and ignores anything that is not a container id', () => {
  const rows = parseSandboxRows(
    ['0988019b2edd 1700000600000', 'deadbeef12 ', 'abc123 notanumber', 'WARNING: something', '', '  ', 'f00dfeed99 1700000000000'].join('\n'),
  );
  assert.deepEqual(rows, [
    { id: '0988019b2edd', deadlineAt: 1_700_000_600_000 },
    { id: 'deadbeef12', deadlineAt: null },
    { id: 'abc123', deadlineAt: null },
    { id: 'f00dfeed99', deadlineAt: 1_700_000_000_000 },
  ]);
});

test('only containers past deadline + grace are expired; live ones are never touched', () => {
  const rows = [
    { id: 'aaaaaa', deadlineAt: NOW + 60_000 }, // deadline still ahead
    { id: 'bbbbbb', deadlineAt: NOW - 1_000 }, // past its deadline, but inside the grace period
    { id: 'cccccc', deadlineAt: NOW - CONTAINER_GRACE_MS }, // exactly at the end of the grace period
    { id: 'dddddd', deadlineAt: NOW - 10 * 60_000 }, // long gone
  ];
  assert.deepEqual(expiredSandboxIds(rows, NOW, CONTAINER_GRACE_MS), ['cccccc', 'dddddd']);
});

test('a container without a readable deadline is treated as expired (it cannot be one of ours that is alive)', () => {
  assert.deepEqual(expiredSandboxIds([{ id: 'eeeeee', deadlineAt: null }], NOW, CONTAINER_GRACE_MS), ['eeeeee']);
});

class FakeDocker implements DockerCli {
  calls: string[][] = [];
  constructor(private readonly respond: (args: string[]) => SpawnResult | Promise<SpawnResult>) {}
  async run(args: string[], _options: SpawnOptions): Promise<SpawnResult> {
    this.calls.push(args);
    return this.respond(args);
  }
}

test('sweepOnce removes exactly the expired containers, with one docker rm -f', async () => {
  const docker = new FakeDocker((args) =>
    args[0] === 'ps'
      ? result({ stdout: `aaaaaa ${NOW + 60_000}\nbbbbbb ${NOW - 600_000}\ncccccc ${NOW - 900_000}\n` })
      : result(),
  );
  const sweeper = new SandboxSweeper(docker, { now: () => NOW, log: () => undefined });
  assert.deepEqual(await sweeper.sweepOnce(), ['bbbbbb', 'cccccc']);
  assert.deepEqual(docker.calls[0].slice(0, 3), ['ps', '-a', '--filter']);
  assert.ok(docker.calls[0].includes('label=oj.sandbox=1'), 'only containers we created are even listed');
  assert.deepEqual(docker.calls[1], ['rm', '-f', 'bbbbbb', 'cccccc']);
  assert.equal(docker.calls.length, 2);
});

test('sweepOnce does nothing (no rm) when everything is alive', async () => {
  const docker = new FakeDocker(() => result({ stdout: `aaaaaa ${NOW + 60_000}\n` }));
  const sweeper = new SandboxSweeper(docker, { now: () => NOW, log: () => undefined });
  assert.deepEqual(await sweeper.sweepOnce(), []);
  assert.equal(docker.calls.length, 1);
});

test('sweepOnce never throws: listing failure, timeout, rm failure and a throwing docker are all contained', async () => {
  const logs: string[] = [];
  const log = (m: string) => logs.push(m);
  const expired = `aaaaaa ${NOW - 900_000}\n`;

  const cases: [string, (args: string[]) => SpawnResult | Promise<SpawnResult>][] = [
    ['list fails', () => result({ exitCode: 1, stderr: 'Cannot connect to the Docker daemon' })],
    ['list times out', () => result({ timedOut: true, exitCode: 137 })],
    ['rm fails', (args) => (args[0] === 'ps' ? result({ stdout: expired }) : result({ exitCode: 1, stderr: 'No such container' }))],
    ['docker throws', () => { throw new Error('spawn docker ENOENT'); }],
  ];
  for (const [name, respond] of cases) {
    const sweeper = new SandboxSweeper(new FakeDocker(respond), { now: () => NOW, log });
    await assert.doesNotReject(sweeper.sweepOnce(), name);
  }
  assert.ok(logs.length >= cases.length, 'each failure is logged');
});

test('overlapping sweeps are skipped instead of piling up on a slow daemon', async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const docker = new FakeDocker(async () => {
    await gate;
    return result();
  });
  const sweeper = new SandboxSweeper(docker, { now: () => NOW, log: () => undefined });
  const first = sweeper.sweepOnce();
  assert.deepEqual(await sweeper.sweepOnce(), []);
  assert.equal(docker.calls.length, 1);
  release();
  await first;
});

test('start() sweeps immediately and then on the interval; stop() ends it', async () => {
  const docker = new FakeDocker(() => result());
  const sweeper = new SandboxSweeper(docker, { intervalMs: 20, now: () => NOW, log: () => undefined });
  sweeper.start();
  await new Promise((r) => setTimeout(r, 110));
  sweeper.stop();
  const after = docker.calls.length;
  assert.ok(after >= 3, `expected an immediate sweep plus several interval sweeps, got ${after}`);
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(docker.calls.length, after, 'no sweeps after stop()');
});
