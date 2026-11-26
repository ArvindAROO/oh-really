import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { expandPath, type PathContext } from "../../src/policy/paths.js";
import { ProfileError } from "../../src/policy/profile.js";

const root = realpathSync.native(mkdtempSync(join(tmpdir(), "ohr-paths-")));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const ctx: PathContext = {
  cwd: join(root, "project"),
  home: join(root, "home"),
  toolHome: join(root, "toolhome"),
};
mkdirSync(ctx.cwd, { recursive: true });
mkdirSync(join(ctx.home, ".claude"), { recursive: true });

describe("expandPath", () => {
  it("resolves ./ and bare relative paths against the working folder", () => {
    expect(expandPath("./", ctx)).toBe(ctx.cwd);
    expect(expandPath("src/x.ts", ctx)).toBe(join(ctx.cwd, "src", "x.ts"));
  });

  it("expands ~ to the home folder", () => {
    expect(expandPath("~", ctx)).toBe(ctx.home);
    expect(expandPath("~/.claude", ctx)).toBe(join(ctx.home, ".claude"));
  });

  it("expands $CWD, $HOME and $TOOL_HOME", () => {
    expect(expandPath("$CWD/a", ctx)).toBe(join(ctx.cwd, "a"));
    expect(expandPath("$HOME/.claude.json", ctx)).toBe(join(ctx.home, ".claude.json"));
    expect(expandPath("$TOOL_HOME", ctx)).toBe(ctx.toolHome);
  });

  it("rejects unknown variables instead of guessing", () => {
    expect(() => expandPath("$SECRET/x", ctx)).toThrow(ProfileError);
  });

  it("removes .. segments so a path cannot pretend to be inside the project", () => {
    expect(expandPath("./sub/../../outside", ctx)).toBe(resolve(root, "outside"));
  });

  it("resolves a link to where it really points", () => {
    const target = join(root, "elsewhere");
    mkdirSync(target);
    symlinkSync(target, join(ctx.cwd, "link"), "junction");
    expect(expandPath("./link", ctx)).toBe(target);
  });

  it("resolves the existing part of a path that does not exist yet", () => {
    const target = join(root, "real");
    mkdirSync(target);
    symlinkSync(target, join(ctx.cwd, "link2"), "junction");
    expect(expandPath("./link2/not/yet", ctx)).toBe(join(target, "not", "yet"));
  });
});

/** Windows short (8.3) alias of an existing path, or undefined if the volume has none. */
function shortName(path: string): string | undefined {
  const out = spawnSync("cmd.exe", ["/d", "/c", `for %I in ("${path}") do @echo %~sI`], {
    encoding: "utf8",
    windowsVerbatimArguments: true,
  }).stdout.trim();
  return out && out.toLowerCase() !== path.toLowerCase() ? out : undefined;
}

describe.runIf(process.platform === "win32")("expandPath on Windows", () => {
  const long = join(root, "a-folder-with-a-long-name");
  mkdirSync(long, { recursive: true });
  const short = shortName(long);

  // Expanding aliases on purpose: a short-name spelling of a path must not
  // slip past a comparison with its long form (bug 6).
  it.runIf(short !== undefined)("expands short (8.3) names to the long form", () => {
    expect(expandPath(short ?? "", ctx)).toBe(long);
  });
});
