import { spawn } from "node:child_process";

export interface SpawnOptions {
  cwd: string;
  env: Record<string, string | undefined>;
}

const FORWARDED = ["SIGTERM", "SIGHUP"] as const;

/**
 * Run a program attached to this terminal and resolve with its exit code
 * (128 + signal number if it was killed, like a shell).
 */
export function spawnInherit(file: string, args: string[], options: SpawnOptions): Promise<number> {
  const child = isWindowsScript(file)
    ? spawn(
        process.env.ComSpec ?? "cmd.exe",
        ["/d", "/s", "/c", `"${[file, ...args].map(quoteWindowsArg).join(" ")}"`],
        {
          ...options,
          stdio: "inherit",
          windowsVerbatimArguments: true,
        },
      )
    : spawn(file, args, { ...options, stdio: "inherit" });

  // Ctrl+C reaches the child directly through the terminal; oh-really must
  // stay alive until the child has exited so it can clean up afterwards.
  const ignore = () => {};
  const forward = (signal: NodeJS.Signals) => () => child.kill(signal);
  const handlers = FORWARDED.map((s) => [s, forward(s)] as const);
  process.on("SIGINT", ignore);
  for (const [signal, handler] of handlers) process.on(signal, handler);

  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      process.off("SIGINT", ignore);
      for (const [s, handler] of handlers) process.off(s, handler);
      resolve(code ?? 128 + signalNumber(signal));
    });
  });
}

const isWindowsScript = (file: string) =>
  process.platform === "win32" && /\.(cmd|bat)$/i.test(file);

/** Quote one argument for cmd.exe + the C runtime's argv parser. */
function quoteWindowsArg(arg: string): string {
  if (arg !== "" && !/[\s"&|<>^()%!]/.test(arg)) return arg;
  return `"${arg.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, "$1$1")}"`;
}

function signalNumber(signal: NodeJS.Signals | null): number {
  const numbers: Partial<Record<NodeJS.Signals, number>> = {
    SIGHUP: 1,
    SIGINT: 2,
    SIGKILL: 9,
    SIGTERM: 15,
  };
  return (signal && numbers[signal]) ?? 1;
}
