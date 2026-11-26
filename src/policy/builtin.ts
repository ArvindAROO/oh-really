import { fileURLToPath } from "node:url";

/**
 * Built-in profiles live in `<package>/profiles`. This file sits at
 * `src/policy/` in development and `dist/policy/` when installed, so the
 * same relative path works in both.
 */
export const BUILTIN_PROFILES_DIR = fileURLToPath(new URL("../../profiles/", import.meta.url));
