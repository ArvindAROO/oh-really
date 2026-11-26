/**
 * Read-only system locations a program needs to start: the dynamic loader,
 * shared libraries, certificates, timezone data. None hold user data.
 * Missing entries are skipped by the backends.
 */
export const SYSTEM_READ_ONLY: Partial<Record<NodeJS.Platform, readonly string[]>> = {
  linux: [
    "/usr",
    "/bin",
    "/sbin",
    "/lib",
    "/lib32",
    "/lib64",
    "/libx32",
    "/etc",
    "/opt",
    "/nix/store",
    "/snap",
  ],
  darwin: [
    "/usr",
    "/bin",
    "/sbin",
    "/System",
    "/Library",
    "/opt/homebrew",
    "/opt/local",
    "/private/etc",
    "/private/var/db",
    "/private/var/select",
    "/Applications/Xcode.app",
  ],
};
