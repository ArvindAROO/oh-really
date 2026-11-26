import { describe, expect, it } from "vitest";
import { parseProfile, ProfileError, withDefaults } from "../../src/policy/profile.js";

describe("parseProfile", () => {
  it("returns an empty layer for an empty file, keeping unset keys unset", () => {
    expect(parseProfile("", "empty.toml")).toEqual({});
  });

  it("reads the README example", () => {
    const layer = parseProfile(
      `
[tool]
name = "claude"
match = ["claude"]

[files]
read_write = ["./"]
read_only  = ["~/.gitconfig"]
hidden     = ["./.env"]

[network]
allow = ["api.anthropic.com", "github.com"]

[git]
push = false
`,
      "claude.toml",
    );
    expect(layer).toEqual({
      tool: { name: "claude", match: ["claude"] },
      files: { read_write: ["./"], read_only: ["~/.gitconfig"], hidden: ["./.env"] },
      network: { allow: ["api.anthropic.com", "github.com"] },
      git: { push: false },
    });
  });

  it("rejects unknown keys so typos never silently widen or ignore rules", () => {
    expect(() => parseProfile(`[files]\nread_wirte = ["./"]`, "typo.toml")).toThrow(ProfileError);
  });

  it("rejects an invalid network mode and names the file", () => {
    expect(() => parseProfile(`[network]\nmode = "sometimes"`, "bad.toml")).toThrow(/bad\.toml/);
  });

  it("reports TOML syntax errors as ProfileError", () => {
    expect(() => parseProfile(`[files`, "broken.toml")).toThrow(ProfileError);
  });
});

describe("withDefaults", () => {
  it("fills every section with the strictest defaults", () => {
    expect(withDefaults({})).toEqual({
      tool: { name: undefined, match: [] },
      files: { read_write: [], read_only: [], hidden: [] },
      network: { mode: "off", allow: [] },
      env: { pass: [] },
      git: { push: false },
    });
  });

  it("defaults the network mode to allowlist when an allow list is given", () => {
    expect(withDefaults({ network: { allow: ["example.com"] } }).network).toEqual({
      mode: "allowlist",
      allow: ["example.com"],
    });
  });
});
