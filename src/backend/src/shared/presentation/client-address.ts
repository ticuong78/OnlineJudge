import { isIP, isIPv6 } from 'node:net';

/**
 * The key a client is limited under.
 *
 * An IPv4 address is itself. An IPv6 customer is handed a whole /64 (2^64 addresses) and can pick any of
 * them for each request, so limiting per full address would limit nobody: IPv6 clients are keyed by their /64.
 * IPv4-mapped IPv6 (`::ffff:1.2.3.4`, how a dual-stack socket reports IPv4 clients) is the IPv4 address.
 * Anything that is not an IP address (e.g. a forged X-Forwarded-For behind a misconfigured proxy) is one shared
 * "unknown" client, so a caller cannot choose the key it is limited under (audit R2-F7).
 */
export function clientAddress(ip: string | undefined): string {
  if (!ip || !isIP(ip.split('%')[0])) return 'unknown';
  const groups = expandIpv6(ip);
  if (!groups) return ip; // IPv4
  if (groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff) {
    return `${groups[6] >> 8}.${groups[6] & 255}.${groups[7] >> 8}.${groups[7] & 255}`;
  }
  return `${groups.slice(0, 4).map((g) => g.toString(16)).join(':')}::/64`;
}

/** The eight 16-bit groups of an IPv6 address, or null when `ip` is not IPv6. */
function expandIpv6(ip: string): number[] | null {
  let address = ip.split('%')[0].toLowerCase(); // drop a zone id (fe80::1%eth0)
  if (!isIPv6(address)) return null;

  const embedded = /(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(address); // ::ffff:1.2.3.4
  if (embedded) {
    const [a, b, c, d] = embedded.slice(1).map(Number);
    address = `${address.slice(0, embedded.index)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const [head, tail] = address.split('::');
  const first = head ? head.split(':') : [];
  const last = tail ? tail.split(':') : [];
  const zeros = tail === undefined ? 0 : 8 - first.length - last.length;
  const groups = [...first, ...Array(zeros).fill('0'), ...last].map((g) => parseInt(g, 16));
  return groups.length === 8 && groups.every((g) => Number.isInteger(g)) ? groups : null;
}
