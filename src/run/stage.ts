import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative } from "node:path";

export interface StageOptions {
  /** The user's real home folder. */
  realHome: string;
  /** Private folder that becomes the home inside the sandbox. */
  stagedHome: string;
  /** Read-write grants. Only those inside the home that are files or do not exist yet are staged. */
  grants: string[];
}

interface Entry {
  real: string;
  staged: string;
  /** Content at start, or undefined if the grant did not exist yet. */
  original: Buffer | undefined;
}

export interface Staged {
  entries: Entry[];
}

/**
 * Why staging exists: a single file bind-mounted into the sandbox cannot be
 * replaced by rename (EBUSY), which is how most programs save settings
 * safely. So granted files are copied into a private home before the run
 * and copied back afterwards. Grants that do not exist yet are watched, so
 * a tool's first run can create its config. Existing folders are not staged;
 * they are mounted live, where renames work.
 */
export function stageIn({ realHome, stagedHome, grants }: StageOptions): Staged {
  mkdirSync(stagedHome, { recursive: true });
  const entries: Entry[] = [];
  for (const real of grants) {
    const rel = relative(realHome, real);
    if (!rel || rel.startsWith("..") || isAbsolute(rel)) continue;
    const kind = kindOf(real);
    if (kind === "dir") continue;

    const staged = join(stagedHome, rel);
    mkdirSync(dirname(staged), { recursive: true });
    if (kind === "file") {
      copyFileSync(real, staged);
      entries.push({ real, staged, original: readFileSync(real) });
    } else {
      entries.push({ real, staged, original: undefined });
    }
  }
  return { entries };
}

/**
 * Copy changes back to the real home. Returns the real paths written.
 * A copy the tool deleted is never turned into a deletion of the real file.
 * Changes made outside the sandbox during the run are overwritten (by design).
 */
export function stageOut({ entries }: Staged): string[] {
  const written: string[] = [];
  for (const { real, staged, original } of entries) {
    const kind = kindOf(staged);
    if (kind === "missing") continue;
    if (kind === "dir") {
      if (original !== undefined) continue; // was a file; a folder in its place is not copied back
      cpSync(staged, real, { recursive: true });
      written.push(real);
      continue;
    }
    const content = readFileSync(staged);
    if (original !== undefined && content.equals(original)) continue;
    atomicWrite(real, content);
    written.push(real);
  }
  return written;
}

function atomicWrite(path: string, content: Buffer): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.oh-really-${process.pid}.tmp`;
  writeFileSync(tmp, content);
  renameSync(tmp, path);
}

function kindOf(path: string): "file" | "dir" | "missing" {
  if (!existsSync(path)) return "missing";
  return statSync(path).isDirectory() ? "dir" : "file";
}
