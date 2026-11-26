import { normalizeHost } from "../policy/resolve.js";

const WEB_PORTS = [80, 443];

interface Rule {
  host: string;
  wildcard: boolean;
  ports: number[];
}

/** "github.com:22" -> { host: "github.com", ports: [22] }, "[::1]:8080" also works. */
function parseRule(rule: string): Rule {
  const match = /^(\[[^\]]+\]|[^:]+)(?::(\d+))?$/.exec(rule.trim());
  const rawHost = match?.[1] ?? rule;
  const host = normalizeHost(rawHost.replace(/^\[|\]$/g, ""));
  const wildcard = host.startsWith("*.");
  return {
    host: wildcard ? host.slice(1) : host, // keep the leading dot: ".example.com"
    wildcard,
    ports: match?.[2] ? [Number(match[2])] : WEB_PORTS,
  };
}

const validPort = (port: number) => Number.isInteger(port) && port > 0 && port < 65536;

/**
 * Decide whether the sandboxed program may connect to host:port.
 * `*.example.com` covers subdomains only, never example.com itself.
 */
export function isAllowed(host: string, port: number, rules: readonly string[]): boolean {
  if (!validPort(port)) return false;
  const wanted = normalizeHost(host.replace(/^\[|\]$/g, ""));
  return rules.some((raw) => {
    const rule = parseRule(raw);
    if (!rule.ports.includes(port)) return false;
    return rule.wildcard ? wanted.endsWith(rule.host) : wanted === rule.host;
  });
}
