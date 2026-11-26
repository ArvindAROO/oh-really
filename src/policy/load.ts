import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { extendLayer, narrowProfile } from "./merge.js";
import {
  parseProfile,
  type Profile,
  ProfileError,
  type ProfileLayer,
  withDefaults,
} from "./profile.js";

export const PROJECT_FILE = ".oh-really.toml";
const DEFAULT_PROFILE = "default";

export interface LoadOptions {
  /** The command being launched, as typed or as a full path. */
  command: string;
  /** Folder of built-in profiles shipped with oh-really. */
  builtinDir: string;
  /** Folder of the user's own profiles. */
  userDir: string;
  /** The project folder, checked for a project file. */
  cwd: string;
}

export interface LoadedProfile {
  profile: Profile;
  /** Every file that contributed, in the order applied. */
  sources: string[];
}

/** "C:\\...\\claude.cmd" -> "claude" */
export function toolIdOf(command: string): string {
  const name = command.split(/[\\/]/).pop() ?? command;
  return name.replace(/\.(exe|cmd|bat|ps1)$/i, "").toLowerCase();
}

export function loadProfile(options: LoadOptions): LoadedProfile {
  const id = toolIdOf(options.command);
  const builtin = findBuiltin(options.builtinDir, id);
  const sources = [builtin.path];
  let layer = builtin.layer;

  const profileName = layer.tool?.name ?? DEFAULT_PROFILE;
  const userPath = join(options.userDir, `${profileName}.toml`);
  if (existsSync(userPath)) {
    layer = extendLayer(layer, readLayer(userPath));
    sources.push(userPath);
  }

  let profile = withDefaults(layer);
  const projectPath = join(options.cwd, PROJECT_FILE);
  if (existsSync(projectPath)) {
    profile = narrowProfile(profile, readLayer(projectPath), projectPath);
    sources.push(projectPath);
  }
  return { profile, sources };
}

function readLayer(path: string): ProfileLayer {
  return parseProfile(readFileSync(path, "utf8"), path);
}

function findBuiltin(dir: string, id: string): { path: string; layer: ProfileLayer } {
  const files = readdirSync(dir).filter((f) => f.endsWith(".toml"));
  for (const file of files) {
    const path = join(dir, file);
    const layer = readLayer(path);
    if (layer.tool?.match?.includes(id)) return { path, layer };
  }
  const fallback = join(dir, `${DEFAULT_PROFILE}.toml`);
  if (!existsSync(fallback)) {
    throw new ProfileError(`built-in profile "${DEFAULT_PROFILE}.toml" is missing from ${dir}`);
  }
  return { path: fallback, layer: readLayer(fallback) };
}
