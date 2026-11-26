import { describe, expect, it } from "vitest";
import { extendLayer, narrowProfile } from "../../src/policy/merge.js";
import { ProfileError, withDefaults } from "../../src/policy/profile.js";

describe("extendLayer (built-in profile + user profile)", () => {
  it("adds list entries from the user layer without duplicates", () => {
    const merged = extendLayer(
      { files: { read_only: ["~/.gitconfig"] }, network: { allow: ["a.com"] } },
      { files: { read_only: ["~/.gitconfig", "~/.npmrc"] }, network: { allow: ["b.com"] } },
    );
    expect(merged.files?.read_only).toEqual(["~/.gitconfig", "~/.npmrc"]);
    expect(merged.network?.allow).toEqual(["a.com", "b.com"]);
  });

  it("lets the user layer override single values", () => {
    const merged = extendLayer({ network: { mode: "allowlist" } }, { network: { mode: "open" } });
    expect(merged.network?.mode).toBe("open");
  });

  it("keeps base values the user layer does not mention", () => {
    const merged = extendLayer({ tool: { name: "claude" }, git: { push: true } }, {});
    expect(merged).toEqual({ tool: { name: "claude" }, git: { push: true } });
  });
});

describe("narrowProfile (resolved profile + project .oh-really.toml)", () => {
  const base = withDefaults({
    files: { read_write: ["./"], read_only: ["~/.gitconfig"] },
    network: { mode: "allowlist", allow: ["api.anthropic.com", "github.com"] },
    git: { push: true },
  });

  it("adds hidden paths", () => {
    expect(narrowProfile(base, { files: { hidden: ["./secrets"] } }, "p").files.hidden).toEqual([
      "./secrets",
    ]);
  });

  it("keeps only allowed hosts that are also in the base profile", () => {
    const narrowed = narrowProfile(base, { network: { allow: ["github.com", "evil.com"] } }, "p");
    expect(narrowed.network.allow).toEqual(["github.com"]);
  });

  it("can make the network stricter", () => {
    expect(narrowProfile(base, { network: { mode: "off" } }, "p").network.mode).toBe("off");
  });

  it("cannot make the network looser", () => {
    expect(() => narrowProfile(base, { network: { mode: "open" } }, "p")).toThrow(ProfileError);
  });

  it("can turn git push off but never on", () => {
    expect(narrowProfile(base, { git: { push: false } }, "p").git.push).toBe(false);
    const noPush = withDefaults({ git: { push: false } });
    expect(narrowProfile(noPush, { git: { push: true } }, "p").git.push).toBe(false);
  });

  it.each([
    ["files.read_write", { files: { read_write: ["../"] } }],
    ["files.read_only", { files: { read_only: ["~/.ssh"] } }],
    ["env.pass", { env: { pass: ["OPENAI_API_KEY"] } }],
    ["tool", { tool: { name: "other" } }],
  ])("refuses to grant access via %s", (_key, layer) => {
    expect(() => narrowProfile(base, layer, ".oh-really.toml")).toThrow(/\.oh-really\.toml/);
  });
});
