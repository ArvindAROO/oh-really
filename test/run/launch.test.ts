import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import type { Facts } from "../../src/platform/evaluate.js";
import { CommandNotFoundError, launch, NotSupportedError } from "../../src/run/launch.js";

const unsupported: Facts = { platform: "freebsd", arch: "x64", kernel: "14.0" };

function capture() {
  const stream = new PassThrough();
  let text = "";
  stream.on("data", (d) => (text += d));
  return { stream, text: () => text };
}

describe("launch", () => {
  it("with --yolo runs the command directly and returns its exit code", async () => {
    const err = capture();
    const code = await launch({
      command: process.execPath,
      args: ["-e", "process.exit(7)"],
      cwd: process.cwd(),
      yolo: true,
      stderr: err.stream,
    });
    expect(code).toBe(7);
  });

  it("with --yolo warns that all guards are down", async () => {
    const err = capture();
    await launch({
      command: process.execPath,
      args: ["-e", ""],
      cwd: process.cwd(),
      yolo: true,
      stderr: err.stream,
    });
    expect(err.text()).toMatch(/all guards down/i);
  });

  it("refuses to run on a machine that cannot enforce the sandbox", async () => {
    const err = capture();
    await expect(
      launch({
        command: process.execPath,
        args: ["-e", "require('fs').writeFileSync('should-not-exist','')"],
        cwd: process.cwd(),
        yolo: false,
        stderr: err.stream,
        facts: unsupported,
      }),
    ).rejects.toBeInstanceOf(NotSupportedError);
  });

  it("reports a command that cannot be found", async () => {
    const err = capture();
    await expect(
      launch({
        command: "definitely-not-a-real-tool-xyz",
        args: [],
        cwd: process.cwd(),
        yolo: true,
        stderr: err.stream,
      }),
    ).rejects.toBeInstanceOf(CommandNotFoundError);
  });
});
