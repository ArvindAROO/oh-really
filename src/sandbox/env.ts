/** Variables nearly every program needs to start and draw its output. */
const COMMON = [
  "PATH",
  "HOME",
  "USER",
  "LOGNAME",
  "SHELL",
  "TERM",
  "COLORTERM",
  "LANG",
  "LC_*",
  "TZ",
  "NO_COLOR",
  "FORCE_COLOR",
];

const WINDOWS = [
  "SYSTEMROOT",
  "WINDIR",
  "SYSTEMDRIVE",
  "COMSPEC",
  "PATHEXT",
  "OS",
  "PROCESSOR_ARCHITECTURE",
  "NUMBER_OF_PROCESSORS",
  "USERPROFILE",
  "USERNAME",
  "HOMEDRIVE",
  "HOMEPATH",
  "APPDATA",
  "LOCALAPPDATA",
  "PROGRAMDATA",
  "PROGRAMFILES",
  "PROGRAMFILES(X86)",
  "PROGRAMW6432",
  "COMMONPROGRAMFILES",
];

export interface BuildEnvOptions {
  source: Record<string, string | undefined>;
  /** Extra names or `PREFIX_*` patterns from the profile. */
  pass: string[];
  platform: NodeJS.Platform;
  /** Values oh-really sets itself (temp dir, proxy, tool home). Applied last. */
  set: Record<string, string>;
}

/**
 * Build the child's environment from an allowlist. Anything not listed is
 * dropped, so API keys for other tools never reach the sandboxed program.
 */
export function buildEnv({ source, pass, platform, set }: BuildEnvOptions): Record<string, string> {
  const insensitive = platform === "win32";
  const fold = (s: string) => (insensitive ? s.toUpperCase() : s);
  const patterns = [...COMMON, ...(insensitive ? WINDOWS : []), ...pass].map(fold);
  const allowed = (name: string) =>
    patterns.some((p) =>
      p.endsWith("*") ? fold(name).startsWith(p.slice(0, -1)) : fold(name) === p,
    );

  // oh-really's own values win; on Windows that includes differently-cased duplicates.
  const overridden = new Set(Object.keys(set).map(fold));
  const kept = Object.entries(source).filter(
    (entry): entry is [string, string] =>
      entry[1] !== undefined && allowed(entry[0]) && !overridden.has(fold(entry[0])),
  );
  return { ...Object.fromEntries(kept), ...set };
}
