import { expandPath, type PathContext } from "./paths.js";
import type { NetworkMode, Profile } from "./profile.js";

/**
 * The concrete rules a sandbox backend enforces. All paths are absolute and
 * canonical; nothing here needs further interpretation.
 */
export interface SandboxPolicy {
  cwd: string;
  toolHome: string;
  readWrite: string[];
  readOnly: string[];
  hidden: string[];
  network: { mode: NetworkMode; allow: string[] };
  envPass: string[];
  gitPush: boolean;
}

export function resolvePolicy(profile: Profile, ctx: PathContext): SandboxPolicy {
  const expandAll = (paths: string[]) => paths.map((p) => expandPath(p, ctx));
  const cwd = expandPath(ctx.cwd, ctx);
  const toolHome = expandPath(ctx.toolHome, ctx);
  return {
    cwd,
    toolHome,
    readWrite: unique([cwd, toolHome, ...expandAll(profile.files.read_write)]),
    readOnly: unique(expandAll(profile.files.read_only)),
    hidden: unique(expandAll(profile.files.hidden)),
    network: {
      mode: profile.network.mode,
      allow: unique(profile.network.allow.map(normalizeHost)),
    },
    envPass: [...profile.env.pass],
    gitPush: profile.git.push,
  };
}

const unique = (items: string[]): string[] => [...new Set(items)];

export const normalizeHost = (host: string): string =>
  host.trim().toLowerCase().replace(/\.+$/, "");
