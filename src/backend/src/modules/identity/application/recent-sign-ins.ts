/** How long a successful sign-in keeps its address exempt from the account-wide sign-in limit. */
export const RECENT_SIGN_IN_TTL_MS = 30 * 24 * 60 * 60_000;

/**
 * Port: remembers which client addresses recently signed in to which account.
 *
 * Used to exempt an owner's usual address from the account-wide sign-in limit: without it, anyone could lock a
 * teacher out during an exam just by guessing wrong passwords from a few addresses. An exempt address is still
 * held to the per-account-and-IP limit, so this does not open a way around guessing. Production keeps it in
 * Redis, so the exemption survives restarts and cannot be pushed out by other sign-ins.
 */
export abstract class RecentSignIns {
  abstract record(account: string, client: string): Promise<void>;
  abstract has(account: string, client: string): Promise<boolean>;
  /** Drops every address of this account, e.g. when its password changes: an address used before may have been an attacker's. */
  abstract forget(account: string): Promise<void>;
}
