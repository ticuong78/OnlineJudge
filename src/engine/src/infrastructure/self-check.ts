import type { DockerCli } from './docker-cli';
import { RUNNER_IMAGE_VERSION } from './supervisor-protocol';

/**
 * Startup check for docker mode. Returns the problems found (empty = ready). Failing here, loudly, is better than
 * accepting jobs and turning every one into an internal error.
 */
export async function checkDockerRunner(docker: DockerCli, image: string): Promise<string[]> {
  const server = await docker
    .run(['version', '--format', '{{.Server.Version}}'], { timeoutMs: 15_000 })
    .catch((error: Error) => ({ exitCode: 1, timedOut: false, stdout: '', stderr: error.message }));
  if (server.timedOut || server.exitCode !== 0 || !server.stdout.trim()) {
    const why = server.timedOut ? 'the daemon did not answer in 15 s' : server.stderr.trim().split('\n')[0] || 'no answer';
    return [`Docker is not reachable (${why}). Start Docker, or run the engine with SANDBOX=local for development.`];
  }

  const inspected = await docker
    .run(['image', 'inspect', image, '--format', '{{index .Config.Labels "oj.runner.version"}}'], { timeoutMs: 15_000 })
    .catch((error: Error) => ({ exitCode: 1, timedOut: false, stdout: '', stderr: error.message }));
  if (inspected.timedOut || inspected.exitCode !== 0) {
    return [`The runner image "${image}" is not available. Build it with: pnpm runner:build`];
  }
  const version = inspected.stdout.trim();
  if (version !== RUNNER_IMAGE_VERSION) {
    return [
      `The runner image "${image}" is out of date (version "${version || 'none'}", this engine needs "${RUNNER_IMAGE_VERSION}"). ` +
        'Rebuild it with: pnpm runner:build',
    ];
  }
  return [];
}
