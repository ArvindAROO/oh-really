import { describe, expect, it } from "vitest";
import type { SandboxPolicy } from "../../src/policy/resolve.js";
import { buildBwrapArgs, type BwrapExtras } from "../../src/sandbox/linux/bwrap.js";

const policy: SandboxPolicy = {
  cwd: "/home/me/project",
  toolHome: "/home/me/.local/share/oh-really/homes/claude",
  readWrite: [
    "/home/me/project",
    "/home/me/.local/share/oh-really/homes/claude",
    "/home/me/.claude",
  ],
  readOnly: ["/home/me/.gitconfig"],
  hidden: ["/home/me/project/.env", "/home/me/project/secrets"],
  network: { mode: "allowlist", allow: ["api.anthropic.com"] },
  envPass: [],
  gitPush: false,
};
const extra: BwrapExtras = {
  home: "/home/me",
  systemReadOnly: ["/usr", "/etc"],
  tmpDir: "/tmp/ohr-1",
  proxySocket: "/tmp/ohr-1/proxy.sock",
  emptyFile: "/tmp/ohr-1/empty",
  kindOf: (p) => (p.endsWith("secrets") ? "dir" : "file"),
};

/** Find `flag a b` triples in the argument list. */
const pairs = (args: string[], flag: string) =>
  args.flatMap((a, i) => (a === flag ? [[args[i + 1], args[i + 2]]] : []));

describe("buildBwrapArgs", () => {
  const args = buildBwrapArgs(policy, extra, "claude", ["--resume"]);

  it("isolates everything and dies with oh-really", () => {
    expect(args).toEqual(expect.arrayContaining(["--unshare-all", "--die-with-parent"]));
    expect(args).not.toContain("--share-net");
  });

  it("ends with the command after --", () => {
    expect(args.slice(-3)).toEqual(["--", "claude", "--resume"]);
  });

  it("mounts system folders read-only and skips ones that do not exist", () => {
    expect(pairs(args, "--ro-bind-try")).toEqual(
      expect.arrayContaining([
        ["/usr", "/usr"],
        ["/etc", "/etc"],
      ]),
    );
  });

  it("replaces the home folder with an empty one before granting parts of it", () => {
    const home = args.indexOf("/home/me");
    const claude = args.indexOf("/home/me/.claude");
    expect(args[home - 1]).toBe("--tmpfs");
    expect(claude).toBeGreaterThan(home);
  });

  it("keeps read-only system grants under the home folder visible (e.g. Node from nvm)", () => {
    // Regression: proven on WSL, `execvp ~/.nvm/.../node: No such file or directory`.
    // The home tmpfs was mounted after the system grants and covered them.
    const nvmNode = "/home/me/.nvm/versions/node/v22.0.0";
    const withNvm = buildBwrapArgs(
      policy,
      { ...extra, systemReadOnly: ["/usr", nvmNode] },
      "node",
      [],
    );
    const homeTmpfs = withNvm.findIndex((a, i) => a === "--tmpfs" && withNvm[i + 1] === "/home/me");
    const nvmBind = withNvm.findIndex(
      (a, i) => a === "--ro-bind-try" && withNvm[i + 1] === nvmNode,
    );
    expect(nvmBind).toBeGreaterThan(homeTmpfs);
  });

  it("mounts a staged home folder instead of an empty one when given, still before other grants", () => {
    const staged = buildBwrapArgs(policy, { ...extra, stagedHome: "/tmp/ohr-1/home" }, "x", []);
    expect(pairs(staged, "--bind")).toContainEqual(["/tmp/ohr-1/home", "/home/me"]);
    expect(staged.some((a, i) => a === "--tmpfs" && staged[i + 1] === "/home/me")).toBe(false);
    const home = staged.indexOf("/tmp/ohr-1/home");
    expect(staged.indexOf("/usr")).toBeGreaterThan(home);
    expect(staged.indexOf("/home/me/.claude")).toBeGreaterThan(home);
  });

  it("binds the project read-write, required, and other grants only if present", () => {
    expect(pairs(args, "--bind")).toContainEqual(["/home/me/project", "/home/me/project"]);
    expect(pairs(args, "--bind-try")).toContainEqual(["/home/me/.claude", "/home/me/.claude"]);
    expect(pairs(args, "--ro-bind-try")).toContainEqual([
      "/home/me/.gitconfig",
      "/home/me/.gitconfig",
    ]);
  });

  it("covers hidden files with an empty file and hidden folders with an empty tmpfs, after the grants", () => {
    // Bug 4: /dev/null cannot be opened from a user-namespace mount (EACCES),
    // so a hidden file must be covered by an empty regular file to read as empty.
    expect(pairs(args, "--ro-bind")).toContainEqual(["/tmp/ohr-1/empty", "/home/me/project/.env"]);
    expect(args).not.toContain("/dev/null");
    const tmpfs = args.lastIndexOf("--tmpfs");
    expect(args[tmpfs + 1]).toBe("/home/me/project/secrets");
    expect(tmpfs).toBeGreaterThan(args.indexOf("/home/me/project"));
  });

  it("passes in the proxy socket and starts in the project folder", () => {
    expect(pairs(args, "--bind")).toContainEqual([
      "/tmp/ohr-1/proxy.sock",
      "/tmp/ohr-1/proxy.sock",
    ]);
    expect(args[args.indexOf("--chdir") + 1]).toBe("/home/me/project");
  });

  it("shares the network only in open mode", () => {
    const open = buildBwrapArgs(
      { ...policy, network: { mode: "open", allow: [] } },
      { ...extra, proxySocket: undefined },
      "x",
      [],
    );
    expect(open).toContain("--share-net");
  });

  it("in open mode makes the real resolv.conf visible when /etc/resolv.conf is a link", () => {
    // Regression: proven on WSL, /etc/resolv.conf -> /mnt/wsl/resolv.conf, and
    // only /etc was mounted, so DNS failed under --net open.
    const open = buildBwrapArgs(
      { ...policy, network: { mode: "open", allow: [] } },
      { ...extra, proxySocket: undefined, resolvConf: "/mnt/wsl/resolv.conf" },
      "x",
      [],
    );
    expect(pairs(open, "--ro-bind-try")).toContainEqual([
      "/mnt/wsl/resolv.conf",
      "/mnt/wsl/resolv.conf",
    ]);
  });

  it("does not expose resolv.conf when the network is not open", () => {
    const off = buildBwrapArgs(
      { ...policy, network: { mode: "off", allow: [] } },
      { ...extra, proxySocket: undefined, resolvConf: "/mnt/wsl/resolv.conf" },
      "x",
      [],
    );
    expect(off).not.toContain("/mnt/wsl/resolv.conf");
  });

  it("requires a proxy socket in allowlist mode", () => {
    expect(() => buildBwrapArgs(policy, { ...extra, proxySocket: undefined }, "x", [])).toThrow(
      /proxy/,
    );
  });
});
