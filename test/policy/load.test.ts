import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { loadProfile, toolIdOf } from "../../src/policy/load.js";
import { ProfileError } from "../../src/policy/profile.js";

const root = mkdtempSync(join(tmpdir(), "ohr-load-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

let dirs: { builtinDir: string; userDir: string; cwd: string };
let n = 0;
beforeEach(() => {
  const base = join(root, String(n++));
  dirs = {
    builtinDir: join(base, "builtin"),
    userDir: join(base, "user"),
    cwd: join(base, "project"),
  };
  for (const d of Object.values(dirs)) mkdirSync(d, { recursive: true });
  writeFileSync(join(dirs.builtinDir, "default.toml"), `[tool]\nname = "default"\n`);
  writeFileSync(
    join(dirs.builtinDir, "claude.toml"),
    `[tool]\nname = "claude"\nmatch = ["claude"]\n[network]\nallow = ["api.anthropic.com", "github.com"]\n`,
  );
});

describe("toolIdOf", () => {
  it.each([
    ["claude", "claude"],
    ["C:\\Users\\me\\AppData\\Roaming\\npm\\claude.cmd", "claude"],
    ["/usr/local/bin/Codex", "codex"],
    ["gemini.exe", "gemini"],
  ])("%s -> %s", (command, id) => {
    expect(toolIdOf(command)).toBe(id);
  });
});

describe("loadProfile", () => {
  it("picks the built-in profile whose match list contains the tool", () => {
    const { profile, sources } = loadProfile({ ...dirs, command: "claude" });
    expect(profile.tool.name).toBe("claude");
    expect(sources).toEqual([join(dirs.builtinDir, "claude.toml")]);
  });

  it("falls back to the strict default profile for unknown tools", () => {
    const { profile } = loadProfile({ ...dirs, command: "some-cli" });
    expect(profile.tool.name).toBe("default");
    expect(profile.network.mode).toBe("off");
  });

  it("layers the user's own profile on top of the built-in one", () => {
    writeFileSync(join(dirs.userDir, "claude.toml"), `[network]\nallow = ["registry.npmjs.org"]\n`);
    const { profile } = loadProfile({ ...dirs, command: "claude" });
    expect(profile.network.allow).toEqual([
      "api.anthropic.com",
      "github.com",
      "registry.npmjs.org",
    ]);
  });

  it("applies the project file last, only narrowing", () => {
    writeFileSync(join(dirs.cwd, ".oh-really.toml"), `[network]\nallow = ["github.com"]\n`);
    const { profile, sources } = loadProfile({ ...dirs, command: "claude" });
    expect(profile.network.allow).toEqual(["github.com"]);
    expect(sources).toContain(join(dirs.cwd, ".oh-really.toml"));
  });

  it("refuses a project file that tries to grant access", () => {
    writeFileSync(join(dirs.cwd, ".oh-really.toml"), `[files]\nread_write = ["~"]\n`);
    expect(() => loadProfile({ ...dirs, command: "claude" })).toThrow(ProfileError);
  });

  it("fails clearly when the built-in default profile is missing", () => {
    rmSync(join(dirs.builtinDir, "default.toml"));
    expect(() => loadProfile({ ...dirs, command: "unknown" })).toThrow(/default/);
  });
});
