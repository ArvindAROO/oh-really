import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { stageIn, stageOut } from "../../src/run/stage.js";

const root = realpathSync(mkdtempSync(join(tmpdir(), "ohr-stage-")));
afterAll(() => rmSync(root, { recursive: true, force: true }));

let realHome: string;
let stagedHome: string;
let n = 0;
beforeEach(() => {
  realHome = join(root, `real-${n}`);
  stagedHome = join(root, `staged-${n++}`);
  mkdirSync(realHome);
});

const write = (path: string, text: string) => writeFileSync(path, text);
const read = (path: string) => readFileSync(path, "utf8");

describe("stageIn / stageOut", () => {
  it("copies a granted file into the staged home at the same place", () => {
    write(join(realHome, ".claude.json"), "original");
    stageIn({ realHome, stagedHome, grants: [join(realHome, ".claude.json")] });
    expect(read(join(stagedHome, ".claude.json"))).toBe("original");
  });

  it("writes a file saved by write-temp-then-rename back to the real home", () => {
    const real = join(realHome, ".claude.json");
    write(real, "original");
    const staged = stageIn({ realHome, stagedHome, grants: [real] });
    // What the tool does inside the sandbox:
    write(join(stagedHome, ".claude.json.tmp"), "saved");
    renameSync(join(stagedHome, ".claude.json.tmp"), join(stagedHome, ".claude.json"));

    expect(stageOut(staged)).toEqual([real]);
    expect(read(real)).toBe("saved");
  });

  it("leaves an unchanged file untouched", () => {
    const real = join(realHome, ".claude.json");
    write(real, "original");
    const before = statSync(real).mtimeMs;
    const staged = stageIn({ realHome, stagedHome, grants: [real] });
    expect(stageOut(staged)).toEqual([]);
    expect(statSync(real).mtimeMs).toBe(before);
  });

  it("never deletes the real file when the tool deleted its copy", () => {
    const real = join(realHome, ".claude.json");
    write(real, "original");
    const staged = stageIn({ realHome, stagedHome, grants: [real] });
    rmSync(join(stagedHome, ".claude.json"));
    expect(stageOut(staged)).toEqual([]);
    expect(read(real)).toBe("original");
  });

  it("keeps a file the tool created when the grant did not exist yet", () => {
    const real = join(realHome, ".claude.json");
    const staged = stageIn({ realHome, stagedHome, grants: [real] });
    write(join(stagedHome, ".claude.json"), "first run");
    expect(stageOut(staged)).toEqual([real]);
    expect(read(real)).toBe("first run");
  });

  it("keeps a folder the tool created when the grant did not exist yet", () => {
    const real = join(realHome, ".claude");
    const staged = stageIn({ realHome, stagedHome, grants: [real] });
    mkdirSync(join(stagedHome, ".claude", "projects"), { recursive: true });
    write(join(stagedHome, ".claude", "projects", "a.json"), "{}");
    expect(stageOut(staged)).toEqual([real]);
    expect(read(join(real, "projects", "a.json"))).toBe("{}");
  });

  it("does not stage folders that already exist (those are mounted live)", () => {
    mkdirSync(join(realHome, ".claude"));
    write(join(realHome, ".claude", "x"), "live");
    const staged = stageIn({ realHome, stagedHome, grants: [join(realHome, ".claude")] });
    expect(existsSync(join(stagedHome, ".claude", "x"))).toBe(false);
    expect(staged.entries).toEqual([]);
  });

  it("works for files nested in folders that do not exist in the staged home", () => {
    mkdirSync(join(realHome, ".config", "tool"), { recursive: true });
    const real = join(realHome, ".config", "tool", "settings.json");
    write(real, "a");
    const staged = stageIn({ realHome, stagedHome, grants: [real] });
    write(join(stagedHome, ".config", "tool", "settings.json"), "b");
    stageOut(staged);
    expect(read(real)).toBe("b");
  });

  it("ignores grants outside the home folder", () => {
    const outside = join(root, "elsewhere.txt");
    write(outside, "x");
    expect(stageIn({ realHome, stagedHome, grants: [outside] }).entries).toEqual([]);
  });
});
