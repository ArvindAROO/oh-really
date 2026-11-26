import { describe, expect, it } from "vitest";
import type { SandboxPolicy } from "../../src/policy/resolve.js";
import { runEnvironment } from "../../src/run/run-env.js";

const policy: SandboxPolicy = {
  cwd: "/p",
  toolHome: "/th",
  readWrite: ["/p", "/th"],
  readOnly: [],
  hidden: [],
  network: { mode: "allowlist", allow: [] },
  envPass: ["ANTHROPIC_*"],
  gitPush: false,
};
const source = {
  PATH: "/usr/bin",
  HOME: "/home/me",
  ANTHROPIC_API_KEY: "k",
  OPENAI_API_KEY: "x",
  HTTPS_PROXY: "http://corp:3128",
};

describe("runEnvironment", () => {
  const env = runEnvironment({
    policy,
    platform: "linux",
    source,
    tmpDir: "/t",
    proxyUrl: "http://oh-really:tok@127.0.0.1:9",
  });

  it("keeps what the profile passes and drops the rest", () => {
    expect(env.ANTHROPIC_API_KEY).toBe("k");
    expect(env).not.toHaveProperty("OPENAI_API_KEY");
  });

  it("points temp folders at the private run folder", () => {
    expect(env).toMatchObject({ TMPDIR: "/t", TMP: "/t", TEMP: "/t" });
  });

  it("routes all traffic through oh-really's proxy, replacing any inherited proxy", () => {
    for (const name of [
      "HTTP_PROXY",
      "HTTPS_PROXY",
      "ALL_PROXY",
      "http_proxy",
      "https_proxy",
      "all_proxy",
    ]) {
      expect(env[name]).toBe("http://oh-really:tok@127.0.0.1:9");
    }
    expect(env.NO_PROXY).toBe("");
  });

  it("sets no proxy variables when there is no proxy", () => {
    const open = runEnvironment({
      policy,
      platform: "linux",
      source,
      tmpDir: "/t",
      proxyUrl: undefined,
    });
    expect(open).not.toHaveProperty("HTTPS_PROXY");
  });

  it("sends global installs and caches to the tool home", () => {
    expect(env).toMatchObject({
      NPM_CONFIG_PREFIX: "/th/npm",
      npm_config_cache: "/th/npm-cache",
      PYTHONUSERBASE: "/th/python",
      CARGO_HOME: "/th/cargo",
      GOPATH: "/th/go",
      XDG_CACHE_HOME: "/th/cache",
    });
  });

  it("puts the tool home's bin folders first on PATH", () => {
    expect(env.PATH).toBe("/th/npm/bin:/th/python/bin:/th/cargo/bin:/usr/bin");
  });

  it("marks the environment so shims can tell they are already sandboxed", () => {
    expect(env.OH_REALLY).toBe("1");
  });
});
