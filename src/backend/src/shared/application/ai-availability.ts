/**
 * Port: whether the server can call Claude at all (a key is configured). Different from AiAccess, which says whether
 * one account may use AI. Implemented by ClaudeClient (shared infrastructure); presentation reads it through this
 * port so it never depends on the infrastructure class.
 */
export abstract class AiAvailability {
  abstract readonly enabled: boolean;
}
