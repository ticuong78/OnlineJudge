import type { Locale } from './config';
import type { Messages } from './messages';

// Typed keys for useTranslations / createTranslator: a key that is not in the Vietnamese dictionary is a type error.
declare module 'use-intl' {
  interface AppConfig {
    Locale: Locale;
    Messages: Messages;
  }
}
