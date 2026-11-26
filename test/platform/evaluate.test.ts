import { describe, expect, it } from "vitest";
import { evaluate, type Facts } from "../../src/platform/evaluate.js";

const linuxFacts: NonNullable<Facts["linux"]> = {
  bwrapVersion: "0.9.0",
  maxUserNamespaces: 63000,
  apparmorRestrictsUserns: false,
  wsl1: false,
};
const linux: Facts = {
  platform: "linux",
  arch: "x64",
  kernel: "6.8.0-45-generic",
  linux: linuxFacts,
};
const mac: Facts = {
  platform: "darwin",
  arch: "arm64",
  kernel: "24.1.0",
  macos: { sandboxExec: true },
};
const win: Facts = {
  platform: "win32",
  arch: "x64",
  kernel: "10.0.19045",
  windows: { build: 19045, projectFileSystem: "NTFS" },
};

const failing = (facts: Facts) =>
  evaluate(facts)
    .checks.filter((c) => !c.ok)
    .map((c) => c.id);

describe("evaluate", () => {
  it("accepts a modern Linux with bubblewrap", () => {
    const report = evaluate(linux);
    expect(report.backend).toBe("linux-bwrap");
    expect(report.supported).toBe(true);
  });

  it("rejects Linux without bubblewrap and says how to get it", () => {
    const report = evaluate({ ...linux, linux: { ...linuxFacts, bwrapVersion: undefined } });
    expect(report.supported).toBe(false);
    expect(report.checks.find((c) => c.id === "bwrap")?.hint).toMatch(/install/i);
  });

  it("rejects bubblewrap older than 0.4", () => {
    expect(failing({ ...linux, linux: { ...linuxFacts, bwrapVersion: "0.3.3" } })).toContain(
      "bwrap",
    );
  });

  it("rejects Linux where user namespaces are switched off", () => {
    expect(failing({ ...linux, linux: { ...linuxFacts, maxUserNamespaces: 0 } })).toContain(
      "userns",
    );
  });

  it("explains Ubuntu's user-namespace restriction without requiring a fix", () => {
    const report = evaluate({
      ...linux,
      linux: { ...linuxFacts, apparmorRestrictsUserns: true },
    });
    expect(report.supported).toBe(false);
    expect(report.checks.find((c) => c.id === "userns")?.hint).toMatch(/AppArmor/);
  });

  it("trusts a successful bwrap probe over the AppArmor setting", () => {
    const report = evaluate({
      ...linux,
      linux: { ...linuxFacts, apparmorRestrictsUserns: true, bwrapProbe: true },
    });
    expect(report.supported).toBe(true);
  });

  it("fails when the bwrap probe fails even if settings look fine", () => {
    expect(failing({ ...linux, linux: { ...linuxFacts, bwrapProbe: false } })).toContain("userns");
  });

  it("rejects WSL1", () => {
    expect(failing({ ...linux, linux: { ...linuxFacts, wsl1: true } })).toContain("wsl1");
  });

  it("rejects unsupported CPU architectures", () => {
    expect(failing({ ...linux, arch: "ia32" })).toContain("arch");
  });

  it("accepts macOS 12+ with sandbox-exec", () => {
    expect(evaluate(mac)).toMatchObject({ backend: "macos-seatbelt", supported: true });
  });

  it("rejects macOS 11 (Darwin 20)", () => {
    expect(failing({ ...mac, kernel: "20.6.0" })).toContain("os-version");
  });

  it("rejects macOS without sandbox-exec", () => {
    expect(failing({ ...mac, macos: { sandboxExec: false } })).toContain("sandbox-exec");
  });

  it("checks the Windows build and the project drive's file system", () => {
    expect(failing({ ...win, windows: { build: 17134, projectFileSystem: "NTFS" } })).toContain(
      "os-version",
    );
    expect(failing({ ...win, windows: { build: 19045, projectFileSystem: "exFAT" } })).toContain(
      "filesystem",
    );
  });

  it("is honest that the Windows sandbox is not built yet", () => {
    const report = evaluate(win);
    expect(report.supported).toBe(false);
    expect(failing(win)).toEqual(["backend-ready"]);
  });

  it("rejects platforms it does not know", () => {
    expect(evaluate({ platform: "freebsd", arch: "x64", kernel: "14.0" })).toMatchObject({
      backend: undefined,
      supported: false,
    });
  });
});
