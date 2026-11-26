import { describe, expect, it } from "vitest";
import { buildEnv } from "../../src/sandbox/env.js";

const source = {
  PATH: "/usr/bin",
  HOME: "/home/me",
  TERM: "xterm",
  LC_ALL: "C",
  OPENAI_API_KEY: "sk-secret",
  AWS_SECRET_ACCESS_KEY: "aws-secret",
  ANTHROPIC_API_KEY: "ant-key",
  ANTHROPIC_BASE_URL: "https://example",
};

describe("buildEnv", () => {
  it("drops everything that is not explicitly passed", () => {
    const env = buildEnv({ source, pass: [], platform: "linux", set: {} });
    expect(env).not.toHaveProperty("OPENAI_API_KEY");
    expect(env).not.toHaveProperty("AWS_SECRET_ACCESS_KEY");
    expect(env).not.toHaveProperty("ANTHROPIC_API_KEY");
  });

  it("keeps the basics every program needs", () => {
    const env = buildEnv({ source, pass: [], platform: "linux", set: {} });
    expect(env).toMatchObject({ PATH: "/usr/bin", HOME: "/home/me", TERM: "xterm", LC_ALL: "C" });
  });

  it("passes variables matching the profile's patterns", () => {
    const env = buildEnv({ source, pass: ["ANTHROPIC_*"], platform: "linux", set: {} });
    expect(env.ANTHROPIC_API_KEY).toBe("ant-key");
    expect(env.ANTHROPIC_BASE_URL).toBe("https://example");
    expect(env).not.toHaveProperty("OPENAI_API_KEY");
  });

  it("matches names case-insensitively on Windows and keeps Windows essentials", () => {
    const env = buildEnv({
      source: {
        Path: "C:\\Windows",
        SystemRoot: "C:\\Windows",
        anthropic_api_key: "k",
        Secret: "x",
      },
      pass: ["ANTHROPIC_*"],
      platform: "win32",
      set: {},
    });
    expect(env).toEqual({ Path: "C:\\Windows", SystemRoot: "C:\\Windows", anthropic_api_key: "k" });
  });

  it("applies oh-really's own values last", () => {
    const env = buildEnv({
      source,
      pass: [],
      platform: "linux",
      set: { HOME: "/sandbox", TMPDIR: "/t" },
    });
    expect(env.HOME).toBe("/sandbox");
    expect(env.TMPDIR).toBe("/t");
  });

  it("replaces a Windows variable regardless of its spelling when setting it", () => {
    const env = buildEnv({
      source: { Temp: "C:\\old" },
      pass: ["TEMP"],
      platform: "win32",
      set: { TEMP: "C:\\new" },
    });
    expect(env).toEqual({ TEMP: "C:\\new" });
  });
});
