import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { PathContext } from "../../src/policy/paths.js";
import { withDefaults } from "../../src/policy/profile.js";
import { resolvePolicy } from "../../src/policy/resolve.js";

const root = realpathSync(mkdtempSync(join(tmpdir(), "ohr-resolve-")));
afterAll(() => rmSync(root, { recursive: true, force: true }));
const ctx: PathContext = {
  cwd: join(root, "project"),
  home: join(root, "home"),
  toolHome: join(root, "toolhome"),
};
mkdirSync(ctx.cwd, { recursive: true });

describe("resolvePolicy", () => {
  it("always grants the working folder and the tool home read-write, even with no rules", () => {
    const policy = resolvePolicy(withDefaults({}), ctx);
    expect(policy.readWrite).toEqual([ctx.cwd, ctx.toolHome]);
    expect(policy.readOnly).toEqual([]);
  });

  it("expands and de-duplicates paths", () => {
    const policy = resolvePolicy(
      withDefaults({
        files: { read_write: ["./", "$CWD", "~/.claude"], read_only: ["~/.gitconfig"] },
      }),
      ctx,
    );
    expect(policy.readWrite).toEqual([ctx.cwd, ctx.toolHome, join(ctx.home, ".claude")]);
    expect(policy.readOnly).toEqual([join(ctx.home, ".gitconfig")]);
  });

  it("normalises allowed hosts to lower case without trailing dots", () => {
    const policy = resolvePolicy(withDefaults({ network: { allow: ["API.Anthropic.com."] } }), ctx);
    expect(policy.network).toEqual({ mode: "allowlist", allow: ["api.anthropic.com"] });
  });

  it("carries over env, git and hidden settings", () => {
    const policy = resolvePolicy(
      withDefaults({
        env: { pass: ["ANTHROPIC_*"] },
        git: { push: true },
        files: { hidden: ["./.env"] },
      }),
      ctx,
    );
    expect(policy.envPass).toEqual(["ANTHROPIC_*"]);
    expect(policy.gitPush).toBe(true);
    expect(policy.hidden).toEqual([join(ctx.cwd, ".env")]);
  });
});
