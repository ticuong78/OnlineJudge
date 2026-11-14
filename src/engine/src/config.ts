export interface EngineConfig {
  redisUrl: string;
  concurrency: number;
  sandbox: 'docker' | 'local';
  runnerImage: string;
  /** Memory cap of a sandbox container while it compiles; lowered to the run cap before the tests. */
  compileMemoryMb: number;
}

const DEFAULT_COMPILE_MEMORY_MB = 768;

export function loadConfig(env = process.env): EngineConfig {
  const sandbox = env.SANDBOX === 'local' ? 'local' : 'docker';
  const compileMemoryMb = Number(env.COMPILE_MEMORY_MB ?? DEFAULT_COMPILE_MEMORY_MB);
  return {
    redisUrl: env.REDIS_URL ?? 'redis://localhost:6379',
    concurrency: Math.max(1, Number(env.JUDGE_CONCURRENCY ?? 2)),
    sandbox,
    runnerImage: env.RUNNER_IMAGE ?? 'oj-runner:latest',
    // g++ needs ~250 MB for bits/stdc++.h; never go below what a normal compile needs.
    compileMemoryMb: Number.isFinite(compileMemoryMb) ? Math.max(256, Math.round(compileMemoryMb)) : DEFAULT_COMPILE_MEMORY_MB,
  };
}
