import { type NetworkMode, type Profile, ProfileError, type ProfileLayer } from "./profile.js";

const union = (a: string[] | undefined, b: string[] | undefined): string[] | undefined =>
  a === undefined && b === undefined ? undefined : [...new Set([...(a ?? []), ...(b ?? [])])];

/** Drop keys whose value is undefined so merged layers stay structurally clean. */
function compact<T extends object>(obj: T): T | undefined {
  const entries = Object.entries(obj).filter(([, v]) => v !== undefined);
  return entries.length === 0 ? undefined : (Object.fromEntries(entries) as T);
}

/**
 * Layer a user's own profile on top of a built-in one. The user owns their
 * machine, so this may widen access: lists are unioned, single values override.
 */
export function extendLayer(base: ProfileLayer, over: ProfileLayer): ProfileLayer {
  const merged: ProfileLayer = {
    tool: compact({
      name: over.tool?.name ?? base.tool?.name,
      match: union(base.tool?.match, over.tool?.match),
    }),
    files: compact({
      read_write: union(base.files?.read_write, over.files?.read_write),
      read_only: union(base.files?.read_only, over.files?.read_only),
      hidden: union(base.files?.hidden, over.files?.hidden),
    }),
    network: compact({
      mode: over.network?.mode ?? base.network?.mode,
      allow: union(base.network?.allow, over.network?.allow),
    }),
    env: compact({ pass: union(base.env?.pass, over.env?.pass) }),
    git: compact({ push: over.git?.push ?? base.git?.push }),
  };
  return compact(merged) ?? {};
}

const STRICTNESS: Record<NetworkMode, number> = { off: 0, allowlist: 1, open: 2 };

/**
 * Apply a project's `.oh-really.toml`. A project file comes with the code,
 * which may be untrusted, so it can only take access away, never add it.
 */
export function narrowProfile(profile: Profile, project: ProfileLayer, source: string): Profile {
  const refuse = (key: string): never => {
    throw new ProfileError(
      `${source}: "${key}" is not allowed in a project file. Project files can only restrict ` +
        `access; put it in your own profile instead.`,
    );
  };
  if (project.tool) refuse("tool");
  if (project.env) refuse("env.pass");
  if (project.files?.read_write) refuse("files.read_write");
  if (project.files?.read_only) refuse("files.read_only");

  const mode = project.network?.mode ?? profile.network.mode;
  if (STRICTNESS[mode] > STRICTNESS[profile.network.mode]) refuse(`network.mode = "${mode}"`);

  const projectAllow = project.network?.allow;
  return {
    ...profile,
    files: {
      ...profile.files,
      hidden: union(profile.files.hidden, project.files?.hidden) ?? [],
    },
    network: {
      mode,
      allow: projectAllow
        ? profile.network.allow.filter((host) => projectAllow.includes(host))
        : profile.network.allow,
    },
    git: { push: profile.git.push && (project.git?.push ?? true) },
  };
}
