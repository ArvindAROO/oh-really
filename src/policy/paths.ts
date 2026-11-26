import { realpathSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { ProfileError } from "./profile.js";

export interface PathContext {
  /** The folder oh-really was started in. */
  cwd: string;
  /** The user's real home folder. */
  home: string;
  /** The tool's private home for global installs and caches. */
  toolHome: string;
}

const VARIABLE = /^\$([A-Z_]+)(?=$|[\\/])/;

/**
 * Turn a profile path into an absolute, canonical path.
 *
 * Canonicalising before granting access matters: a link inside the project
 * that points at ~/.ssh must be granted as ~/.ssh (and therefore refused),
 * not as "something inside the project".
 */
export function expandPath(input: string, ctx: PathContext): string {
  let path = input;
  const variable = VARIABLE.exec(path);
  if (variable) {
    const values: Record<string, string> = {
      CWD: ctx.cwd,
      HOME: ctx.home,
      TOOL_HOME: ctx.toolHome,
    };
    const value = values[variable[1] ?? ""];
    if (value === undefined) {
      throw new ProfileError(`unknown variable "$${variable[1]}" in path "${input}"`);
    }
    path = value + path.slice(variable[0].length);
  } else if (path === "~" || path.startsWith("~/") || path.startsWith("~\\")) {
    path = ctx.home + path.slice(1);
  }
  return canonicalize(resolve(ctx.cwd, path));
}

/** Resolve links in the longest existing prefix of `path`, then re-append the rest. */
function canonicalize(path: string): string {
  const missing: string[] = [];
  let current = path;
  for (;;) {
    try {
      return join(realpathSync.native(current), ...missing.reverse());
    } catch {
      const parent = dirname(current);
      if (parent === current) return path;
      missing.push(basename(current));
      current = parent;
    }
  }
}
