/**
 * Minimum versions oh-really relies on. Every check in `evaluate.ts` reads
 * from here, so supporting a new OS release means changing one table.
 */
export const COMPAT = {
  arch: ["x64", "arm64"],
  linux: {
    /** Oldest bubblewrap with --die-with-parent and the *-try bind options. */
    minBwrap: "0.4.0",
  },
  macos: {
    /** Darwin 21 = macOS 12 Monterey. */
    minDarwinMajor: 21,
  },
  windows: {
    /** Windows 10 1809: LPAC AppContainers are stable from here. */
    minBuild: 17763,
    /** File systems with ACLs, which AppContainer grants need. */
    fileSystems: ["NTFS", "ReFS"],
    /** Flipped once the AppContainer backend lands. */
    backendReady: false,
  },
} as const;
