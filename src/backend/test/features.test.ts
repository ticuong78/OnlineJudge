import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type Anthropic from '@anthropic-ai/sdk';
import { AiAvailability } from '../src/shared/application/ai-availability.js';
import { ClaudeClient } from '../src/shared/infrastructure/claude.js';
import { FeaturesController } from '../src/shared/presentation/features.controller.js';
import { ROLES } from '../src/shared/presentation/decorators.js';
import { SharedModule } from '../src/shared/shared.module.js';

// OJ-13 (UAT L9): staff screens disable AI controls when the server has no Claude key.

const models = { examReader: 'm', testCases: 'm', aiUsageReview: 'm' };

test('GET /features says only whether AI is set up, never the key or the model', () => {
  assert.deepEqual(new FeaturesController(new ClaudeClient(null, models)).get(), { ai: false });
  assert.deepEqual(new FeaturesController(new ClaudeClient({} as Anthropic, models)).get(), { ai: true });
});

test('GET /features is for staff only', () => {
  assert.deepEqual(Reflect.getMetadata(ROLES, FeaturesController), ['ADMIN', 'TEACHER']);
});

test('the features route reads the AI port, which the shared module backs with the Claude client', () => {
  assert.ok((Reflect.getMetadata('controllers', SharedModule) as unknown[]).includes(FeaturesController));
  const providers = Reflect.getMetadata('providers', SharedModule) as { provide: unknown; useExisting?: unknown }[];
  assert.equal(providers.find((p) => p.provide === AiAvailability)?.useExisting, ClaudeClient);
});
