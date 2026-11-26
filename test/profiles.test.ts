import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BUILTIN_PROFILES_DIR } from "../src/policy/builtin.js";
import { parseProfile, withDefaults } from "../src/policy/profile.js";

const files = readdirSync(BUILTIN_PROFILES_DIR).filter((f) => f.endsWith(".toml"));
const profiles = files.map((file) => ({
  file,
  profile: withDefaults(parseProfile(readFileSync(join(BUILTIN_PROFILES_DIR, file), "utf8"), file)),
}));

/** Where each tool keeps its login. No other profile may see these. */
const CREDENTIAL_PATHS: Record<string, string[]> = {
  claude: ["~/.claude", "~/.claude.json"],
  codex: ["~/.codex"],
  gemini: ["~/.gemini"],
};

describe("built-in profiles", () => {
  it("ships the strict default and the popular tools", () => {
    expect(files).toEqual(
      expect.arrayContaining(["default.toml", "claude.toml", "codex.toml", "gemini.toml"]),
    );
  });

  it.each(profiles)("$file is named after its file", ({ file, profile }) => {
    expect(`${profile.tool.name}.toml`).toBe(file);
  });

  it("default grants nothing beyond the project folder and has no network", () => {
    const def = profiles.find((p) => p.file === "default.toml")?.profile;
    expect(def?.files).toEqual({ read_write: [], read_only: [], hidden: [] });
    expect(def?.network.mode).toBe("off");
    expect(def?.git.push).toBe(false);
  });

  it.each(profiles)("$file never touches another tool's credentials", ({ profile }) => {
    const granted = [...profile.files.read_write, ...profile.files.read_only];
    for (const [tool, paths] of Object.entries(CREDENTIAL_PATHS)) {
      if (tool === profile.tool.name) continue;
      for (const path of paths) expect(granted).not.toContain(path);
    }
  });

  it("no tool is claimed by two profiles", () => {
    const all = profiles.flatMap((p) => p.profile.tool.match);
    expect(new Set(all).size).toBe(all.length);
  });
});
