import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Actor } from '../src/shared/application/actor.js';
import { ProblemService } from '../src/modules/catalog/application/problem.service.js';
import { UnshareChecks } from '../src/modules/catalog/application/unshare-checks.js';
import { Problem, ResourceLimits, Sharing } from '../src/modules/catalog/domain/problem.js';
import type { ProblemQueries, ProblemRepository } from '../src/modules/catalog/domain/problem.repository.js';
import type { EventPublisher } from '../src/shared/application/event-publisher.js';

const lan: Actor = { id: 't1', role: 'TEACHER', name: 'Lan' };
const minh: Actor = { id: 't2', role: 'TEACHER', name: 'Minh' };

let seq = 1;
function problem(title: string, isPublic: boolean): Problem {
  const p = Problem.create(seq++, { id: lan.id, name: lan.name }, {
    title, difficulty: 'EASY', tags: [], statement: 'Tính a + b.', inputFormat: 'a, b', outputFormat: 'a + b', constraints: '',
  }, ResourceLimits.default);
  p.addTestCase({ input: '1 2\n', expectedOutput: '3\n', isSample: true, points: 10 });
  if (isPublic) p.share(Sharing.of(true, false, false));
  return p;
}

function setup(problems: Problem[], checks = new UnshareChecks()) {
  const byId = new Map(problems.map((p) => [p.id, p]));
  const saved: Problem[] = [];
  const repo = {
    findById: async (id: string) => byId.get(id) ?? null,
    nextSeq: async () => seq++,
    save: async (p: Problem) => void saved.push(p),
  } as unknown as ProblemRepository;
  const service = new ProblemService(repo, {} as ProblemQueries, {} as EventPublisher, {} as never, {} as never, {} as never, checks);
  return { service, saved };
}

test('a problem used by a public set cannot be made private', async () => {
  const p = problem('Tổng', true);
  const checks = new UnshareChecks();
  checks.register(async (id) => (id === p.id ? 'Bài này đang nằm trong đề công khai "Đề 1".' : null));
  const { service, saved } = setup([p], checks);

  await assert.rejects(service.share(lan, p.id, { isPublic: false, publicTests: false, publicSolution: false, organizationIds: [] }), /đề công khai "Đề 1"/);
  assert.equal(p.sharing.isPublic, true);
  assert.equal(saved.length, 0);

  // Sharing more (or less) of a problem that stays public is fine.
  await service.share(lan, p.id, { isPublic: true, publicTests: true, publicSolution: false, organizationIds: [] });
  assert.equal(p.sharing.publicTests, true);
});

test('a problem no public set uses can be made private', async () => {
  const p = problem('Tổng', true);
  const checks = new UnshareChecks();
  checks.register(async () => null);
  const { service } = setup([p], checks);
  await service.share(lan, p.id, { isPublic: false, publicTests: false, publicSolution: false, organizationIds: [] });
  assert.equal(p.sharing.isPublic, false);
});

test('copying a set is all or nothing', async () => {
  const shared = problem('Tổng', true);
  const hidden = problem('Hiệu', false);
  const { service, saved } = setup([shared, hidden]);

  await assert.rejects(service.copyManyToBank(minh, [shared.id, hidden.id]), new RegExp(`${hidden.code} chưa công khai`));
  assert.equal(saved.length, 0, 'no stray copy of the problems before the private one');

  const copies = await service.copyManyToBank(minh, [shared.id]);
  assert.equal(copies[0].owner.id, minh.id);
  assert.equal(saved.length, 1);
});
