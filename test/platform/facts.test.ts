import { release } from "node:os";
import { describe, expect, it } from "vitest";
import { gatherFacts } from "../../src/platform/facts.js";

describe("gatherFacts (runs against the real machine)", () => {
  const facts = gatherFacts(process.cwd());

  it("reports the current platform and architecture", () => {
    expect(facts.platform).toBe(process.platform);
    expect(facts.arch).toBe(process.arch);
  });

  it.runIf(process.platform === "win32")(
    "reads the Windows build and the project drive's file system",
    () => {
      expect(facts.windows?.build).toBe(Number(release().split(".")[2]));
      expect(facts.windows?.projectFileSystem).toMatch(/^[A-Za-z0-9]+$/);
    },
  );

  it.runIf(process.platform === "linux")("inspects bubblewrap and user namespaces", () => {
    expect(facts.linux).toBeDefined();
  });

  it.runIf(process.platform === "darwin")("looks for sandbox-exec", () => {
    expect(facts.macos?.sandboxExec).toBe(true);
  });
});
