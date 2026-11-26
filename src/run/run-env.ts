import path from "node:path";
import type { SandboxPolicy } from "../policy/resolve.js";
import { buildEnv } from "../sandbox/env.js";

export interface RunEnvOptions {
  policy: SandboxPolicy;
  platform: NodeJS.Platform;
  source: Record<string, string | undefined>;
  tmpDir: string;
  /** Proxy URL for allowlist mode; undefined when the network is off or open. */
  proxyUrl: string | undefined;
}

const PROXY_VARS = [
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "ALL_PROXY",
  "http_proxy",
  "https_proxy",
  "all_proxy",
];

/** The complete environment for the sandboxed program. */
export function runEnvironment({
  policy,
  platform,
  source,
  tmpDir,
  proxyUrl,
}: RunEnvOptions): Record<string, string> {
  const p = platform === "win32" ? path.win32 : path.posix;
  const home = (...parts: string[]) => p.join(policy.toolHome, ...parts);

  // Global installs land in the tool's private home instead of the real one.
  const toolHome: Record<string, string> = {
    NPM_CONFIG_PREFIX: home("npm"),
    npm_config_cache: home("npm-cache"),
    PYTHONUSERBASE: home("python"),
    CARGO_HOME: home("cargo"),
    GOPATH: home("go"),
    XDG_CACHE_HOME: home("cache"),
  };
  const bins =
    platform === "win32"
      ? [home("npm"), home("python", "Scripts"), home("cargo", "bin")]
      : [home("npm", "bin"), home("python", "bin"), home("cargo", "bin")];

  const proxy: Record<string, string> = proxyUrl
    ? { ...Object.fromEntries(PROXY_VARS.map((v) => [v, proxyUrl])), NO_PROXY: "", no_proxy: "" }
    : {};

  const env = buildEnv({
    source,
    pass: policy.envPass,
    platform,
    set: { TMPDIR: tmpDir, TMP: tmpDir, TEMP: tmpDir, ...toolHome, ...proxy, OH_REALLY: "1" },
  });

  const pathKey = Object.keys(env).find((k) => k.toUpperCase() === "PATH") ?? "PATH";
  const delimiter = platform === "win32" ? ";" : ":";
  env[pathKey] = [...bins, env[pathKey]].filter(Boolean).join(delimiter);
  return env;
}
