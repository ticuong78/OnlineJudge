/**
 * Integration suites run only against throwaway services (docker-compose.test.yml: 55432 / 56379), never against the
 * development Postgres or Redis (5432 / 6379), whose data they would mix with. In CI the services are themselves
 * throwaway, so the development ports are accepted there.
 *   pnpm infra:test:up   then   pnpm test:integration
 */
const DEV_PORTS: Record<string, string> = { TEST_DATABASE_URL: '5432', TEST_REDIS_URL: '6379' };

export function throwaway(variable: 'TEST_DATABASE_URL' | 'TEST_REDIS_URL'): { url: string | undefined; skip: string | false } {
  const url = process.env[variable];
  if (!url) return { url, skip: `set ${variable} (pnpm infra:test:up, then pnpm test:integration) to run these tests` };
  const port = new URL(url).port || DEV_PORTS[variable];
  if (port === DEV_PORTS[variable] && !process.env.CI) {
    throw new Error(`${variable} points at the development ${variable === 'TEST_DATABASE_URL' ? 'Postgres' : 'Redis'} (port ${port}). ` +
      'Use the throwaway stack instead: pnpm infra:test:up, then pnpm test:integration.');
  }
  return { url, skip: false };
}
