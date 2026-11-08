import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { DOCKER_CALL_OVERHEAD_MS } from '../src/domain/resource-plan';
import {
  parseSupervisorReply,
  supervisorArgs,
  SupervisorFlags,
  SupervisorProtocolError,
} from '../src/infrastructure/supervisor-protocol';

const frame = (header: string, out: Buffer | string = '', err: Buffer | string = '') =>
  Buffer.concat([Buffer.from(header + '\n', 'latin1'), Buffer.from(out), Buffer.from(err)]);

test('parses a normal reply', () => {
  const r = parseSupervisorReply(frame('OJRUN1 0 0 12 15 3456 0 3 5', '3\n\0', 'oops!'));
  assert.deepEqual(
    { ...r, stdout: r.stdout.toString('latin1'), stderr: r.stderr.toString('latin1') },
    { exitStatus: 0, signal: 0, cpuMs: 12, wallMs: 15, rssKb: 3456, flags: 0, stdout: '3\n\0', stderr: 'oops!' },
  );
});

test('a program killed by a signal has exit -1 and a signal number', () => {
  const r = parseSupervisorReply(frame('OJRUN1 -1 11 1 1 1388 0 0 0'));
  assert.equal(r.exitStatus, -1);
  assert.equal(r.signal, 11);
});

test('flags are a bit mask', () => {
  const r = parseSupervisorReply(frame(`OJRUN1 -1 24 1998 2007 6484 ${SupervisorFlags.CPU_KILL | SupervisorFlags.OUTPUT_LIMIT} 0 0`));
  assert.ok(r.flags & SupervisorFlags.CPU_KILL);
  assert.ok(r.flags & SupervisorFlags.OUTPUT_LIMIT);
  assert.ok(!(r.flags & SupervisorFlags.WALL_TIMEOUT));
});

test('stdout and stderr are binary safe: every byte value, newlines and NULs included', () => {
  const all = Buffer.from(Array.from({ length: 256 }, (_, i) => i));
  const out = Buffer.concat([all, all, Buffer.from('OJRUN1 0 0 0 0 0 0 0 0\n')]);
  const err = Buffer.concat([Buffer.from('\n\n\0\0'), Buffer.from(all).reverse()]);
  const r = parseSupervisorReply(frame(`OJRUN1 0 0 1 1 1 0 ${out.length} ${err.length}`, out, err));
  assert.ok(r.stdout.equals(out));
  assert.ok(r.stderr.equals(err));
});

test('zero-length streams', () => {
  const r = parseSupervisorReply(frame('OJRUN1 7 0 0 0 0 0 0 0'));
  assert.equal(r.stdout.length, 0);
  assert.equal(r.stderr.length, 0);
  const onlyErr = parseSupervisorReply(frame('OJRUN1 0 0 0 0 0 0 0 3', '', 'abc'));
  assert.equal(onlyErr.stdout.length, 0);
  assert.equal(onlyErr.stderr.toString(), 'abc');
});

test('a 64 MiB reply parses without copying surprises', () => {
  const big = Buffer.alloc(64 * 1024 * 1024, 0x61);
  const r = parseSupervisorReply(frame(`OJRUN1 0 0 1 1 1 0 ${big.length} 0`, big));
  assert.equal(r.stdout.length, big.length);
});

const broken: [string, Buffer][] = [
  ['empty reply', Buffer.alloc(0)],
  ['no newline', Buffer.from('OJRUN1 0 0 0 0 0 0 0 0')],
  ['newline too far away', Buffer.concat([Buffer.from('OJRUN1 ' + '0 '.repeat(200)), Buffer.from('\n')])],
  ['wrong magic', frame('OJRUN2 0 0 0 0 0 0 0 0')],
  ['garbage', Buffer.from('Error response from daemon: No such container: oj-123\n')],
  ['only the magic', frame('OJRUN1')],
  ['too few fields', frame('OJRUN1 0 0 0 0 0 0 0')],
  ['too many fields', frame('OJRUN1 0 0 0 0 0 0 0 0 0')],
  ['double space', frame('OJRUN1  0 0 0 0 0 0 0 0')],
  ['non-numeric field', frame('OJRUN1 0 x 0 0 0 0 0 0')],
  ['float field', frame('OJRUN1 0 0 1.5 0 0 0 0 0')],
  ['hex field', frame('OJRUN1 0 0 0x10 0 0 0 0 0')],
  ['negative stdout length', frame('OJRUN1 0 0 0 0 0 0 -1 0')],
  ['negative stderr length', frame('OJRUN1 0 0 0 0 0 0 0 -4')],
  ['negative cpu time', frame('OJRUN1 0 0 -5 0 0 0 0 0')],
  ['negative signal', frame('OJRUN1 -1 -9 0 0 0 0 0 0')],
  ['body one byte short', frame('OJRUN1 0 0 0 0 0 0 3 2', '3\n', 'ab')],
  ['body cut in the middle of stderr', frame('OJRUN1 0 0 0 0 0 0 1 4', 'x', 'ab')],
  ['trailing garbage after the body', frame('OJRUN1 0 0 0 0 0 0 1 0', 'x', 'junk')],
  ['announces more than it sends', frame('OJRUN1 0 0 0 0 0 0 999999999999 0', 'x')],
  ['absurdly long number', frame('OJRUN1 0 0 0 0 0 0 99999999999999999999 0')],
];

for (const [name, buffer] of broken) {
  test(`rejects a broken reply: ${name}`, () => {
    assert.throws(() => parseSupervisorReply(buffer), SupervisorProtocolError);
  });
}

test('supervisorArgs builds the option list, ends with --, and rounds up', () => {
  assert.deepEqual(supervisorArgs({ cpuMs: 1000, wallMs: 4000, fsizeBytes: 4194304, maxInputBytes: 12 }), [
    '--cpu-ms', '1000', '--wall-ms', '4000', '--fsize-bytes', '4194304', '--max-input-bytes', '12', '--',
  ]);
  assert.deepEqual(supervisorArgs({ cpuMs: 0.2, wallMs: 0, fsizeBytes: 0, maxInputBytes: 0 }), [
    '--cpu-ms', '1', '--wall-ms', '1', '--fsize-bytes', '1', '--max-input-bytes', '0', '--',
  ]);
});

test('supervisorArgs refuses nonsense instead of passing it to a root process', () => {
  assert.throws(() => supervisorArgs({ cpuMs: Number.NaN, wallMs: 1, fsizeBytes: 1, maxInputBytes: 0 }), RangeError);
  assert.throws(() => supervisorArgs({ cpuMs: 1, wallMs: Infinity, fsizeBytes: 1, maxInputBytes: 0 }), RangeError);
  assert.throws(() => supervisorArgs({ cpuMs: 1, wallMs: 1, fsizeBytes: 1, maxInputBytes: -1 }), RangeError);
});

test("oj-run gives up reaping well before the engine stops waiting for its reply, so a stuck program's reply arrives (NF-3)", () => {
  const source = readFileSync(join(__dirname, '..', 'runner', 'oj-run.c'), 'utf8');
  const grace = Number(/#define REAP_GRACE_MS (\d+)/.exec(source)?.[1]);
  const killLeftoversMs = 50 * 10; // its fork retries
  assert.ok(Number.isFinite(grace));
  assert.ok(grace + killLeftoversMs + 1_000 <= DOCKER_CALL_OVERHEAD_MS, `reap grace ${grace} ms vs docker overhead ${DOCKER_CALL_OVERHEAD_MS} ms`);
});
