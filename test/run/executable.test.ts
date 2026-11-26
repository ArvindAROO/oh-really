import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { execRoots, findExecutable } from "../../src/run/executable.js";

const root = realpathSync.native(mkdtempSync(join(tmpdir(), "ohr-exe-")));
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("findExecutable", () => {
  const bin1 = join(root, "bin1");
  const bin2 = join(root, "bin2");
  mkdirSync(bin1);
  mkdirSync(bin2);
  const isWin = process.platform === "win32";
  const tool = join(bin2, isWin ? "tool.CMD" : "tool");
  writeFileSync(tool, "");
  if (!isWin) chmodSync(tool, 0o755);

  it("searches PATH in order", () => {
    expect(
      findExecutable("tool", { PATH: [bin1, bin2].join(delimiter), PATHEXT: ".EXE;.CMD" }),
    ).toBe(tool);
  });

  it("returns undefined when nothing matches", () => {
    expect(findExecutable("nope", { PATH: bin1, PATHEXT: ".EXE" })).toBeUndefined();
  });

  it("accepts a path to an existing file as is", () => {
    expect(findExecutable(tool, { PATH: "" })).toBe(tool);
  });

  it("turns a relative path into an absolute one, against the given folder", () => {
    // Regression (CI smoke test): `oh-really ./bin/claude` passed "./bin" on to
    // bwrap, which mounted the tool's folder over the sandbox's /bin.
    const relative = `.${isWin ? "\\" : "/"}${tool.slice(bin2.length + 1)}`;
    expect(findExecutable(relative, { PATH: "" }, process.platform, bin2)).toBe(tool);
  });

  it.runIf(isWin)("on Windows skips extensionless scripts that npm writes for Git Bash", () => {
    const npmDir = join(root, "npm");
    mkdirSync(npmDir);
    writeFileSync(join(npmDir, "claude"), "#!/bin/sh");
    writeFileSync(join(npmDir, "claude.cmd"), "");
    expect(findExecutable("claude", { PATH: npmDir, PATHEXT: ".EXE;.CMD" })).toBe(
      join(npmDir, "claude.CMD"),
    );
  });

  it.runIf(isWin)("on Windows still accepts a name that already has an extension", () => {
    expect(findExecutable("tool.cmd", { PATH: bin2, PATHEXT: ".EXE;.CMD" })).toBe(
      join(bin2, "tool.cmd"),
    );
  });
});

describe("execRoots", () => {
  const real = (map: Record<string, string>) => (p: string) => map[p] ?? p;

  it("grants the whole global node_modules for an npm-installed tool", () => {
    const roots = execRoots({
      executable: "/home/me/.npm-global/bin/claude",
      nodeExecPath: "/usr/bin/node",
      realpath: real({
        "/home/me/.npm-global/bin/claude":
          "/home/me/.npm-global/lib/node_modules/@anthropic-ai/claude-code/cli.js",
      }),
    });
    expect(roots).toEqual([
      "/home/me/.npm-global/bin",
      "/home/me/.npm-global/lib/node_modules",
      "/usr",
    ]);
  });

  it("grants the folder of a standalone binary", () => {
    const roots = execRoots({
      executable: "/home/me/.local/bin/claude",
      nodeExecPath: "/home/me/.nvm/versions/node/v22.0.0/bin/node",
      realpath: real({
        "/home/me/.local/bin/claude": "/home/me/.local/share/claude/versions/2.0.0/claude",
      }),
    });
    expect(roots).toEqual([
      "/home/me/.local/bin",
      "/home/me/.local/share/claude/versions/2.0.0",
      "/home/me/.nvm/versions/node/v22.0.0",
    ]);
  });

  it("handles Windows paths", () => {
    const roots = execRoots({
      executable: "C:\\Users\\me\\AppData\\Roaming\\npm\\claude.cmd",
      nodeExecPath: "C:\\Program Files\\nodejs\\node.exe",
      realpath: real({}),
    });
    expect(roots).toEqual(["C:\\Users\\me\\AppData\\Roaming\\npm", "C:\\Program Files\\nodejs"]);
  });
});
