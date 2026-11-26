import { statSync } from "node:fs";

export type PathKind = "file" | "dir" | "missing";

/** What is at `path` on the real disk. Backends take this as a parameter so they stay pure. */
export function pathKind(path: string): PathKind {
  try {
    return statSync(path).isDirectory() ? "dir" : "file";
  } catch {
    return "missing";
  }
}
