import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

/**
 * Guard rail: an endpoint anyone can call without signing in must say how often. Adding a `@Public()` route
 * without a `@RateLimit(...)` fails here, so an unthrottled door cannot slip in unnoticed.
 */

/** Public routes that limit themselves inside their use case instead (only wrong passwords count against a client). */
const SELF_THROTTLED = new Set(['login']);

function controllerFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return controllerFiles(path);
    return /controllers?\.ts$/.test(name) ? [path] : [];
  });
}

test('every public endpoint is rate limited', () => {
  const files = controllerFiles(join(__dirname, '../src/modules'));
  assert.ok(files.length >= 5, 'the scan found the controllers');

  const unlimited: string[] = [];
  let publicRoutes = 0;
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/@Public\(\)/g)) {
      publicRoutes++;
      // the decorators of this route run until the method signature, e.g. "\n  verifyRegistration("
      const rest = source.slice(match.index);
      const signature = /\n\s+(?:async\s+)?([A-Za-z]\w*)\(/.exec(rest);
      assert.ok(signature, `${file}: cannot find the method after @Public()`);
      const decorators = rest.slice(0, signature.index);
      if (!decorators.includes('@RateLimit(') && !SELF_THROTTLED.has(signature[1])) unlimited.push(`${file.split('/src/')[1]} -> ${signature[1]}()`);
    }
  }
  assert.ok(publicRoutes >= 8, `expected to find the public auth routes, found ${publicRoutes}`);
  assert.deepEqual(unlimited, [], 'public endpoints without @RateLimit');
});

test('the self-throttled exception is real: login counts wrong passwords in its use case', () => {
  const service = readFileSync(join(__dirname, '../src/modules/identity/application/account.service.ts'), 'utf8');
  assert.match(service, /async login\([^)]*clientIp[^)]*\)[\s\S]*?LOGIN_PER_ACCOUNT_AND_IP[\s\S]*?LOGIN_PER_IP/);
});

/**
 * CLAUDE.md security rule 1: every route says who may call it, with `@Roles(...)` (on the route or its controller) or
 * `@Public()`. These routes rely on the global sign-in check and check ownership in their use case instead; they are
 * pinned here so the list can only shrink. A new route without `@Roles`/`@Public` fails this test.
 */
const ANY_SIGNED_IN_USER = new Set([
  'AuthController.me', 'ClassroomsController.list', 'ClassroomsController.get',
  'ClassThreadsController.list', 'ClassThreadsController.create',
  'ThreadsController.get', 'ThreadsController.reply', 'ThreadsController.delete', 'ThreadsController.deleteReply', 'ThreadsController.pin',
  'SessionsController.list', 'SessionsController.get', 'SessionsController.problem', 'SessionsController.start',
  'ProgressController.me', 'SubmissionsController.submit', 'SubmissionsController.list', 'SubmissionsController.get',
]);

test('every route declares its roles or is public (CLAUDE.md security rule 1)', () => {
  const undeclared: string[] = [];
  let routes = 0;
  for (const file of controllerFiles(join(__dirname, '../src/modules'))) {
    const source = readFileSync(file, 'utf8');
    for (const cls of source.matchAll(/((?:@\w+\([^)]*\)\s*)+)export class (\w+)/g)) {
      const start = cls.index + cls[0].length;
      const next = source.indexOf('export class', start);
      const body = source.slice(start, next < 0 ? undefined : next);
      const classDeclares = /@Roles\(|@Public\(/.test(cls[1]);
      for (const m of body.matchAll(/((?:\s*@[A-Z]\w*\([^)]*\)[^\n]*)+)\n\s+(?:async\s+)?(\w+)\(/g)) {
        if (!/@(Get|Post|Put|Delete|Patch)\(/.test(m[1])) continue;
        routes++;
        if (!classDeclares && !/@Roles\(|@Public\(/.test(m[1])) undeclared.push(`${cls[2]}.${m[2]}`);
      }
    }
  }
  assert.ok(routes >= 100, `the scan found the routes (${routes})`);
  assert.deepEqual(undeclared.filter((r) => !ANY_SIGNED_IN_USER.has(r)), [], 'routes without @Roles or @Public');
  assert.deepEqual([...ANY_SIGNED_IN_USER].filter((r) => !undeclared.includes(r)), [], 'remove routes from ANY_SIGNED_IN_USER once they declare @Roles');
});
