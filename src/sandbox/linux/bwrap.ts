import type { SandboxPolicy } from "../../policy/resolve.js";

import type { PathKind } from "../path-kind.js";

export type { PathKind };

export interface BwrapExtras {
  /** The user's real home folder, replaced by an empty one inside. */
  home: string;
  /**
   * Private folder mounted as the home instead of an empty in-memory one, so
   * granted files copied into it can be saved by rename (see `run/stage.ts`).
   */
  stagedHome?: string | undefined;
  /** System locations every program needs to read (runtime, libraries, the tool's install). */
  systemReadOnly: string[];
  /** Private temp folder for this run. */
  tmpDir: string;
  /**
   * An empty regular file used to cover hidden files. /dev/null cannot be
   * used: device files on mounts inside a user namespace cannot be opened.
   */
  emptyFile: string;
  /** Unix socket of the local proxy, used in allowlist mode. */
  proxySocket: string | undefined;
  /**
   * Real location of /etc/resolv.conf when it is a link outside /etc
   * (WSL: /mnt/wsl/resolv.conf, systemd-resolved: /run/systemd/resolve/...).
   * Only mounted in open mode, where the sandbox does its own DNS.
   */
  resolvConf?: string | undefined;
  /** Injected so the builder stays pure and testable. */
  kindOf: (path: string) => PathKind;
}

/**
 * Build bubblewrap arguments. bwrap applies mounts in order and a later mount
 * covers anything earlier at the same place, so the layout is:
 * empty /tmp and home -> system (ro) -> grants -> hidden overlays -> proxy socket.
 * System grants must come after the empty home: Node from nvm and npm-global
 * tools live inside the home folder.
 */
export function buildBwrapArgs(
  policy: SandboxPolicy,
  extra: BwrapExtras,
  command: string,
  args: string[],
): string[] {
  if (policy.network.mode === "allowlist" && !extra.proxySocket) {
    throw new Error("allowlist mode needs a proxy socket");
  }
  // bwrap resolves a relative mount source from its own working folder but the
  // target from the sandbox root, so "./bin" would be mounted over /bin.
  const paths = [
    extra.home,
    extra.tmpDir,
    extra.emptyFile,
    ...(extra.stagedHome ? [extra.stagedHome] : []),
    ...(extra.proxySocket ? [extra.proxySocket] : []),
    ...(extra.resolvConf ? [extra.resolvConf] : []),
    ...extra.systemReadOnly,
    policy.cwd,
    ...policy.readOnly,
    ...policy.readWrite,
    ...policy.hidden,
  ];
  const relative = paths.find((p) => !p.startsWith("/"));
  if (relative !== undefined) throw new Error(`sandbox paths must be absolute, got "${relative}"`);
  const out = ["--die-with-parent", "--unshare-all"];
  if (policy.network.mode === "open") out.push("--share-net");
  out.push("--proc", "/proc", "--dev", "/dev");

  out.push("--tmpfs", "/tmp");
  if (extra.stagedHome) out.push("--bind", extra.stagedHome, extra.home);
  else out.push("--tmpfs", extra.home);
  for (const p of extra.systemReadOnly) out.push("--ro-bind-try", p, p);
  if (policy.network.mode === "open" && extra.resolvConf) {
    out.push("--ro-bind-try", extra.resolvConf, extra.resolvConf);
  }
  out.push("--bind", extra.tmpDir, extra.tmpDir);

  for (const p of policy.readOnly) out.push("--ro-bind-try", p, p);
  for (const p of policy.readWrite) {
    out.push(p === policy.cwd ? "--bind" : "--bind-try", p, p);
  }

  for (const p of policy.hidden) {
    const kind = extra.kindOf(p);
    if (kind === "dir") out.push("--tmpfs", p);
    else if (kind === "file") out.push("--ro-bind", extra.emptyFile, p);
  }

  if (extra.proxySocket) out.push("--bind", extra.proxySocket, extra.proxySocket);
  out.push("--chdir", policy.cwd, "--", command, ...args);
  return out;
}
