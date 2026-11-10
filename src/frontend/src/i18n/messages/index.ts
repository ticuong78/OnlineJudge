import type { Locale } from '../config';
import { en } from './en';
import { vi, type Messages } from './vi';

export type { Messages };

/** All dictionaries by locale. `en` is checked against `vi` key by key (Dict<...> with `satisfies`). */
export const MESSAGES: Record<Locale, Messages> = { vi, en };
