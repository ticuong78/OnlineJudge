import { Baseline1793923200000 } from './1793923200000-baseline.js';
import { Oj1ToOj241794528000000 } from './1794528000000-oj1-to-oj24.js';
import { NormalizeTopics1794528060000 } from './1794528060000-normalize-topics.js';
import { FirstReviews1794624915638 } from './1794624915638-first-reviews.js';

/**
 * Every migration, oldest first (OJ-5, ADR 0003). Listed by class rather than found by a file pattern, so the same list
 * works from `src` (tsx, tests) and from `dist` (production). Add each new migration here.
 */
export const MIGRATIONS = [Baseline1793923200000, Oj1ToOj241794528000000, NormalizeTopics1794528060000, FirstReviews1794624915638];
