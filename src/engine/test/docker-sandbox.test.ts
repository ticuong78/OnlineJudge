/**
 * Integration tests against the real Docker sandbox. They need a reachable Docker daemon and the runner image built
 * with `pnpm runner:build` (label oj.runner.version=5); otherwise every test here is SKIPPED with the reason.
 * Set RUNNER_IMAGE to test another tag. The tests are deliberately gentle: at most two containers at a time,
 * allocations well under 300 MB.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import type { JudgeJob } from '@oj/contracts';
import { JudgeSubmission, judgeWithinDeadline } from '../src/application/judge-submission';
import { BOX_TMPFS_MB, MIB, TMP_TMPFS_MB } from '../src/domain/resource-plan';
import type { RunLimits, RunResult, SandboxSession } from '../src/domain/sandbox';
import { classifyRun } from '../src/domain/verdict';
import { ProcessDockerCli } from '../src/infrastructure/docker-cli';
import { DockerSandbox } from '../src/infrastructure/docker-sandbox';
import { SandboxSweeper } from '../src/infrastructure/sandbox-sweeper';
import { RUNNER_IMAGE_VERSION } from '../src/infrastructure/supervisor-protocol';

const image = process.env.RUNNER_IMAGE ?? 'oj-runner:latest';

function skipReason(): string | false {
  try {
    execFileSync('docker', ['version', '--format', '{{.Server.Version}}'], { stdio: 'pipe', timeout: 20_000 });
  } catch {
    return 'Docker daemon is not reachable';
  }
  try {
    const version = execFileSync(
      'docker',
      ['image', 'inspect', image, '--format', '{{index .Config.Labels "oj.runner.version"}}'],
      { stdio: 'pipe', timeout: 20_000 },
    ).toString().trim();
    if (version !== RUNNER_IMAGE_VERSION) {
      return `image ${image} has runner version "${version}" but "${RUNNER_IMAGE_VERSION}" is needed (run: pnpm runner:build)`;
    }
  } catch {
    return `image ${image} is not built (run: pnpm runner:build)`;
  }
  return false;
}

const skip = skipReason();
if (skip) console.warn(`[docker-sandbox tests] SKIPPED: ${skip}`);

const dtest = (name: string, fn: () => Promise<void>) => test(name, { skip }, fn);

const sandbox = new DockerSandbox({ image, compileMemoryMb: 768 });
const judge = new JudgeSubmission(sandbox);

const SAMPLE_TESTS = [
  { id: 't1', input: '1 2\n', expectedOutput: '3\n', points: 1 },
  { id: 't2', input: '10 20\n', expectedOutput: '30\n', points: 1 },
];

const job = (language: JudgeJob['language'], sourceCode: string, over: Partial<JudgeJob> = {}): JudgeJob => ({
  submissionId: 'it',
  judgeRun: 1,
  language,
  sourceCode,
  timeLimitMs: 2000,
  memoryLimitMb: 256,
  testCases: SAMPLE_TESTS,
  ...over,
});

const limits = (over: Partial<RunLimits> = {}): RunLimits => ({ timeLimitMs: 1000, memoryLimitMb: 64, maxOutputBytes: 4 * MIB, ...over });

/** A raw session (no compile step unless asked), always disposed. `programMb` = problem limit + runtime baseline. */
async function withSession<T>(
  files: { name: string; content: string }[],
  fn: (session: SandboxSession) => Promise<T>,
  over: { programMb?: number; hasBuildStep?: boolean } = {},
): Promise<T> {
  const session = await sandbox.open({
    files,
    memoryLimitMb: over.programMb ?? 96,
    hasBuildStep: over.hasBuildStep ?? false,
    ioBudgetBytes: 9 * MIB,
    deadlineAt: Date.now() + 10 * 60_000,
  });
  try {
    return await fn(session);
  } finally {
    await session.dispose();
  }
}

const pyFile = (source: string) => [{ name: 'p.py', content: source }];
const runPy = (session: SandboxSession, input = '', over: Partial<RunLimits> = {}): Promise<RunResult> =>
  session.run(['python3', '-S', 'p.py'], input, limits(over));

const sandboxContainers = (): string[] =>
  execFileSync('docker', ['ps', '-a', '--filter', 'label=oj.sandbox=1', '--format', '{{.ID}}'], { stdio: 'pipe' })
    .toString().split('\n').filter(Boolean);

/**
 * What a test left behind. Compare against the snapshot by membership, not equality: a container from an earlier
 * test that removes itself while this one runs (--rm, the sweeper) would otherwise fail the check, or end the wait.
 */
const newSince = (before: string[], now: string[]): string[] => now.filter((id) => !before.includes(id));

const hostSandboxDirs = (): string[] => readdirSync(tmpdir()).filter((n) => n.startsWith('oj-'));

const AC_PROGRAMS: [JudgeJob['language'], string][] = [
  ['cpp', '#include <iostream>\nint main(){long long a,b;std::cin>>a>>b;std::cout<<a+b<<"\\n";}'],
  ['c', '#include <stdio.h>\nint main(){long long a,b;scanf("%lld %lld",&a,&b);printf("%lld\\n",a+b);return 0;}'],
  ['python', 'a,b=map(int,input().split())\nprint(a+b)\n'],
  ['java', 'import java.util.*;\npublic class Main{public static void main(String[] x){Scanner s=new Scanner(System.in);long a=s.nextLong(),b=s.nextLong();System.out.println(a+b);}}'],
  ['javascript', 'const [a,b]=require("fs").readFileSync(0,"utf8").trim().split(/\\s+/).map(Number);console.log(a+b);'],
];

for (const [language, source] of AC_PROGRAMS) {
  dtest(`${language}: a correct solution is accepted, with real CPU time and memory`, async () => {
    const r = await judge.execute(job(language, source));
    assert.equal(r.verdict, 'AC', JSON.stringify(r));
    assert.deepEqual(r.testResults.map((t) => t.points), [1, 1]);
    for (const t of r.testResults) {
      assert.ok(t.memoryKb > 0, 'peak RSS is measured');
      assert.ok(t.timeMs < 2000, `CPU time ${t.timeMs}ms is measured and plausible`);
    }
  });
}

dtest('wrong answer, runtime error (segfault, with the signal named), compile error', async () => {
  const wa = await judge.execute(job('python', 'print(4)\n'));
  assert.equal(wa.verdict, 'WA');
  assert.deepEqual(wa.testResults.map((t) => t.verdict), ['WA', 'WA']);

  const re = await judge.execute(job('cpp', 'int main(){ int* p = 0; *p = 1; }'));
  assert.equal(re.verdict, 'RE');
  assert.match(re.testResults[0].message ?? '', /Killed by SIGSEGV \(signal 11\)/);

  const exit = await judge.execute(job('python', 'import sys\nsys.exit(3)\n'));
  assert.equal(exit.verdict, 'RE');
  assert.equal(exit.testResults[0].message, 'Exit code 3');

  const ce = await judge.execute(job('cpp', 'int main(){ this is not c++ }'));
  assert.equal(ce.verdict, 'CE');
  assert.match(ce.compileOutput ?? '', /error/);
});

dtest('an infinite loop is TLE every single time (10 runs, one container) with a realistic measured CPU time', async () => {
  await withSession(pyFile('while True: pass\n'), async (session) => {
    const verdicts = new Set<string>();
    for (let i = 1; i <= 10; i++) {
      const run = await runPy(session, '1 2\n', { timeLimitMs: 1000 });
      verdicts.add(classifyRun(run, '3\n', limits({ timeLimitMs: 1000 })));
      assert.equal(run.cpuLimitKill, true, `run ${i}: the kernel CPU limit stopped it`);
      assert.equal(run.signal, 24, `run ${i}: SIGXCPU`);
      assert.ok(run.timeMs >= 1900 && run.timeMs <= 3500, `run ${i}: measured CPU time ${run.timeMs}ms (the old design reported 0)`);
      assert.ok(run.memoryKb > 0);
    }
    assert.deepEqual([...verdicts], ['TLE']);
  });
});

dtest('a program that sleeps is stopped by the wall deadline, uses no CPU, and the supervisor survives to report it', async () => {
  await withSession(pyFile('import time\ntime.sleep(60)\n'), async (session) => {
    const started = Date.now();
    const run = await runPy(session, '', { timeLimitMs: 300 }); // wall limit = 2 s
    assert.equal(run.timedOut, true);
    assert.equal(classifyRun(run, '', limits({ timeLimitMs: 300 })), 'TLE');
    assert.ok(run.timeMs < 500, `it slept, so little CPU: ${run.timeMs}ms`);
    assert.ok(Date.now() - started < 8000);
    // the container is still healthy afterwards
    assert.equal((await runPy(session)).timedOut, true);
  });
});

dtest('memory: allocating far past the cap is MLE (cgroup OOM); using more than the limit but less than the cap is MLE too', async () => {
  const hog = 'x = bytearray(300*1024*1024)\nfor i in range(0, len(x), 4096): x[i] = 1\nprint(3)\n';
  const oom = await judge.execute(job('python', hog, { memoryLimitMb: 64, testCases: [SAMPLE_TESTS[0]] }));
  assert.equal(oom.verdict, 'MLE');

  const overLimit = 'x = bytearray(100*1024*1024)\nfor i in range(0, len(x), 4096): x[i] = 1\nprint(3)\n';
  const soft = await judge.execute(job('python', overLimit, { memoryLimitMb: 64, testCases: [SAMPLE_TESTS[0]] }));
  assert.equal(soft.verdict, 'MLE', 'finished with the right answer but over the problem limit');
  assert.ok(soft.testResults[0].memoryKb > 64 * 1024);
});

dtest('FORGERY (the live repro): overwriting /box/.stat and burning 2 s of CPU against a 1 s limit is TLE, not AC', async () => {
  const forged = [
    'import time',
    "open('/box/.stat', 'w').write('#' * 60 + '\\n0.01 0.00 0.00 1000\\n')",
    'a, b = map(int, input().split())',
    't = time.process_time()',
    'while time.process_time() - t < 2.0: pass',
    'print(a + b)',
  ].join('\n');
  const r = await judge.execute(job('python', forged, { timeLimitMs: 1000 }));
  assert.equal(r.verdict, 'TLE', JSON.stringify(r));
  assert.ok(r.testResults[0].timeMs >= 1000, 'the real CPU time is reported');
});

const ESCAPE_PROBE = String.raw`
import os, json, ctypes, resource, socket, subprocess
R = {}
libc = ctypes.CDLL(None, use_errno=True)
def t(name, f):
    try:
        R[name] = 'ALLOWED:' + repr(f())
    except Exception as e:
        R[name] = 'denied:' + type(e).__name__
def syscall_ret(r):
    if r == 0:
        return 'succeeded'
    raise OSError(ctypes.get_errno(), 'failed')
t('setuid(0)', lambda: os.setuid(0))
t('setresuid(0,0,0)', lambda: os.setresuid(0, 0, 0))
t('write the root file system', lambda: open('/etc/oj-probe', 'w').write('x'))
t('write /usr/local/bin', lambda: open('/usr/local/bin/oj-probe', 'w').write('x'))
t('read the supervisor binary', lambda: open('/usr/local/bin/oj-run', 'rb').read(4))
t('run the supervisor', lambda: subprocess.run(['/usr/local/bin/oj-run', '--version'], capture_output=True))
t('mount', lambda: syscall_ret(libc.mount(b'none', b'/mnt', b'tmpfs', 0, None)))
t('remount / read-write', lambda: syscall_ret(libc.mount(b'none', b'/', None, 32, None)))
t('chroot', lambda: os.chroot('/'))
t('sethostname', lambda: socket.sethostname('probe'))
t('kill PID 1', lambda: os.kill(1, 9))
t('ptrace PID 1', lambda: syscall_ret(libc.ptrace(16, 1, 0, 0)))
t('read /proc/1/mem', lambda: open('/proc/1/mem', 'rb').read(1))
t('list /proc/1/fd', lambda: os.listdir('/proc/1/fd'))
t('raise the CPU hard limit', lambda: resource.setrlimit(resource.RLIMIT_CPU, (10**6, 10**6)))
t('raise the file size hard limit', lambda: resource.setrlimit(resource.RLIMIT_FSIZE, (resource.RLIM_INFINITY, resource.RLIM_INFINITY)))
def lower_oom():
    f = open('/proc/self/oom_score_adj', 'w'); f.write('-1000'); f.flush()
t('lower its own oom_score_adj', lower_oom)
def exec_from_tmp():
    open('/tmp/probe.sh', 'w').write('#!/bin/sh\necho hi\n'); os.chmod('/tmp/probe.sh', 0o755)
    return subprocess.run(['/tmp/probe.sh'], capture_output=True)
t('execute a file from /tmp (noexec)', exec_from_tmp)
t('open a network connection', lambda: socket.create_connection(('1.1.1.1', 53), timeout=1))
t('see the docker socket', lambda: os.stat('/var/run/docker.sock'))
sup = [int(p) for p in os.listdir('/proc') if p.isdigit() and int(p) != os.getpid() and open('/proc/%s/comm' % p).read().strip() == 'oj-run']
R['supervisor visible'] = len(sup)
for p in sup:
    t('kill the supervisor', lambda: os.kill(p, 9))
    t('list the supervisor fds', lambda: os.listdir('/proc/%d/fd' % p))
    t('read the supervisor memory', lambda: open('/proc/%d/mem' % p, 'rb').read(1))
    t('write the supervisor memory', lambda: open('/proc/%d/mem' % p, 'wb').write(b'x'))
R['caps'] = [l.split()[1] for l in open('/proc/self/status') if l.startswith(('CapEff', 'CapPrm'))]
R['uid'] = [os.getuid(), os.geteuid()]
print(json.dumps(R))
`;

dtest('ESCAPE attempts all fail: privileges, rootfs, mount, signals, ptrace, supervisor memory/fds, rlimits, network, noexec', async () => {
  await withSession(pyFile(ESCAPE_PROBE), async (session) => {
    const run = await runPy(session, '', { timeLimitMs: 5000 });
    assert.equal(run.exitCode, 0, run.stderr);
    const probe = JSON.parse(run.stdout.trim()) as Record<string, unknown>;
    const allowed = Object.entries(probe).filter(([, v]) => typeof v === 'string' && v.startsWith('ALLOWED'));
    assert.deepEqual(allowed, [], 'everything must be denied');
    assert.equal(probe['supervisor visible'], 1, 'the probe really did find the supervisor to attack');
    assert.deepEqual(probe.caps, ['0000000000000000', '0000000000000000'], 'no capabilities');
    assert.deepEqual(probe.uid, [65534, 65534]);
    for (const name of ['kill the supervisor', 'read the supervisor memory', 'write the supervisor memory', 'setuid(0)', 'mount', 'kill PID 1']) {
      assert.match(String(probe[name]), /^denied/, name);
    }
  });
});

dtest('a correct bits/stdc++.h program compiles and is accepted at a 64 MB limit (it used to be CE: cc1plus needs ~220 MB)', async () => {
  const source = '#include <bits/stdc++.h>\nusing namespace std;\nint main(){ long long a,b; cin>>a>>b; vector<int> v{1,2,3}; map<string,int> m; cout<<a+b<<"\\n"; }';
  const r = await judge.execute(job('cpp', source, { memoryLimitMb: 64 }));
  assert.equal(r.verdict, 'AC', JSON.stringify(r));
  assert.ok(r.testResults.every((t) => t.memoryKb < 64 * 1024));
});

dtest('disk fill is bounded (per file, by the tmpfs size, by the memory cap) and never touches the host', async () => {
  // Every file the program writes is capped at the output limit (4 MiB here), so one huge file is refused outright;
  // many small files are bounded by the tmpfs mounts, whose size the memory cap reserves in full.
  const filler = String.raw`
import sys
try:
    with open('/box/big', 'wb') as f:
        f.write(b'\0' * (40 * 1048576))
    big = 'allowed'
except OSError as e:
    big = 'refused errno=%d' % e.errno
written = 0
def fill(prefix, wanted_mb):
    global written
    n = 0
    while n < wanted_mb:
        try:
            with open('%s%d' % (prefix, n), 'wb') as f:
                f.write(b'\0' * 3145728)
        except OSError:
            return
        written += 3
        n += 3
fill('/box/f', 200)
fill('/tmp/t', 36)
sys.stdout.write('written=%d big=%s\n' % (written, big))
`;
  const hostBefore = hostSandboxDirs();
  const containersBefore = sandboxContainers();

  await withSession(pyFile(filler), async (session) => {
    // generous cap: the program survives, so we can read how much it managed to write
    const run = await runPy(session, '', { timeLimitMs: 5000 });
    const match = /written=(\d+) big=(.*)/.exec(run.stdout);
    assert.ok(match, `the program should have survived and reported: ${JSON.stringify(run)}`);
    const written = Number(match[1]);
    assert.match(match[2], /^refused errno=27/, 'a single 40 MB file hits the per-file size limit (EFBIG)');
    assert.ok(written >= 60, `it could use the memory-backed disk (wrote ${written} MB)`);
    assert.ok(written <= BOX_TMPFS_MB + TMP_TMPFS_MB, `at most the tmpfs capacity, never 200 MB (wrote ${written} MB)`);
  }, { programMb: 96 });

  // A tight program budget: the scratch space is reserved in full on top of it (NF-1), so even filling both mounts
  // leaves the program and the supervisor room to finish; the result is the program's own, never a sandbox failure.
  await withSession(pyFile(filler), async (session) => {
    const run = await runPy(session, '', { memoryLimitMb: 16, timeLimitMs: 5000 });
    const match = /written=(\d+)/.exec(run.stdout);
    assert.ok(match, `the supervisor answered and the program reported: ${JSON.stringify(run)}`);
    assert.ok(Number(match[1]) <= BOX_TMPFS_MB + TMP_TMPFS_MB, `never more than both mounts hold (wrote ${match[1]} MB)`);
  }, { programMb: 16 + 32 });

  assert.deepEqual(newSince(hostBefore, hostSandboxDirs()), [], 'no oj-* directories appeared in the host temp dir');
  assert.deepEqual(newSince(containersBefore, sandboxContainers()), [], 'sessions clean up their containers');
});

dtest('a fork bomb is bounded, stopped, fully cleaned up, and the container stays usable', async () => {
  const bombs = [
    'import os, time\nwhile True:\n    try:\n        if os.fork() == 0:\n            while True: time.sleep(1)\n    except OSError:\n        time.sleep(0.01)\n',
    'import os, time\nwhile True:\n    try:\n        if os.fork() == 0:\n            os.setsid()\n            while True: time.sleep(1)\n    except OSError:\n        time.sleep(0.01)\n',
  ];
  const count = "import os\nprint(len([p for p in os.listdir('/proc') if p.isdigit()]))\n";
  for (const [i, bomb] of bombs.entries()) {
    await withSession([{ name: 'p.py', content: bomb }, { name: 'count.py', content: count }], async (session) => {
      const started = Date.now();
      const run = await runPy(session, '', { timeLimitMs: 1000 });
      assert.equal(classifyRun(run, '', limits()), 'TLE', `bomb ${i}`);
      assert.ok(Date.now() - started < 15_000);
      const after = await session.run(['python3', '-S', 'count.py'], '', limits());
      assert.equal(after.exitCode, 0, `bomb ${i}: a new program can still be started: ${after.stderr}`);
      const processes = Number(after.stdout.trim());
      assert.ok(processes <= 6, `bomb ${i}: ${processes} processes left (init, sleep and the counter are expected)`);
    });
  }
});

dtest('a program that exits while its detached fork bomb fills every pid slot fails the run; it never looks clean (C4)', async () => {
  // The bomb runs in its own session (not killed with the program's group) and keeps the pid limit full, so a
  // helper process to clean up after it cannot be started. That must be reported, not passed off as a clean exit.
  const bomb =
    'import os, time\nif os.fork() == 0:\n    os.setsid()\n    while True:\n        try:\n            os.fork()\n        except OSError:\n            time.sleep(0.001)\ntime.sleep(2)\nprint(3)\n';
  const count = "import os\nprint(len([p for p in os.listdir('/proc') if p.isdigit()]))\n";
  await withSession([...pyFile(bomb), { name: 'count.py', content: count }], async (session) => {
    const run = await runPy(session, '', { timeLimitMs: 3000 });
    // Either the leftovers are reported (the run is the program's RE and the container is not used again) ...
    if (run.leftovers) {
      // A counted failure, never AC and never a free system error (RE, or TLE when the bomb's CPU went over the limit).
      assert.ok(['RE', 'TLE'].includes(classifyRun(run, '3\n', limits({ timeLimitMs: 3000 }))));
      return;
    }
    // ... or they were really killed, and the container is clean and usable for the next test.
    const after = await session.run(['python3', '-S', 'count.py'], '', limits());
    assert.equal(after.exitCode, 0, `a new program can be started: ${after.stderr}`);
    assert.ok(Number(after.stdout.trim()) <= 6, `${after.stdout.trim()} processes left`);
  });
});

dtest('a program that fills the scratch space gets a counted verdict, not a free system error (NF-1)', async () => {
  // Test 1 fills /box and /tmp (charged to the container's memory) and exits normally; test 2 then starts with the
  // scratch space full. The supervisor must still be able to answer, so the result is the program's own, never IE.
  const fill = String.raw`
#include <stdio.h>
#include <string.h>
#include <unistd.h>
static char buf[1 << 20];
int main(void) {
  if (access("/box/f0", F_OK) == 0) { puts("3"); return 0; }
  memset(buf, 1, sizeof buf);
  char n[64];
  for (int d = 0; d < 2; d++)
    for (int i = 0; i < 200; i++) {
      snprintf(n, sizeof n, "%s/f%d", d ? "/tmp" : "/box", i);
      FILE *f = fopen(n, "wb");
      if (!f) break;
      int ok = 1;
      for (int k = 0; k < 3; k++) if (fwrite(buf, 1, sizeof buf, f) != sizeof buf) { ok = 0; break; }
      if (fclose(f) != 0 || !ok) break;
    }
  puts("3");
  return 0;
}`;
  const tests = [1, 2].map((i) => ({ id: `t${i}`, input: '', expectedOutput: '3\n', points: 1 }));
  for (let attempt = 0; attempt < 2; attempt++) { // which process the kernel picks under memory pressure varies
    const result = await judge.execute(job('c', fill, { memoryLimitMb: 64, timeLimitMs: 1000, testCases: tests }));
    assert.ok(result.type === 'finished' && result.verdict !== 'IE', JSON.stringify(result));
  }
});

const threeTests = [1, 2, 3].map((i) => ({ id: `t${i}`, input: '', expectedOutput: '3\n', points: 1 }));
/** Judges a C program on three tests (16 MB limit) and returns the per-test verdicts; never a sandbox failure. */
async function judgeC(source: string): Promise<string[]> {
  const result = await judge.execute(job('c', source, { memoryLimitMb: 16, timeLimitMs: 1000, testCases: threeTests }));
  assert.ok(result.type === 'finished' && result.verdict !== 'IE', JSON.stringify(result));
  return result.type === 'finished' ? result.testResults.map((t) => t.verdict) : [];
}

dtest('memory outside the scratch allowance cannot outlive a test and get the supervisor killed (F-1)', async () => {
  // /dev/shm (absent now), System V shared memory (limited to nothing) and a flood of empty files (inode cap, and
  // removed after every test): each of these used to make a later test a free system error.
  const devShm = String.raw`
#include <stdio.h>
#include <string.h>
static char buf[1 << 20];
int main(void) {
  memset(buf, 1, sizeof buf);
  for (int i = 0; i < 200; i++) {
    char n[64]; snprintf(n, sizeof n, "/dev/shm/f%d", i);
    FILE *f = fopen(n, "wb"); if (!f) break;
    fwrite(buf, 1, sizeof buf, f); fclose(f);
  }
  puts("3"); return 0;
}`;
  const sysv = String.raw`
#include <stdio.h>
#include <string.h>
#include <sys/ipc.h>
#include <sys/shm.h>
int main(void) {
  for (int k = 0; k < 400; k++) {
    int id = shmget(IPC_PRIVATE, 1 << 20, IPC_CREAT | 0600);
    if (id < 0) break;
    char *p = shmat(id, 0, 0);
    if (p == (void *)-1) break;
    memset(p, 1, 1 << 20);
    shmdt(p);
  }
  puts("3"); return 0;
}`;
  const inodes = String.raw`
#include <stdio.h>
#include <string.h>
#include <fcntl.h>
#include <unistd.h>
#include <time.h>
int main(void) {
  char name[300], pad[220];
  memset(pad, 'q', sizeof pad - 1); pad[sizeof pad - 1] = 0;
  clock_t start = clock();
  for (long n = 0;; n++) {
    if ((n & 1023) == 0 && clock() - start > CLOCKS_PER_SEC * 9 / 10) break;
    snprintf(name, sizeof name, "/box/%ld%s", n, pad);
    int fd = open(name, O_CREAT | O_WRONLY, 0600);
    if (fd < 0) break;
    close(fd);
  }
  puts("3"); return 0;
}`;
  for (const source of [devShm, sysv, inodes]) await judgeC(source);
});

dtest('the program cannot delete or change its build output, and nothing it writes carries into the next test (F-4)', async () => {
  const deletesMain = String.raw`
#include <stdio.h>
#include <unistd.h>
int main(void) { unlink("/box/main"); FILE *f = fopen("/box/main", "w"); if (f) fclose(f); puts("3"); return 0; }`;
  assert.deepEqual(await judgeC(deletesMain), ['AC', 'AC', 'AC'], 'the binary survives every test');

  const keepsState = String.raw`
#include <stdio.h>
#include <unistd.h>
int main(void) {
  if (access("/box/seen", F_OK) == 0 || access("/tmp/seen", F_OK) == 0) { puts("state from an earlier test"); return 0; }
  FILE *a = fopen("/box/seen", "w"); if (a) fclose(a);
  FILE *b = fopen("/tmp/seen", "w"); if (b) fclose(b);
  puts("3"); return 0;
}`;
  assert.deepEqual(await judgeC(keepsState), ['AC', 'AC', 'AC'], 'each test starts with a clean scratch space');
});

dtest('CPU burned by a child the program never waits for still counts toward the time limit (N4)', async () => {
  // The parent only waits on a pipe, never for the child, so the child's CPU is not in the parent's rusage.
  const sneaky =
    'import os, time\nr, w = os.pipe()\nif os.fork() == 0:\n    os.close(r)\n    t = time.process_time()\n    while time.process_time() - t < 2.5: pass\n    os._exit(0)\nos.close(w)\nos.read(r, 1)\nprint(3)\n';
  await withSession(pyFile(sneaky), async (session) => {
    const run = await runPy(session, '', { timeLimitMs: 1000 });
    assert.ok(run.timeMs >= 2_000, `measured ${run.timeMs} ms of CPU`);
    assert.equal(classifyRun(run, '3\n', limits({ timeLimitMs: 1000 })), 'TLE');
  });
});

dtest('leftovers of a finished program (a daemonised child) are killed', async () => {
  const daemon = 'import os, time\nif os.fork() == 0:\n    os.setsid(); time.sleep(100); os._exit(0)\nprint(3)\n';
  const count = "import os\nprint(len([p for p in os.listdir('/proc') if p.isdigit()]))\n";
  await withSession([{ name: 'p.py', content: daemon }, { name: 'count.py', content: count }], async (session) => {
    const run = await runPy(session, '1 2\n');
    assert.equal(run.stdout, '3\n');
    const after = await session.run(['python3', '-S', 'count.py'], '', limits());
    assert.ok(Number(after.stdout.trim()) <= 4, `daemon survived: ${after.stdout}`);
  });
});

dtest('output floods are cut at the cap with a sensible verdict (WA), in Python (EFBIG) and in C++ (SIGXFSZ)', async () => {
  const py = "import sys\nwhile True: sys.stdout.write('x' * 65536)\n";
  const cpp = '#include <cstdio>\nint main(){ for(;;) fwrite("xxxxxxxxxxxxxxxx", 1, 16, stdout); }';
  await withSession(pyFile(py), async (session) => {
    const started = Date.now();
    const run = await runPy(session, '', { timeLimitMs: 5000, maxOutputBytes: 4 * MIB });
    assert.equal(run.outputLimit, true);
    assert.ok(run.stdout.length <= 4 * MIB, `captured ${run.stdout.length} bytes`);
    assert.equal(classifyRun(run, '3\n', limits({ timeLimitMs: 5000 })), 'WA');
    assert.ok(Date.now() - started < 10_000);
  });
  const r = await judge.execute(job('cpp', cpp, { testCases: [SAMPLE_TESTS[0]] }));
  assert.equal(r.verdict, 'WA');
  assert.equal(r.testResults[0].message, 'Output limit exceeded');
});

dtest('large input and large output round-trip exactly through the exec pipes', async () => {
  const echo = 'import sys\ndata = sys.stdin.buffer.read()\nsys.stdout.buffer.write((str(len(data)) + "\\n").encode())\nsys.stdout.buffer.write(data[: 3 * 1024 * 1024])\n';
  const input = '0123456789abcdef'.repeat(512 * 1024); // 8 MiB
  const expected = `${input.length}\n${input.slice(0, 3 * 1024 * 1024)}`;
  const r = await judge.execute(job('python', echo, { timeLimitMs: 5000, testCases: [{ id: 'big', input, expectedOutput: expected, points: 1 }] }));
  assert.equal(r.verdict, 'AC', JSON.stringify(r).slice(0, 300));
});

dtest('a program that cannot be started is a runtime error with an explanation, not a crash of the sandbox', async () => {
  await withSession([], async (session) => {
    const run = await session.run(['./does-not-exist'], '', limits());
    assert.equal(run.startFailed, true);
    assert.equal(run.exitCode, 127);
    assert.match(run.stderr, /cannot start '\.\/does-not-exist': exec failed: No such file or directory/);
    assert.equal(classifyRun(run, '', limits()), 'RE');
  });
});

dtest('the program sees a clean, seekable stdin and cannot read anything of the harness', async () => {
  const probe = String.raw`
import os, sys, json
data = sys.stdin.read()
sys.stdin.seek(0)
again = sys.stdin.read()
print(json.dumps({'same': data == again, 'seekable': sys.stdin.seekable(), 'cwd': os.getcwd(), 'home': os.environ.get('HOME'),
                  'env': sorted(os.environ), 'files': sorted(os.listdir('/box')), 'fds': sorted(os.listdir('/proc/self/fd'))}))
`;
  await withSession(pyFile(probe), async (session) => {
    const run = await runPy(session, 'hello\nworld\n');
    const seen = JSON.parse(run.stdout) as Record<string, unknown>;
    assert.equal(seen.same, true);
    assert.equal(seen.seekable, true);
    assert.equal(seen.cwd, '/box');
    // CPython adds LC_CTYPE itself when it coerces the C locale to UTF-8 (PEP 538); everything else is ours.
    assert.deepEqual((seen.env as string[]).filter((k) => k !== 'LC_CTYPE'), ['HOME', 'PATH', 'TMPDIR'], 'a minimal environment: nothing of the container leaks in');
    assert.deepEqual(seen.files, ['p.py']);
    // 0,1,2 plus the descriptor of the directory listing itself
    assert.ok((seen.fds as string[]).length <= 4, `unexpected descriptors: ${seen.fds}`);
  });
});

dtest('two sessions at once (JUDGE_CONCURRENCY=2) do not disturb each other', async () => {
  const [a, b] = await Promise.all([
    judge.execute(job('cpp', AC_PROGRAMS[0][1])),
    judge.execute(job('python', AC_PROGRAMS[2][1])),
  ]);
  assert.equal(a.verdict, 'AC');
  assert.equal(b.verdict, 'AC');
});

dtest('JANITOR: an expired container is removed, a live one is left alone', async () => {
  const start = (deadlineAt: number) =>
    execFileSync(
      'docker',
      ['run', '-d', '--rm', '--init', '--network', 'none', '--label', 'oj.sandbox=1', '--label', `oj.deadline=${deadlineAt}`, image, 'sleep', '300'],
      { stdio: 'pipe' },
    ).toString().trim();
  const expired = start(Date.now() - 10 * 60_000);
  const alive = start(Date.now() + 10 * 60_000);
  try {
    const removed = await new SandboxSweeper(new ProcessDockerCli(), { log: () => undefined }).sweepOnce();
    assert.ok(removed.some((id) => expired.startsWith(id)), 'the expired container was swept');
    assert.ok(!removed.some((id) => alive.startsWith(id)), 'the live container was not');
    const running = execFileSync('docker', ['ps', '-q', '--no-trunc'], { stdio: 'pipe' }).toString();
    assert.ok(!running.includes(expired), 'expired container is gone');
    assert.ok(running.includes(alive), 'live container is still running');
  } finally {
    execFileSync('docker', ['rm', '-f', expired, alive], { stdio: 'pipe' });
  }
});

dtest('HANG: a job that outlives its deadline gets an IE result on time and its container is removed', async () => {
  const before = sandboxContainers();
  const sleeper = job('python', 'import time\ntime.sleep(120)\n', { timeLimitMs: 40_000, testCases: [SAMPLE_TESTS[0]] });
  const started = Date.now();
  const result = await judgeWithinDeadline(judge, sleeper, 5000, () => undefined);
  const took = Date.now() - started;
  assert.equal(result.verdict, 'IE');
  assert.match(result.compileOutput ?? '', /không phản hồi/);
  assert.ok(took >= 4500 && took < 9000, `result came at the deadline, not after the 120 s sleep (${took}ms)`);

  const waitUntil = Date.now() + 20_000;
  while (newSince(before, sandboxContainers()).length > 0 && Date.now() < waitUntil) await new Promise((r) => setTimeout(r, 500));
  assert.deepEqual(newSince(before, sandboxContainers()), [], 'the aborted job removed its container');
});
