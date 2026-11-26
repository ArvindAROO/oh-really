import { homedir } from "node:os";
import { join } from "node:path";
import { BUILTIN_PROFILES_DIR } from "../policy/builtin.js";
import { loadProfile } from "../policy/load.js";
import type { NetworkMode, Profile } from "../policy/profile.js";
import { resolvePolicy, type SandboxPolicy } from "../policy/resolve.js";
import { appDirs } from "./dirs.js";

export interface Overrides {
  /** Extra read-write folders granted on the command line. */
  rw?: string[];
  /** Network mode chosen on the command line. */
  net?: NetworkMode;
}

export interface Prepared {
  toolName: string;
  home: string;
  policy: SandboxPolicy;
  /** Every profile file that contributed, in order. */
  sources: string[];
}

/** Load the profile for `command` and resolve it into concrete rules. No side effects. */
export function prepare(
  command: string,
  cwd: string,
  env: Record<string, string | undefined>,
  overrides: Overrides = {},
): Prepared {
  const home = homedir();
  const dirs = appDirs({ platform: process.platform, home, env });
  const loaded = loadProfile({
    command,
    builtinDir: BUILTIN_PROFILES_DIR,
    userDir: dirs.profiles,
    cwd,
  });
  const profile = applyOverrides(loaded.profile, overrides);
  const toolName = profile.tool.name ?? "default";
  const policy = resolvePolicy(profile, { cwd, home, toolHome: join(dirs.homes, toolName) });
  return { toolName, home, policy, sources: loaded.sources };
}

function applyOverrides(profile: Profile, overrides: Overrides): Profile {
  return {
    ...profile,
    files: { ...profile.files, read_write: [...profile.files.read_write, ...(overrides.rw ?? [])] },
    network: { ...profile.network, mode: overrides.net ?? profile.network.mode },
  };
}
