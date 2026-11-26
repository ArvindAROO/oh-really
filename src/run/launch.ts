import { randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Writable } from "node:stream";
import { fileURLToPath } from "node:url";
import { type RunningProxy, startProxy } from "../net/proxy.js";
import { evaluate, type Facts, type Report } from "../platform/evaluate.js";
import { gatherFacts } from "../platform/facts.js";
import type { SandboxPolicy } from "../policy/resolve.js";
import { buildBwrapArgs } from "../sandbox/linux/bwrap.js";
import { buildSeatbeltProfile } from "../sandbox/macos/seatbelt.js";
import { pathKind } from "../sandbox/path-kind.js";
import { SYSTEM_READ_ONLY } from "../sandbox/system-paths.js";
import { execRoots, findExecutable } from "./executable.js";
import { type Overrides, prepare } from "./prepare.js";
import { runEnvironment } from "./run-env.js";
import { spawnInherit } from "./spawn.js";
import { type Staged, stageIn, stageOut } from "./stage.js";

export class CommandNotFoundError extends Error {
  override name = "CommandNotFoundError";
  constructor(readonly command: string) {
    super(`command not found: ${command}`);
  }
}

export class NotSupportedError extends Error {
  override name = "NotSupportedError";
  constructor(readonly report: Report) {
    super("this system cannot enforce the oh-really sandbox");
  }
}

export interface LaunchOptions extends Overrides {
  command: string;
  args: string[];
  cwd: string;
  /** All guards down: run the command directly. */
  yolo: boolean;
  /** Where oh-really's own messages go. */
  stderr: Writable;
  /** Injected in tests; gathered from the machine otherwise. */
  facts?: Facts;
  env?: Record<string, string | undefined>;
}

/** Port the Linux relay listens on inside the sandbox's private network. */
const RELAY_PORT = 3128;
const PACKAGE_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const RELAY_MAIN = fileURLToPath(new URL("../net/relay-main.js", import.meta.url));

/** Run a command under oh-really and resolve with its exit code. */
export async function launch(options: LaunchOptions): Promise<number> {
  const env = options.env ?? process.env;
  const executable = findExecutable(options.command, env);
  if (!executable) throw new CommandNotFoundError(options.command);

  if (options.yolo) {
    options.stderr.write("oh-really: --yolo, all guards down. Running without any sandbox.\n");
    return spawnInherit(executable, options.args, { cwd: options.cwd, env });
  }

  const report = evaluate(options.facts ?? gatherFacts(options.cwd));
  if (!report.supported || !report.backend) throw new NotSupportedError(report);

  const { toolName, home, policy } = prepare(executable, options.cwd, env, options);
  mkdirSync(policy.toolHome, { recursive: true });
  const tmpDir = realpathSync(mkdtempSync(join(tmpdir(), "oh-really-")));

  let proxy: RunningProxy | undefined;
  let staged: Staged | undefined;
  try {
    const token = randomBytes(16).toString("hex");
    if (policy.network.mode === "allowlist") {
      proxy = await startProxy({
        allow: policy.network.allow,
        token,
        listen: process.platform === "linux" ? { path: join(tmpDir, "proxy.sock") } : { port: 0 },
        onEvent: (e) => {
          if (!e.allowed)
            options.stderr.write(
              `oh really? ${toolName} tried to reach ${e.host}:${e.port}, blocked\n`,
            );
        },
      });
    }
    const proxyUrl =
      proxy && process.platform === "linux"
        ? `http://oh-really:${token}@127.0.0.1:${RELAY_PORT}`
        : proxy?.url;
    const childEnv = runEnvironment({
      policy,
      platform: process.platform,
      source: env,
      tmpDir,
      proxyUrl,
    });
    const systemReadOnly = [
      ...(SYSTEM_READ_ONLY[process.platform] ?? []),
      ...execRoots({
        executable,
        nodeExecPath: process.execPath,
        realpath: (p) => realpathSync.native(p),
      }),
      PACKAGE_ROOT,
    ];
    if (process.platform === "linux") {
      staged = stageIn({
        realHome: home,
        stagedHome: join(tmpDir, "home"),
        grants: policy.readWrite,
      });
    }
    const plan = planSandbox({
      staged,
      policy,
      executable,
      args: options.args,
      home,
      tmpDir,
      systemReadOnly,
      proxy,
    });
    return await spawnInherit(plan.file, plan.args, { cwd: policy.cwd, env: childEnv });
  } finally {
    try {
      // Copy saved settings back before the staging folder is deleted.
      if (staged) stageOut(staged);
    } finally {
      await proxy?.close();
      rmSync(tmpDir, { recursive: true, force: true });
    }
  }
}

interface PlanInput {
  policy: SandboxPolicy;
  executable: string;
  args: string[];
  home: string;
  tmpDir: string;
  systemReadOnly: string[];
  proxy: RunningProxy | undefined;
  /** Linux only: files copied into a private home instead of being mounted. */
  staged: Staged | undefined;
}

function planSandbox(input: PlanInput): { file: string; args: string[] } {
  const { policy, executable, args, proxy } = input;
  if (process.platform === "darwin") {
    const proxyPort = proxy && "port" in proxy.endpoint ? proxy.endpoint.port : undefined;
    const profile = buildSeatbeltProfile(policy, {
      systemReadOnly: input.systemReadOnly,
      tmpDir: input.tmpDir,
      proxyPort,
      kindOf: pathKind,
    });
    return { file: "/usr/bin/sandbox-exec", args: ["-p", profile, "--", executable, ...args] };
  }
  if (process.platform === "linux") {
    const proxySocket = proxy && "path" in proxy.endpoint ? proxy.endpoint.path : undefined;
    const inner = proxySocket
      ? [process.execPath, RELAY_MAIN, proxySocket, String(RELAY_PORT), "--", executable, ...args]
      : [executable, ...args];
    const stagedPaths = new Set(input.staged?.entries.map((e) => e.real));
    const bwrapArgs = buildBwrapArgs(
      { ...policy, readWrite: policy.readWrite.filter((p) => !stagedPaths.has(p)) },
      {
        home: input.home,
        stagedHome: input.staged ? join(input.tmpDir, "home") : undefined,
        systemReadOnly: input.systemReadOnly,
        tmpDir: input.tmpDir,
        proxySocket,
        resolvConf: realResolvConf(),
        kindOf: pathKind,
      },
      inner[0] ?? executable,
      inner.slice(1),
    );
    return { file: "bwrap", args: bwrapArgs };
  }
  throw new Error(`no sandbox backend for ${process.platform}`);
}

/** Where /etc/resolv.conf really lives, if that is somewhere other than /etc. */
function realResolvConf(): string | undefined {
  try {
    const real = realpathSync("/etc/resolv.conf");
    return real.startsWith("/etc/") ? undefined : real;
  } catch {
    return undefined;
  }
}
