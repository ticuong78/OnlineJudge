/** Containers created by the engine carry these labels so a janitor can tell expired ones from live ones. */
export const SANDBOX_LABEL = 'oj.sandbox';
/** Epoch ms after which the container is garbage (job deadline); the sweeper removes it a grace period later. */
export const DEADLINE_LABEL = 'oj.deadline';
/** Extra life a container gets past its deadline before it removes itself (and before the sweeper may remove it). */
export const CONTAINER_GRACE_MS = 120_000;
