import { runProcess, type SpawnOptions, type SpawnResult } from './process';

/** Seam over the `docker` command line so the janitor and the self-check can be tested without a daemon. */
export interface DockerCli {
  run(args: string[], options: SpawnOptions): Promise<SpawnResult>;
}

export class ProcessDockerCli implements DockerCli {
  run(args: string[], options: SpawnOptions): Promise<SpawnResult> {
    return runProcess('docker', args, options);
  }
}
