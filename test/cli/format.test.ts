import { describe, expect, it } from "vitest";
import { formatExplain, formatReport } from "../../src/cli/format.js";
import type { SandboxPolicy } from "../../src/policy/resolve.js";

describe("formatReport", () => {
  it("lists each check and ends with a verdict", () => {
    const text = formatReport({
      backend: "windows-appcontainer",
      supported: false,
      checks: [
        { id: "os-version", label: "Windows build", ok: true, detail: "build 19045" },
        {
          id: "backend-ready",
          label: "Windows sandbox",
          ok: false,
          detail: "not available yet",
          hint: "coming later",
        },
      ],
    });
    expect(text).toContain("  ok    Windows build: build 19045");
    expect(text).toContain("  FAIL  Windows sandbox: not available yet");
    expect(text).toContain("        coming later");
    expect(text).toMatch(/cannot run sandboxed/);
  });

  it("marks skipped checks as skip", () => {
    const text = formatReport({
      backend: "linux-bwrap",
      supported: false,
      checks: [
        {
          id: "userns",
          label: "Unprivileged user namespaces",
          ok: true,
          skipped: true,
          detail: "skipped (needs bubblewrap)",
        },
      ],
    });
    expect(text).toContain("  skip  Unprivileged user namespaces: skipped (needs bubblewrap)");
  });

  it("says so when everything is fine", () => {
    const text = formatReport({ backend: "linux-bwrap", supported: true, checks: [] });
    expect(text).toMatch(/ready/);
  });
});

describe("formatExplain", () => {
  const policy: SandboxPolicy = {
    cwd: "/p",
    toolHome: "/th",
    readWrite: ["/p", "/th", "/home/me/.claude"],
    readOnly: ["/home/me/.gitconfig"],
    hidden: [],
    network: { mode: "allowlist", allow: ["api.anthropic.com"] },
    envPass: ["ANTHROPIC_*"],
    gitPush: false,
  };

  it("describes the rules in plain words", () => {
    const text = formatExplain("claude", policy, ["/profiles/claude.toml"]);
    expect(text).toContain("claude can read and change:");
    expect(text).toContain("  /home/me/.claude");
    expect(text).toContain("claude can read:");
    expect(text).toContain("Internet: only api.anthropic.com");
    expect(text).toContain("Git push: not allowed");
    expect(text).toContain("Settings from: /profiles/claude.toml");
  });

  it("explains each network mode", () => {
    expect(formatExplain("x", { ...policy, network: { mode: "off", allow: [] } }, [])).toContain(
      "Internet: none",
    );
    expect(formatExplain("x", { ...policy, network: { mode: "open", allow: [] } }, [])).toContain(
      "Internet: anything",
    );
  });

  it("does not print emojis", () => {
    const text = formatExplain("claude", policy, []);
    expect(text).toMatch(/^[\x20-\x7e\n]*$/);
  });
});
