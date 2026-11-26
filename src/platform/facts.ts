import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { release } from "node:os";
import type { Facts } from "./evaluate.js";
import { volumeFileSystem } from "./windows/volume.js";

/**
 * Inspect the real machine. Kept separate from `evaluate` so the rules can
 * be tested for every OS while this file only does I/O.
 */
export function gatherFacts(cwd: string): Facts {
  const base = { platform: process.platform, arch: process.arch, kernel: release() };
  switch (process.platform) {
    case "linux":
      return { ...base, linux: linuxFacts(base.kernel) };
    case "darwin":
      return { ...base, macos: { sandboxExec: existsSync("/usr/bin/sandbox-exec") } };
    case "win32":
      return {
        ...base,
        windows: {
          build: Number(base.kernel.split(".")[2] ?? 0),
          projectFileSystem: safe(() => volumeFileSystem(cwd)),
        },
      };
    default:
      return base;
  }
}

function linuxFacts(kernel: string): NonNullable<Facts["linux"]> {
  const bwrapVersion = run("bwrap", ["--version"])?.match(/(\d+\.\d+(?:\.\d+)?)/)?.[1];
  return {
    bwrapVersion,
    maxUserNamespaces: readNumber("/proc/sys/user/max_user_namespaces"),
    apparmorRestrictsUserns:
      readNumber("/proc/sys/kernel/apparmor_restrict_unprivileged_userns") === 1,
    // Actually starting a namespace is the only reliable answer: distro
    // AppArmor profiles may allow bwrap even when the sysctl says "restricted".
    bwrapProbe: bwrapVersion
      ? run("bwrap", ["--unshare-user", "--ro-bind", "/", "/", "--", "true"]) !== undefined
      : undefined,
    wsl1: /Microsoft$/.test(kernel),
  };
}

function run(cmd: string, args: string[]): string | undefined {
  return safe(() =>
    execFileSync(cmd, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5000,
    }),
  );
}

function readNumber(path: string): number | undefined {
  const n = Number(safe(() => readFileSync(path, "utf8").trim()));
  return Number.isFinite(n) ? n : undefined;
}

function safe<T>(fn: () => T): T | undefined {
  try {
    return fn();
  } catch {
    return undefined;
  }
}
