import { describe, expect, it } from "vitest";
import type { SandboxPolicy } from "../../src/policy/resolve.js";
import { buildSeatbeltProfile } from "../../src/sandbox/macos/seatbelt.js";

const policy: SandboxPolicy = {
  cwd: "/Users/me/project",
  toolHome: "/Users/me/.local/share/oh-really/homes/claude",
  readWrite: [
    "/Users/me/project",
    "/Users/me/.local/share/oh-really/homes/claude",
    "/Users/me/.claude",
  ],
  readOnly: ["/Users/me/.gitconfig"],
  hidden: ["/Users/me/project/.env"],
  network: { mode: "allowlist", allow: ["api.anthropic.com"] },
  envPass: [],
  gitPush: false,
};
const extra = {
  systemReadOnly: ["/usr", "/System"],
  tmpDir: "/private/tmp/ohr-1",
  proxyPort: 41234,
};

describe("buildSeatbeltProfile", () => {
  const profile = buildSeatbeltProfile(policy, extra);

  it("denies everything by default", () => {
    expect(profile.startsWith("(version 1)\n(deny default)")).toBe(true);
  });

  it("grants read-write to the project, tool home and the tool's own config", () => {
    for (const path of policy.readWrite) {
      expect(profile).toContain(`(allow file-read* file-write* (subpath "${path}"))`);
    }
    expect(profile).toContain(`(allow file-read* file-write* (subpath "/private/tmp/ohr-1"))`);
  });

  it("grants read-only paths without write access", () => {
    expect(profile).toContain(`(allow file-read* (subpath "/Users/me/.gitconfig"))`);
    expect(profile).not.toContain(`file-write* (subpath "/Users/me/.gitconfig")`);
    expect(profile).toContain(`(allow file-read* (subpath "/usr"))`);
  });

  it("never grants the home folder as a whole", () => {
    expect(profile).not.toContain(`(subpath "/Users/me")`);
  });

  it("hides paths after the grants so the deny wins", () => {
    const deny = profile.indexOf(
      `(deny file-read* file-write* (subpath "/Users/me/project/.env"))`,
    );
    const grant = profile.indexOf(`(subpath "/Users/me/project"))`);
    expect(deny).toBeGreaterThan(grant);
  });

  it("only lets the network reach the local proxy in allowlist mode", () => {
    expect(profile).toContain(`(allow network-outbound (remote ip "localhost:41234"))`);
    expect(profile).not.toContain("(allow network*)");
  });

  it("allows no network at all when off", () => {
    const off = buildSeatbeltProfile({ ...policy, network: { mode: "off", allow: [] } }, extra);
    expect(off).not.toMatch(/allow network/);
  });

  it("allows all network when open", () => {
    const open = buildSeatbeltProfile({ ...policy, network: { mode: "open", allow: [] } }, extra);
    expect(open).toContain("(allow network*)");
  });

  it("lets a granted file be saved by write-temp-then-rename (temp files next to it allowed)", () => {
    const withFile = buildSeatbeltProfile(
      { ...policy, readWrite: [...policy.readWrite, "/Users/me/.claude.json"] },
      { ...extra, kindOf: (p) => (p.endsWith(".json") ? "file" : "dir") },
    );
    expect(withFile).toContain(
      `(allow file-read* file-write* (regex #"^/Users/me/\\.claude\\.json"))`,
    );
    expect(withFile).not.toContain(`(subpath "/Users/me/.claude.json")`);
    expect(withFile).toContain(`(allow file-read* file-write* (subpath "/Users/me/.claude"))`);
  });

  it("treats a grant that does not exist yet like a file, so a first run can create it", () => {
    const missing = buildSeatbeltProfile(
      { ...policy, readWrite: ["/Users/me/project", "/Users/me/.newtool"] },
      { ...extra, kindOf: (p) => (p.endsWith(".newtool") ? "missing" : "dir") },
    );
    expect(missing).toContain(`(regex #"^/Users/me/\\.newtool")`);
  });

  it("escapes quotes and backslashes in paths", () => {
    const odd = buildSeatbeltProfile({ ...policy, readOnly: ['/tmp/a"b\\c'] }, extra);
    expect(odd).toContain(`(subpath "/tmp/a\\"b\\\\c")`);
  });
});
