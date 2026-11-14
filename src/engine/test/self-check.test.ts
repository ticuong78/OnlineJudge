import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { DockerCli } from '../src/infrastructure/docker-cli';
import type { SpawnResult } from '../src/infrastructure/process';
import { checkDockerRunner } from '../src/infrastructure/self-check';

const result = (over: Partial<SpawnResult> = {}): SpawnResult => ({
  exitCode: 0, signal: null, stdout: '', stderr: '', stdoutBuffer: Buffer.alloc(0), stderrBuffer: Buffer.alloc(0),
  timedOut: false, wallMs: 1, ...over,
});

const docker = (version: SpawnResult | Error, inspect: SpawnResult | Error): DockerCli => ({
  async run(args) {
    const answer = args[0] === 'version' ? version : inspect;
    if (answer instanceof Error) throw answer;
    return answer;
  },
});

test('ready when the daemon answers and the image has the right runner version', async () => {
  assert.deepEqual(await checkDockerRunner(docker(result({ stdout: '20.10.17\n' }), result({ stdout: '5\n' })), 'oj-runner:latest'), []);
});

test('daemon not reachable: says so and mentions the local sandbox escape hatch', async () => {
  const problems = await checkDockerRunner(
    docker(result({ exitCode: 1, stderr: 'Cannot connect to the Docker daemon at unix:///var/run/docker.sock.\nIs the docker daemon running?' }), result()),
    'oj-runner:latest',
  );
  assert.equal(problems.length, 1);
  assert.match(problems[0], /Docker is not reachable \(Cannot connect to the Docker daemon/);
  assert.match(problems[0], /SANDBOX=local/);
});

test('daemon timeout and a missing docker binary are reported as unreachable', async () => {
  assert.match((await checkDockerRunner(docker(result({ timedOut: true, exitCode: 137 }), result()), 'x'))[0], /did not answer in 15 s/);
  assert.match((await checkDockerRunner(docker(new Error('spawn docker ENOENT'), result()), 'x'))[0], /spawn docker ENOENT/);
});

test('image missing: tells the operator how to build it', async () => {
  const problems = await checkDockerRunner(docker(result({ stdout: '20.10.17' }), result({ exitCode: 1, stderr: 'Error: No such image' })), 'oj-runner:latest');
  assert.match(problems[0], /"oj-runner:latest" is not available/);
  assert.match(problems[0], /pnpm runner:build/);
});

test('image out of date (old label, or no label at all): tells the operator to rebuild', async () => {
  for (const label of ['1', '2', '3', '4', '']) {
    const problems = await checkDockerRunner(docker(result({ stdout: '20.10.17' }), result({ stdout: `${label}\n` })), 'oj-runner:latest');
    assert.equal(problems.length, 1, label);
    assert.match(problems[0], /out of date/);
    assert.match(problems[0], /needs "5"/);
    assert.match(problems[0], /pnpm runner:build/);
  }
});
