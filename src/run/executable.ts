import { accessSync, constants, statSync } from "node:fs";
import path from "node:path";

/**
 * Locate a command on PATH (honouring PATHEXT on Windows), like `which`.
 * Always returns an absolute path: the sandbox backends mount the tool's
 * folder by path, and a relative one would land in the wrong place.
 */
export function findExecutable(
  command: string,
  env: Record<string, string | undefined>,
  platform: NodeJS.Platform = process.platform,
  cwd: string = process.cwd(),
): string | undefined {
  if (/[\\/]/.test(command)) {
    const file = path.resolve(cwd, command);
    return isRunnable(file, platform) ? file : undefined;
  }
  const pathVar = env.PATH ?? env.Path ?? "";
  const exts = platform === "win32" ? windowsExtensions(command, env.PATHEXT) : [""];
  for (const dir of pathVar.split(path.delimiter).filter(Boolean)) {
    for (const ext of exts) {
      const candidate = path.resolve(cwd, dir, command + ext);
      if (isRunnable(candidate, platform)) return candidate;
    }
  }
  return undefined;
}

/**
 * Windows only runs files with a PATHEXT extension. Extensionless files next
 * to them (npm writes `claude` for Git Bash beside `claude.cmd`) must not match.
 */
function windowsExtensions(command: string, pathext = ".COM;.EXE;.BAT;.CMD"): string[] {
  const exts = pathext.split(";").filter(Boolean);
  const own = path.extname(command).toUpperCase();
  return own && exts.some((e) => e.toUpperCase() === own) ? [""] : exts;
}

function isRunnable(file: string, platform: NodeJS.Platform): boolean {
  try {
    if (!statSync(file).isFile()) return false;
    if (platform !== "win32") accessSync(file, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export interface ExecRootsInput {
  /** The executable as found on PATH (may be a link or shim). */
  executable: string;
  /** process.execPath of the Node running the tool. */
  nodeExecPath: string;
  realpath: (p: string) => string;
}

/**
 * Folders the sandbox must be able to read for the tool to start at all:
 * where it was found, where its code really lives, and the Node runtime.
 * For npm-installed tools that is the whole `node_modules` it sits in,
 * since packages load their dependencies from siblings. All read-only.
 */
export function execRoots({ executable, nodeExecPath, realpath }: ExecRootsInput): string[] {
  const p = /^[A-Za-z]:[\\/]|\\/.test(executable) ? path.win32 : path.posix;
  const real = realpath(executable);
  const parts = real.split(/[\\/]/);
  const nm = parts.indexOf("node_modules");
  const codeRoot = nm === -1 ? p.dirname(real) : parts.slice(0, nm + 1).join(p.sep);

  const nodeDir = p.dirname(nodeExecPath);
  const nodeRoot = p.basename(nodeDir) === "bin" ? p.dirname(nodeDir) : nodeDir;

  return [...new Set([p.dirname(executable), codeRoot, nodeRoot])];
}
