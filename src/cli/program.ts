import { readFileSync } from "node:fs";
import type { Writable } from "node:stream";
import { Command, CommanderError, Option } from "commander";
import { evaluate } from "../platform/evaluate.js";
import { gatherFacts } from "../platform/facts.js";
import type { NetworkMode } from "../policy/profile.js";
import { ProfileError } from "../policy/profile.js";
import { findExecutable } from "../run/executable.js";
import { CommandNotFoundError, launch, NotSupportedError } from "../run/launch.js";
import { prepare } from "../run/prepare.js";
import { formatExplain, formatReport } from "./format.js";

export interface CliIo {
  stdout: Writable;
  stderr: Writable;
  cwd: string;
}

const { version } = JSON.parse(
  readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
) as {
  version: string;
};

/** Parse `argv` (without node and script) and run. Resolves with the process exit code. */
export async function runCli(argv: string[], io: CliIo): Promise<number> {
  let exitCode = 0;
  const program = new Command("oh-really")
    .description("Run any CLI tool so it can only touch the folder you're working in.")
    .version(version)
    .usage("[options] <tool> [tool arguments...]")
    .enablePositionalOptions()
    .passThroughOptions()
    .exitOverride()
    .configureOutput({ writeOut: (s) => io.stdout.write(s), writeErr: (s) => io.stderr.write(s) })
    .option("--yolo", "all guards down: run the tool without any sandbox")
    .option("--rw <path>", "also allow reading and changing this folder (repeatable)", collect, [])
    .addOption(
      new Option("--net <mode>", "network access for this run").choices([
        "off",
        "allowlist",
        "open",
      ]),
    )
    .argument("[tool]", "the command to run")
    .argument("[args...]", "arguments passed to the tool unchanged")
    .action(
      async (
        tool: string | undefined,
        args: string[],
        opts: { yolo?: boolean; rw: string[]; net?: NetworkMode },
      ) => {
        if (!tool) {
          program.outputHelp();
          exitCode = 2;
          return;
        }
        exitCode = await launch({
          command: tool,
          args,
          cwd: io.cwd,
          yolo: opts.yolo ?? false,
          rw: opts.rw,
          ...(opts.net ? { net: opts.net } : {}),
          stderr: io.stderr,
        });
      },
    );

  program
    .command("explain")
    .description("show in plain words what a tool is allowed to do")
    .argument("<tool>")
    .action((tool: string) => {
      const command = findExecutable(tool, process.env) ?? tool;
      const { toolName, policy, sources } = prepare(command, io.cwd, process.env);
      io.stdout.write(formatExplain(toolName, policy, sources));
    });

  program
    .command("doctor")
    .description("check that this system can enforce every protection")
    .action(() => {
      const report = evaluate(gatherFacts(io.cwd));
      io.stdout.write(formatReport(report));
      exitCode = report.supported ? 0 : 1;
    });

  try {
    await program.parseAsync(argv, { from: "user" });
    return exitCode;
  } catch (err) {
    return handleError(err, io);
  }
}

function isSpawnError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && "syscall" in err && String(err.syscall).startsWith("spawn");
}

function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}

function handleError(err: unknown, io: CliIo): number {
  if (err instanceof CommanderError) return err.exitCode;
  if (err instanceof CommandNotFoundError) {
    io.stderr.write(`oh-really: ${err.message}\n`);
    return 127;
  }
  if (err instanceof NotSupportedError) {
    io.stderr.write(`oh-really: ${err.message}.\n\n${formatReport(err.report)}`);
    return 1;
  }
  if (err instanceof ProfileError) {
    io.stderr.write(`oh-really: ${err.message}\n`);
    return 1;
  }
  if (isSpawnError(err)) {
    // Same exit code a shell uses for "found but not executable".
    io.stderr.write(`oh-really: could not start ${err.path ?? "the command"} (${err.code})\n`);
    return 126;
  }
  throw err;
}
