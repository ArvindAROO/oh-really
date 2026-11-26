import path from "node:path";

export interface AppDirs {
  /** The user's own profiles: `<dir>/<tool>.toml`. */
  profiles: string;
  /** Private per-tool homes for global installs and caches. */
  homes: string;
}

export interface AppDirsInput {
  platform: NodeJS.Platform;
  home: string;
  env: Record<string, string | undefined>;
}

export function appDirs({ platform, home, env }: AppDirsInput): AppDirs {
  if (platform === "win32") {
    const p = path.win32;
    const roaming = env.APPDATA ?? p.join(home, "AppData", "Roaming");
    const local = env.LOCALAPPDATA ?? p.join(home, "AppData", "Local");
    return {
      profiles: p.join(roaming, "oh-really", "profiles"),
      homes: p.join(local, "oh-really", "homes"),
    };
  }
  const p = path.posix;
  const config = env.XDG_CONFIG_HOME || p.join(home, ".config");
  const data = env.XDG_DATA_HOME || p.join(home, ".local", "share");
  return {
    profiles: p.join(config, "oh-really", "profiles"),
    homes: p.join(data, "oh-really", "homes"),
  };
}
