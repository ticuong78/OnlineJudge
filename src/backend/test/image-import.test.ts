import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Actor } from '../src/shared/application/actor.js';
import type { DomainError } from '../src/shared/domain/domain-error.js';
import { documentFileProblem, imageMediaType, MAX_IMAGE_BYTES } from '../src/modules/importing/domain/document-file.js';
import { ImportService } from '../src/modules/importing/application/import.service.js';
import { quotaFor } from './support/ai-fakes.js';

/** OJ-23: importing a photo of a problem (VIP). */

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBPVP8 ')]);
const code = (p: Promise<unknown>) => p.then(() => 'ok', (e: DomainError) => e.code);

test('images are accepted by their signature, and refused when renamed or larger than 5 MB', () => {
  assert.equal(documentFileProblem({ originalName: 'de.png', buffer: PNG }), null);
  assert.equal(documentFileProblem({ originalName: 'DE.JPG', buffer: JPG }), null);
  assert.equal(documentFileProblem({ originalName: 'de.jpeg', buffer: JPG }), null);
  assert.equal(documentFileProblem({ originalName: 'de.webp', buffer: WEBP }), null);
  assert.equal(documentFileProblem({ originalName: 'de.png', buffer: Buffer.from('not an image') })?.code, 'import.invalid_file');
  assert.equal(documentFileProblem({ originalName: 'de.png', buffer: Buffer.concat([PNG, Buffer.alloc(MAX_IMAGE_BYTES)]) })?.code, 'import.image_too_large');
  assert.equal(documentFileProblem({ originalName: 'de.gif', buffer: Buffer.from('GIF89a') })?.code, 'import.unsupported_type');
  assert.deepEqual(['a.png', 'a.jpg', 'a.webp', 'a.pdf'].map(imageMediaType), ['image/png', 'image/jpeg', 'image/webp', null]);
});

const teacher: Actor = { id: 't1', role: 'TEACHER', name: 'Lan' };
const photo = { originalName: 'de-thi.png', mimeType: 'image/png', buffer: PNG };
const draft = { title: 'Tổng', difficulty: 'EASY' as const, statement: 'Tính a + b.', inputFormat: 'a, b', outputFormat: 'a + b', constraints: '', timeLimitMs: 1000, memoryLimitMb: 256, tests: [], warnings: [] };

function service(plan: 'FREE' | 'PLUS', reader: { available: boolean; read?: (f: unknown, d: unknown) => Promise<unknown[]> }) {
  const q = quotaFor({ t1: plan });
  const seen: unknown[] = [];
  const s = new ImportService({ read: async () => { throw new Error('documents only'); } } as never,
    { read: async (f: unknown, d: unknown) => { seen.push(d); return [draft]; }, ...reader } as never, {} as never, q.quota);
  return { s, store: q.store, seen };
}

test('a VIP teacher\'s photo is read by AI (no text extraction first) and counts one IMAGE_IMPORT use', async () => {
  const { s, store, seen } = service('PLUS', { available: true });
  const parsed = await s.parse(teacher, photo);
  assert.equal(parsed.parser, 'AI');
  assert.equal(parsed.drafts[0].title, 'Tổng');
  assert.deepEqual(seen, [null], 'the image goes to the AI reader as it is');
  assert.deepEqual([...store.counts.entries()].map(([k, v]) => [k.split('|')[1], v]), [['IMAGE_IMPORT', 1]]);
});

test('a free teacher is told photos need VIP; without a key photos are refused with a clear message', async () => {
  assert.equal(await code(service('FREE', { available: true }).s.parse(teacher, photo)), 'ai.vip_required');
  assert.equal(await code(service('PLUS', { available: false }).s.parse(teacher, photo)), 'import.image_needs_ai');
});

test('a photo the AI cannot read gives its use back', async () => {
  const { s, store } = service('PLUS', { available: true, read: async () => { throw new Error('blurry'); } });
  assert.equal(await code(s.parse(teacher, photo)), 'import.image_unreadable');
  assert.deepEqual([...store.counts.values()], [0]);
});
