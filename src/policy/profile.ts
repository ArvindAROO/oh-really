import { parse as parseToml } from "smol-toml";
import { z } from "zod";

/** Thrown when a profile file cannot be read, parsed or validated. */
export class ProfileError extends Error {
  override name = "ProfileError";
}

const strings = z.array(z.string().min(1));

/**
 * Schema for one profile file. Every key is optional: a file is a *layer*
 * that only says what it changes. Defaults are applied once, at the end,
 * by {@link withDefaults}. Unknown keys are rejected so a typo can never
 * silently drop a rule.
 */
const layerSchema = z
  .object({
    tool: z
      .object({ name: z.string().min(1), match: strings })
      .partial()
      .strict(),
    files: z
      .object({ read_write: strings, read_only: strings, hidden: strings })
      .partial()
      .strict(),
    network: z
      .object({ mode: z.enum(["off", "allowlist", "open"]), allow: strings })
      .partial()
      .strict(),
    env: z.object({ pass: strings }).partial().strict(),
    git: z.object({ push: z.boolean() }).partial().strict(),
  })
  .partial()
  .strict();

export type ProfileLayer = z.output<typeof layerSchema>;
export type NetworkMode = "off" | "allowlist" | "open";

/** A fully resolved profile: every field present. */
export interface Profile {
  tool: { name: string | undefined; match: string[] };
  files: { read_write: string[]; read_only: string[]; hidden: string[] };
  network: { mode: NetworkMode; allow: string[] };
  env: { pass: string[] };
  git: { push: boolean };
}

/** Parse and validate one TOML profile layer. `source` is only used in error messages. */
export function parseProfile(text: string, source: string): ProfileLayer {
  let raw: unknown;
  try {
    raw = parseToml(text);
  } catch (err) {
    throw new ProfileError(`${source}: invalid TOML: ${(err as Error).message}`);
  }
  const result = layerSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new ProfileError(`${source}: invalid profile\n${issues}`);
  }
  return result.data;
}

/** Turn a layer into a complete profile, choosing the strictest value for anything unset. */
export function withDefaults(layer: ProfileLayer): Profile {
  const allow = layer.network?.allow ?? [];
  return {
    tool: { name: layer.tool?.name, match: layer.tool?.match ?? [] },
    files: {
      read_write: layer.files?.read_write ?? [],
      read_only: layer.files?.read_only ?? [],
      hidden: layer.files?.hidden ?? [],
    },
    network: { mode: layer.network?.mode ?? (allow.length > 0 ? "allowlist" : "off"), allow },
    env: { pass: layer.env?.pass ?? [] },
    git: { push: layer.git?.push ?? false },
  };
}
