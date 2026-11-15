import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OperationAborted } from '../src/domain/sandbox';
import { MIB } from '../src/domain/resource-plan';
import type { DockerCli } from '../src/infrastructure/docker-cli';
import { DockerSandbox } from '../src/infrastructure/docker-sandbox';
import type { SpawnOptions, SpawnResult } from '../src/infrastructure/process';
import { CONTAINER_GRACE_MS } from '../src/infrastructure/sandbox-labels';

const result = (over: Partial<SpawnResult> = {}): SpawnResult => ({
  exitCode: 0, signal: null, stdout: '', stderr: '', stdoutBuffer: Buffer.alloc(0), stderrBuffer: Buffer.alloc(0),
  timedOut: false, wallMs: 1, ...over,
});

interface Call { args: string[]; options: SpawnOptions }

class RecordingDocker implements DockerCli {
  calls: Call[] = [];
  constructor(private readonly respond: (args: string[]) => SpawnResult | Promise<SpawnResult> = () => result()) {}
  async run(args: string[], options: SpawnOptions): Promise<SpawnResult> {
    this.calls.push({ args, options });
    return this.respond(args);
  }
  find(verb: string) {
    return this.calls.filter((c) => c.args[0] === verb);
  }
}

const NOW = 1_700_000_000_000;
const sandbox = (docker: DockerCli) => new DockerSandbox({ image: 'oj-runner:test', compileMemoryMb: 768 }, docker, () => NOW);

const open = (docker: DockerCli, over: Partial<Parameters<DockerSandbox['open']>[0]> = {}) =>
  sandbox(docker).open({
    files: [{ name: 'main.cpp', content: 'int main(){}' }],
    memoryLimitMb: 80,
    hasBuildStep: true,
    ioBudgetBytes: 8 * MIB,
    deadlineAt: NOW + 5 * 60_000,
    ...over,
  });

const flagValues = (args: string[], flag: string) => args.flatMap((a, i) => (a === flag ? [args[i + 1]] : []));

test('the container is locked down: no network, no host mounts, no capabilities but the three oj-run needs', async () => {
  const docker = new RecordingDocker();
  await open(docker);
  const run = docker.find('run')[0].args;

  assert.deepEqual(flagValues(run, '--network'), ['none']);
  assert.deepEqual(flagValues(run, '--cgroupns'), ['private'], 'oj-run measures CPU from its own cgroup (N4-a)');
  assert.deepEqual(flagValues(run, '--cap-drop'), ['ALL']);
  assert.deepEqual(flagValues(run, '--cap-add').sort(), ['KILL', 'SETGID', 'SETUID']);
  assert.deepEqual(flagValues(run, '--security-opt'), ['no-new-privileges']);
  assert.ok(run.includes('--read-only'));
  assert.ok(run.includes('--init'), 'a real init reaps the processes oj-run kills');
  assert.ok(run.includes('--rm'));
  assert.deepEqual(flagValues(run, '--pids-limit'), ['128']);
  assert.deepEqual(flagValues(run, '--cpus'), ['1']);
  // No /dev/shm and no System V or POSIX IPC: memory there would outlive a test outside the scratch allowance (F-1).
  assert.deepEqual(flagValues(run, '--ipc'), ['none']);
  assert.deepEqual(flagValues(run, '--sysctl').sort(), [
    'fs.mqueue.queues_max=0', 'kernel.msgmni=0', 'kernel.sem=0 0 0 0', 'kernel.shm_rmid_forced=1', 'kernel.shmall=0', 'kernel.shmmax=0',
  ]);

  for (const forbidden of ['-v', '--volume', '--mount', '--privileged', '--device', '--pid', '--uts', '--userns', '--cap-add=ALL', '--shm-size']) {
    assert.ok(!run.includes(forbidden), `${forbidden} must never be passed`);
  }
  assert.ok(!run.some((a) => a.startsWith('--volume=') || a.startsWith('--mount=') || a.startsWith('--network=host')));
});

test('workspace and /tmp are size-capped tmpfs; only the workspace may hold executables', async () => {
  const docker = new RecordingDocker();
  await open(docker);
  const tmpfs = flagValues(docker.find('run')[0].args, '--tmpfs');
  assert.equal(tmpfs.length, 2);
  const box = tmpfs.find((t) => t.startsWith('/box:'))!;
  const tmp = tmpfs.find((t) => t.startsWith('/tmp:'))!;
  assert.match(box, /\bexec\b/);
  assert.match(box, /nosuid/);
  assert.match(box, /size=48m/);
  assert.match(tmp, /noexec/);
  assert.match(tmp, /size=32m/);
  // A cap on files too: empty files cost kernel memory outside the size cap (F-1).
  assert.match(box, /nr_inodes=4096/);
  assert.match(tmp, /nr_inodes=4096/);
});

test('before the first test the build output is sealed (root-owned, read-only), and every test cleans the scratch space (F-1, F-4)', async () => {
  const docker = new RecordingDocker((args) => (args.includes('oj-run') ? result({ stdoutBuffer: Buffer.from('OJRUN1 0 0 1 1 1 0 0 0\n') }) : result()));
  const session = await open(docker);
  await session.exec(['g++', '-O2', '-o', 'main', 'main.cpp'], 30_000);
  const limits = { timeLimitMs: 1000, memoryLimitMb: 64, maxOutputBytes: 4 * MIB };
  await session.run(['./main'], '', limits);
  await session.run(['./main'], '', limits);

  const execs = docker.find('exec').map((c) => c.args);
  const seals = execs.filter((a) => a.some((x) => x.includes('.oj-seal')));
  assert.equal(seals.length, 1, 'sealed once');
  const sealAt = execs.indexOf(seals[0]);
  const build = execs.findIndex((a) => a.includes('g++'));
  const firstRun = execs.findIndex((a) => a.includes('./main'));
  assert.ok(build < sealAt && sealAt < firstRun, 'after the build, before the first test');
  assert.ok(!execs[build].includes('--clean-scratch'), 'the build output must not be cleaned away');
  for (const runArgs of execs.filter((a) => a.includes('./main'))) {
    assert.deepEqual(runArgs.slice(runArgs.indexOf('--clean-scratch'), runArgs.indexOf('--clean-scratch') + 2), ['--clean-scratch', '1']);
  }
});

test('a build output that cannot be sealed stops judging before the program runs', async () => {
  const docker = new RecordingDocker((args) => (args.some((x) => x.includes('.oj-seal')) ? result({ exitCode: 1, stderr: 'not a plain file: pkg' }) : result({ stdoutBuffer: Buffer.from('OJRUN1 0 0 1 1 1 0 0 0\n') })));
  const session = await open(docker);
  await assert.rejects(session.run(['./main'], '', { timeLimitMs: 1000, memoryLimitMb: 64, maxOutputBytes: 4 * MIB }), /seal/);
  assert.equal(docker.calls.filter((c) => c.args.includes('./main')).length, 0);
});

test('memory: a build budget while compiling, lowered to program + capture + scratch before the tests', async () => {
  const docker = new RecordingDocker();
  await open(docker, { memoryLimitMb: 80, ioBudgetBytes: 8 * MIB });
  const run = docker.find('run')[0].args;
  assert.deepEqual(flagValues(run, '--memory'), ['768m']);
  assert.deepEqual(flagValues(run, '--memory-swap'), ['768m'], 'no swap');
});

test('memory: without a build step the container starts at the run cap; a huge program budget is never lowered below it', async () => {
  const noBuild = new RecordingDocker();
  await open(noBuild, { hasBuildStep: false, memoryLimitMb: 128 + 64, ioBudgetBytes: 8 * MIB });
  // 192 program + 8 capture + 32 scratch
  assert.deepEqual(flagValues(noBuild.find('run')[0].args, '--memory'), ['296m']);

  const big = new RecordingDocker();
  await open(big, { memoryLimitMb: 1024 + 128, hasBuildStep: true, ioBudgetBytes: 8 * MIB });
  assert.deepEqual(flagValues(big.find('run')[0].args, '--memory'), ['1256m'], 'the run cap wins when it is larger than the build budget');
});

const OK_REPLY = () => result({ stdout: 'OJRUN1 0 0 1 1 1 0 0 0\n', stdoutBuffer: Buffer.from('OJRUN1 0 0 1 1 1 0 0 0\n') });

test('the memory cap is lowered once, before the first run', async () => {
  const docker = new RecordingDocker(() => OK_REPLY());
  const session = await open(docker);
  const limits = { timeLimitMs: 1000, memoryLimitMb: 64, maxOutputBytes: 4 * MIB };
  await session.run(['./main'], '1 2\n', limits);
  await session.run(['./main'], '3 4\n', limits);
  assert.equal(docker.find('update').length, 1, 'once, not per test');
  assert.deepEqual(docker.find('update')[0].args, ['update', '--memory', '184m', '--memory-swap', '184m', docker.find('update')[0].args[5]]);
  assert.ok(docker.calls.findIndex((c) => c.args[0] === 'update') < docker.calls.findIndex((c) => c.args.includes('oj-run')), 'before the first run');
});

test('if the memory cap cannot be lowered, no test runs under the build budget (fail closed)', async () => {
  const failures: [string, (args: string[]) => SpawnResult][] = [
    ['docker refuses', (args) => (args[0] === 'update' ? result({ exitCode: 1, stderr: 'cannot lower' }) : OK_REPLY())],
    ['docker times out', (args) => (args[0] === 'update' ? result({ timedOut: true }) : OK_REPLY())],
    ['docker cannot be called', (args) => { if (args[0] === 'update') throw new Error('spawn docker ENOENT'); return OK_REPLY(); }],
  ];
  for (const [why, answer] of failures) {
    const docker = new RecordingDocker(answer);
    const session = await open(docker);
    const limits = { timeLimitMs: 1000, memoryLimitMb: 64, maxOutputBytes: 4 * MIB };
    await assert.rejects(session.run(['./main'], '1 2\n', limits), /memory cap/, why);
    await assert.rejects(session.run(['./main'], '3 4\n', limits), /memory cap/, `${why}: a later test does not slip through`);
    assert.equal(docker.calls.filter((c) => c.args.includes('oj-run')).length, 0, `${why}: the program never ran`);
  }
});

test('aborting while the memory cap is lowered rethrows the abort itself', async () => {
  const docker = new RecordingDocker((args) => { if (args[0] === 'update') throw new OperationAborted(); return OK_REPLY(); });
  const session = await open(docker);
  await assert.rejects(session.run(['./main'], '', { timeLimitMs: 1000, memoryLimitMb: 64, maxOutputBytes: 4 * MIB }), OperationAborted);
});

test('containers carry the sweeper labels and remove themselves after deadline + grace', async () => {
  const docker = new RecordingDocker();
  await open(docker, { deadlineAt: NOW + 5 * 60_000 });
  const run = docker.find('run')[0].args;
  assert.deepEqual(flagValues(run, '--label').sort(), ['oj.deadline=1700000300000', 'oj.sandbox=1']);
  // the image is followed by the self-destruct sleep: 5 minutes + grace, in seconds
  assert.deepEqual(run.slice(-3), ['oj-runner:test', 'sleep', String(5 * 60 + CONTAINER_GRACE_MS / 1000)]);
});

test('an already-expired deadline still gets a sane minimum lifetime', async () => {
  const docker = new RecordingDocker();
  await open(docker, { deadlineAt: NOW - 3_600_000 });
  assert.equal(docker.find('run')[0].args.at(-1), '60');
});

test('every process in the container goes through oj-run; the source is written with exec -i and a positional name', async () => {
  const docker = new RecordingDocker((args) => (args.includes('oj-run') ? result({ stdoutBuffer: Buffer.from('OJRUN1 0 0 1 1 1 0 0 0\n') }) : result()));
  const session = await open(docker);
  await session.exec(['g++', '-O2', '-o', 'main', 'main.cpp'], 30_000);
  const write = docker.find('exec')[0];
  const container = write.args[4];
  assert.deepEqual(write.args.slice(0, 5), ['exec', '-i', '-u', '0:0', container], 'explicitly root: oj-run drops privileges itself');
  assert.deepEqual(write.args.slice(5, 8), ['sh', '-c', 'chmod 1777 /box && cat > "/box/$1"']);
  assert.deepEqual(write.args.slice(-2), ['_', 'main.cpp'], 'the file name is a positional parameter, never part of the script');
  assert.equal(write.options.input, 'int main(){}');

  const build = docker.find('exec')[1];
  assert.deepEqual(build.args.slice(0, 5), ['exec', '-i', '-u', '0:0', container]);
  const at = build.args.indexOf('oj-run');
  assert.equal(at, 5, 'compilers are untrusted too: they run through the supervisor');
  assert.deepEqual(build.args.slice(at + 1, at + 3), ['--cpu-ms', '30000']);
  assert.deepEqual(build.args.slice(-5), ['g++', '-O2', '-o', 'main', 'main.cpp']);
});

test('unsafe file names are refused before anything is started', async () => {
  for (const name of ['../etc/passwd', 'a/b.cpp', '', ' main.cpp', 'main.cpp; rm -rf /', '$(id).java', '-rf', 'x'.repeat(200)]) {
    const docker = new RecordingDocker();
    await assert.rejects(open(docker, { files: [{ name, content: 'x' }] }), /Unsafe file name/, JSON.stringify(name));
    assert.equal(docker.calls.length, 0, 'no container for a bad name');
  }
  // Java class names legitimately contain $ and digits
  await assert.doesNotReject(open(new RecordingDocker(), { files: [{ name: 'My$Class2.java', content: 'x' }] }));
});

test('a failed or timed-out start removes the half-created container and reports why', async () => {
  const failing = new RecordingDocker((args) => (args[0] === 'run' ? result({ exitCode: 125, stderr: 'docker: Error response from daemon: pull access denied' }) : result()));
  await assert.rejects(open(failing), /Cannot start sandbox container: docker: Error response from daemon/);
  assert.equal(failing.find('rm').length, 1);

  const slow = new RecordingDocker((args) => (args[0] === 'run' ? result({ timedOut: true, exitCode: 137 }) : result()));
  await assert.rejects(open(slow), /docker did not answer in time/);
  assert.equal(slow.find('rm').length, 1);
});

test('aborting while the container starts removes it and rethrows the abort', async () => {
  const docker = new RecordingDocker((args) => {
    if (args[0] === 'run') throw new OperationAborted();
    return result();
  });
  await assert.rejects(open(docker), OperationAborted);
  assert.equal(docker.find('rm').length, 1);
});

test('if writing the source fails the container is removed', async () => {
  const docker = new RecordingDocker((args) => (args[0] === 'exec' ? result({ exitCode: 1, stderr: 'No space left on device' }) : result()));
  await assert.rejects(open(docker), /Cannot write main\.cpp into the sandbox: No space left/);
  assert.equal(docker.find('rm').length, 1);
});

test('dispose removes the container once, even when called twice, and never throws', async () => {
  const docker = new RecordingDocker((args) => {
    if (args[0] === 'rm') throw new Error('daemon gone');
    return result();
  });
  const session = await open(docker);
  await assert.doesNotReject(session.dispose());
  await session.dispose();
  assert.equal(docker.find('rm').length, 1);
});

test('the supervisor failing to answer is a sandbox failure, not a verdict', async () => {
  const limits = { timeLimitMs: 1000, memoryLimitMb: 64, maxOutputBytes: 4 * MIB };
  const cases: [string, SpawnResult, RegExp][] = [
    ['docker exec fails without a reply', result({ exitCode: 126, stderrBuffer: Buffer.from('OCI runtime exec failed: unable to start container process') }), /supervisor failed \(docker exec exit 126\): OCI runtime exec failed/],
    ['the client never answered', result({ timedOut: true, exitCode: 137 }), /did not answer within/],
    ['garbage on stdout', result({ stdoutBuffer: Buffer.from('hello world\n') }), /wrong magic/],
    ['a reply cut short', result({ stdoutBuffer: Buffer.from('OJRUN1 0 0 1 1 1 0 9 0\nabc') }), /cut short/],
  ];
  for (const [name, answer, expected] of cases) {
    const docker = new RecordingDocker((args) => (args.includes('oj-run') ? answer : result()));
    const session = await open(docker, { hasBuildStep: false });
    await assert.rejects(session.run(['./main'], '', limits), expected, name);
  }
});

test('processes a program left behind and that could not be stopped are reported as its result, not a sandbox failure (NEW-1)', async () => {
  const limits = { timeLimitMs: 1000, memoryLimitMb: 64, maxOutputBytes: 4 * MIB };
  const docker = new RecordingDocker((args) => (args.includes('oj-run') ? result({ stdoutBuffer: Buffer.from('OJRUN1 -1 9 0 5000 0 17 0 0\n') }) : result()));
  const session = await open(docker, { hasBuildStep: false });
  const run = await session.run(['./main'], '', limits);
  assert.equal(run.leftovers, true);
  assert.equal(run.timedOut, true);
});

test('a build step that leaves processes behind, or whose compiler cannot start, is told apart (N3)', async () => {
  const stuck = new RecordingDocker((args) => (args.includes('oj-run') ? result({ stdoutBuffer: Buffer.from('OJRUN1 0 0 1 1 1 16 0 0\n') }) : result()));
  await assert.rejects((await open(stuck)).exec(['g++', 'main.cpp'], 10_000), /could not be stopped/, 'the compiler is not the student: a sandbox failure');
  const missing = new RecordingDocker((args) => (args.includes('oj-run') ? result({ stdoutBuffer: Buffer.from('OJRUN1 127 0 0 1 0 8 0 0\n') }) : result()));
  assert.equal((await (await open(missing)).exec(['g++', 'main.cpp'], 10_000)).startFailed, true);
});

test('a run is mapped from the supervisor reply: raw evidence in, no verdict decided here', async () => {
  const reply = Buffer.concat([Buffer.from('OJRUN1 -1 24 1998 2007 6484 6 4 3\n'), Buffer.from('out\n'), Buffer.from('err')]);
  const docker = new RecordingDocker((args) => (args.includes('oj-run') ? result({ stdoutBuffer: reply }) : result()));
  const session = await open(docker, { hasBuildStep: false });
  const run = await session.run(['./main'], 'in', { timeLimitMs: 1000, memoryLimitMb: 64, maxOutputBytes: 4 * MIB });
  assert.deepEqual(run, {
    exitCode: 128 + 24, signal: 24, stdout: 'out\n', stderr: 'err', timeMs: 1998, memoryKb: 6484,
    timedOut: false, cpuLimitKill: true, outputLimit: true, startFailed: false, leftovers: false,
  });
  const exec = docker.find('exec').at(-1)!;
  assert.deepEqual(exec.args.slice(exec.args.indexOf('oj-run') + 1, exec.args.indexOf('--') + 1), [
    '--cpu-ms', '1000', '--wall-ms', '4000', '--fsize-bytes', String(4 * MIB), '--max-input-bytes', '2', '--clean-scratch', '1', '--',
  ]);
  assert.equal(exec.options.timeoutMs, 4000 + 5000, 'the docker client gets the wall limit plus overhead');
  assert.equal(exec.options.binary, true);
});
