/**
 * The wordmark shown above oh-really's own commands (`--help`, `doctor`, `explain`).
 * Never shown when launching a tool: that output belongs to the tool.
 */
export const WORDMARK: readonly string[] = [
  "       _                            _ _         ___  ___",
  "  ___ | |__        _ __  ___   __ _| | |_   _  |__ \\|__ \\",
  " / _ \\| '_ \\ _____| '__|/ _ \\ / _` | | | | | |   / /  / /",
  "| (_) | | | |_____| |  |  __/| (_| | | | |_| |  |_|  |_|",
  " \\___/|_| |_|     |_|   \\___| \\__,_|_|_|\\__, |  (_)  (_)",
  "                                        |___/",
];

export const TAGLINE = "Your CLI tools, on a leash.";

const WIDTH = Math.max(...WORDMARK.map((line) => line.length));

/** What the banner needs to know about the stream it is written to. */
export interface Terminal {
  isTTY?: boolean;
  columns?: number;
}

/** Only for a person at an interactive terminal: never piped, in CI, or when asked to be quiet. */
export function bannerEnabled(
  terminal: Terminal,
  env: Record<string, string | undefined>,
  quiet: boolean,
): boolean {
  if (quiet || terminal.isTTY !== true) return false;
  if (env.CI) return false;
  if (env.OH_REALLY_QUIET && env.OH_REALLY_QUIET !== "0") return false;
  return env.TERM !== "dumb";
}

/** The full wordmark, or a single line when the terminal is narrower than it. */
export function renderBanner(version: string, columns: number | undefined): string {
  const tag = `v${version}`;
  if (columns !== undefined && columns < WIDTH) {
    return `oh-really ${tag} · ${TAGLINE}\n\n`;
  }
  const footer = `  ${TAGLINE}`;
  const gap = " ".repeat(Math.max(1, WIDTH - footer.length - tag.length));
  return [...WORDMARK, `${footer}${gap}${tag}`, "", ""].join("\n");
}
