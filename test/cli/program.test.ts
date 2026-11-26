import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { runCli } from "../../src/cli/program.js";

async function cli(...argv: string[]) {
  const out = new PassThrough();
  const err = new PassThrough();
  let stdout = "";
  let stderr = "";
  out.on("data", (d) => (stdout += d));
  err.on("data", (d) => (stderr += d));
  const code = await runCli(argv, { stdout: out, stderr: err, cwd: process.cwd() });
  return { code, stdout, stderr };
}

describe("oh-really CLI", () => {
  it("runs a command with --yolo and passes its exit code through", async () => {
    expect((await cli("--yolo", process.execPath, "-e", "process.exit(5)")).code).toBe(5);
  });

  it("passes the tool's own flags through untouched", async () => {
    // `--` is node's own separator here; oh-really must forward it and everything after it.
    const script = "process.exit(process.argv.slice(-3).join(' ') === '--resume -p x' ? 0 : 1)";
    expect(
      (await cli("--yolo", process.execPath, "-e", script, "--", "--resume", "-p", "x")).code,
    ).toBe(0);
  });

  it("exits 127 for a command that does not exist", async () => {
    const result = await cli("--yolo", "no-such-tool-xyz");
    expect(result.code).toBe(127);
    expect(result.stderr).toMatch(/command not found: no-such-tool-xyz/);
  });

  it.runIf(process.platform === "win32")(
    "reports a file that exists but cannot be started, without a stack trace",
    async () => {
      const { mkdtempSync, writeFileSync } = await import("node:fs");
      const { tmpdir } = await import("node:os");
      const { join } = await import("node:path");
      const file = join(mkdtempSync(join(tmpdir(), "ohr-cli-")), "script-without-extension");
      writeFileSync(file, "#!/bin/sh");
      const result = await cli("--yolo", file);
      expect(result.code).toBe(126);
      expect(result.stderr).toMatch(/could not start/);
    },
  );

  it("explains a tool's rules", async () => {
    const result = await cli("explain", "claude");
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("claude can read and change:");
    expect(result.stdout).toContain("api.anthropic.com");
  });

  it("doctor prints the report and exits non-zero when unsupported", async () => {
    const result = await cli("doctor");
    expect(result.stdout).toMatch(/Sandbox backend:/);
    expect(result.code).toBe(result.stdout.includes("FAIL") ? 1 : 0);
  });

  it("rejects an invalid --net value", async () => {
    const result = await cli("--net", "sometimes", "claude");
    expect(result.code).not.toBe(0);
    expect(result.stderr).toMatch(/off, allowlist, open/);
  });
});
