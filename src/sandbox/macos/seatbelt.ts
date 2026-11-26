import type { SandboxPolicy } from "../../policy/resolve.js";
import type { PathKind } from "../path-kind.js";

export interface SeatbeltExtras {
  /** System locations every program needs to read (runtime, libraries, the tool's install). */
  systemReadOnly: string[];
  /** Private temp folder for this run. */
  tmpDir: string;
  /** Port of the local proxy, used in allowlist mode. */
  proxyPort: number | undefined;
  /** What each read-write grant is on disk. Folders are granted as a subtree; anything else by prefix. */
  kindOf?: (path: string) => PathKind;
}

/** System services nearly every program talks to. Keychain access is left out on purpose. */
const MACH_SERVICES = [
  "com.apple.system.opendirectoryd.libinfo",
  "com.apple.system.logger",
  "com.apple.system.notification_center",
  "com.apple.logd",
  "com.apple.trustd.agent",
  "com.apple.FSEvents",
  "com.apple.SystemConfiguration.configd",
  "com.apple.diagnosticd",
];

const quote = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
const subpath = (p: string) => `(subpath ${quote(p)})`;
/**
 * `<path>` and anything starting with it (`<path>.tmp`, `<path>.3f9a1c`): the
 * temp files programs write next to a file before renaming them over it.
 */
const prefix = (p: string) =>
  `(regex #"^${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/"/g, '\\"')}")`;

/**
 * Build a Seatbelt (SBPL) profile. The kernel evaluates rules in order and
 * the last match wins, so hidden paths are denied after all grants.
 */
export function buildSeatbeltProfile(policy: SandboxPolicy, extra: SeatbeltExtras): string {
  const lines = [
    "(version 1)",
    "(deny default)",
    "",
    "; processes",
    "(allow process-fork)",
    "(allow process-exec)",
    "(allow signal (target same-sandbox))",
    "(allow sysctl-read)",
    "(allow ipc-posix-shm)",
    "(allow pseudo-tty)",
    `(allow mach-lookup ${MACH_SERVICES.map((s) => `(global-name ${quote(s)})`).join(" ")})`,
    "",
    "; metadata (stat, realpath) everywhere; file contents only where granted",
    "(allow file-read-metadata)",
    "",
    "; terminals and devices",
    `(allow file-read* file-write* file-ioctl (literal "/dev/null") (literal "/dev/tty") (literal "/dev/ptmx") (regex #"^/dev/ttys[0-9]+$"))`,
    `(allow file-read* (literal "/dev/urandom") (literal "/dev/random") (literal "/dev/zero"))`,
    "",
    "; system (read-only)",
    ...extra.systemReadOnly.map((p) => `(allow file-read* ${subpath(p)})`),
    "",
    "; granted by the profile",
    ...policy.readOnly.map((p) => `(allow file-read* ${subpath(p)})`),
    ...[...policy.readWrite, extra.tmpDir].map((p) => {
      const isDir =
        p === policy.cwd || p === extra.tmpDir || (extra.kindOf?.(p) ?? "dir") === "dir";
      return `(allow file-read* file-write* ${isDir ? subpath(p) : prefix(p)})`;
    }),
    "",
    "; hidden (must stay after the grants)",
    ...policy.hidden.map((p) => `(deny file-read* file-write* ${subpath(p)})`),
    "",
    "; network",
    ...networkRules(policy.network.mode, extra.proxyPort),
  ];
  return lines.join("\n") + "\n";
}

function networkRules(
  mode: SandboxPolicy["network"]["mode"],
  proxyPort: number | undefined,
): string[] {
  switch (mode) {
    case "open":
      return ["(allow network*)", "(allow system-socket)"];
    case "allowlist":
      if (proxyPort === undefined) throw new Error("allowlist mode needs a proxy port");
      return [`(allow network-outbound (remote ip "localhost:${proxyPort}"))`];
    case "off":
      return ["; none"];
  }
}
