import { COMPAT } from "./compat.js";

export type BackendId = "linux-bwrap" | "macos-seatbelt" | "windows-appcontainer";

/** Everything oh-really needs to know about the machine. Gathered by `facts.ts`. */
export interface Facts {
  platform: NodeJS.Platform;
  arch: string;
  /** os.release(): kernel version on Linux/macOS, "10.0.<build>" on Windows. */
  kernel: string;
  linux?: {
    bwrapVersion: string | undefined;
    maxUserNamespaces: number | undefined;
    apparmorRestrictsUserns: boolean;
    /** Result of actually starting bwrap with a user namespace; undefined if not tried. */
    bwrapProbe?: boolean;
    wsl1: boolean;
  };
  macos?: { sandboxExec: boolean };
  windows?: { build: number; projectFileSystem: string | undefined };
}

export interface Check {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
  hint?: string;
  /** Could not be judged because an earlier check failed. Counts as ok; the earlier failure already blocks. */
  skipped?: boolean;
}

export interface Report {
  backend: BackendId | undefined;
  supported: boolean;
  checks: Check[];
}

/** Decide whether this machine can enforce every promise. Pure: no I/O. */
export function evaluate(facts: Facts): Report {
  const checks: Check[] = [
    check(
      "arch",
      "CPU architecture",
      (COMPAT.arch as readonly string[]).includes(facts.arch),
      facts.arch,
      `supported: ${COMPAT.arch.join(", ")}`,
    ),
  ];
  let backend: BackendId | undefined;

  if (facts.platform === "linux" && facts.linux) {
    backend = "linux-bwrap";
    checks.push(...linuxChecks(facts.kernel, facts.linux));
  } else if (facts.platform === "darwin" && facts.macos) {
    backend = "macos-seatbelt";
    const major = Number(facts.kernel.split(".")[0]);
    checks.push(
      check(
        "os-version",
        "macOS version",
        major >= COMPAT.macos.minDarwinMajor,
        `Darwin ${facts.kernel}`,
        "macOS 12 or later is required",
      ),
      check(
        "sandbox-exec",
        "Seatbelt sandbox",
        facts.macos.sandboxExec,
        facts.macos.sandboxExec ? "/usr/bin/sandbox-exec" : "missing",
        "/usr/bin/sandbox-exec should ship with macOS",
      ),
    );
  } else if (facts.platform === "win32" && facts.windows) {
    backend = "windows-appcontainer";
    const { build, projectFileSystem: fsType } = facts.windows;
    checks.push(
      check(
        "os-version",
        "Windows build",
        build >= COMPAT.windows.minBuild,
        `build ${build}`,
        `Windows 10 1809 (build ${COMPAT.windows.minBuild}) or later is required`,
      ),
      check(
        "filesystem",
        "Project drive file system",
        (COMPAT.windows.fileSystems as readonly string[]).includes(fsType ?? ""),
        fsType ?? "unknown",
        "the project must be on an NTFS or ReFS drive (not FAT, exFAT or a network share)",
      ),
      check(
        "backend-ready",
        "Windows sandbox",
        COMPAT.windows.backendReady,
        COMPAT.windows.backendReady ? "ready" : "not available yet",
        "the Windows sandbox is coming in a later release; use --yolo to run without it",
      ),
    );
  } else {
    checks.push(
      check(
        "platform",
        "Operating system",
        false,
        facts.platform,
        "oh-really supports Linux, macOS and Windows",
      ),
    );
  }

  return { backend, supported: checks.every((c) => c.ok), checks };
}

function linuxChecks(kernel: string, linux: NonNullable<Facts["linux"]>): Check[] {
  const bwrap = linux.bwrapVersion;
  return [
    check(
      "wsl1",
      "Not WSL1",
      !linux.wsl1,
      linux.wsl1 ? "WSL1" : `kernel ${kernel}`,
      "WSL1 has no namespaces; upgrade to WSL2",
    ),
    check(
      "bwrap",
      "bubblewrap",
      bwrap !== undefined && compareVersions(bwrap, COMPAT.linux.minBwrap) >= 0,
      bwrap ?? "not installed",
      `install bubblewrap ${COMPAT.linux.minBwrap} or later (e.g. "sudo apt install bubblewrap")`,
    ),
    usernsCheck(linux),
  ];
}

/**
 * The reliable signal is actually starting bwrap with a user namespace (the
 * probe), so without bubblewrap the check is skipped rather than guessed.
 * Each failure names its own cause.
 */
function usernsCheck(linux: NonNullable<Facts["linux"]>): Check {
  const id = "userns";
  const label = "Unprivileged user namespaces";
  if (linux.bwrapVersion === undefined) {
    return { id, label, ok: true, skipped: true, detail: "skipped (needs bubblewrap)" };
  }
  const max = linux.maxUserNamespaces;
  if (linux.bwrapProbe === true) return { id, label, ok: true, detail: `max ${max ?? "unknown"}` };
  if (linux.bwrapProbe === false) {
    if (max === 0) return disabled(id, label);
    return {
      id,
      label,
      ok: false,
      detail: "bwrap could not start",
      hint: linux.apparmorRestrictsUserns
        ? "bwrap is installed but could not create a namespace: Ubuntu's AppArmor restricts unprivileged namespaces; your distro's bubblewrap package usually ships a profile that allows it"
        : "bwrap is installed but could not create a namespace; check AppArmor/SELinux or the kernel's namespace settings",
    };
  }
  // No probe result: fall back to the kernel settings.
  if (max === 0) return disabled(id, label);
  if (linux.apparmorRestrictsUserns) {
    return {
      id,
      label,
      ok: false,
      detail: "restricted by AppArmor",
      hint: "Ubuntu's AppArmor blocks user namespaces for unknown programs; your distro's bubblewrap package usually ships a profile that allows it",
    };
  }
  return { id, label, ok: true, detail: `max ${max ?? "unknown"}` };
}

function disabled(id: string, label: string): Check {
  return {
    id,
    label,
    ok: false,
    detail: "disabled",
    hint: "user namespaces are disabled (user.max_user_namespaces = 0)",
  };
}

function check(id: string, label: string, ok: boolean, detail: string, hint: string): Check {
  return ok ? { id, label, ok, detail } : { id, label, ok, detail, hint };
}

/** Compare dotted numeric versions: -1, 0 or 1. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return Math.sign(d);
  }
  return 0;
}
