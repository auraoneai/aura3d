/**
 * fal.ai API key loading for the paid generation verbs (`assets generate`, `animation generate`).
 *
 * Order: FAL_KEY env → --key-file → ~/.config/aura3d/fal.env → ~/.config/auraone/fal.env. The key itself is never
 * printed, logged, ledgered or written to provenance; callers get a `source` label for reporting and use
 * `redactSecret` on anything that could echo it back (error bodies, thrown messages).
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export type FalKeySource = "env:FAL_KEY" | "key-file" | "~/.config/aura3d/fal.env" | "~/.config/auraone/fal.env";

export interface FalKey {
  readonly key: string;
  readonly source: FalKeySource;
}

export interface LoadFalKeyOptions {
  readonly env?: NodeJS.ProcessEnv;
  /** `--key-file`, resolved from `cwd`. */
  readonly keyFile?: string;
  readonly cwd?: string;
  readonly home?: string;
}

export const FAL_KEY_FIX = "Set FAL_KEY in the environment, pass --key-file <file> (a FAL_KEY=... line or the bare key), or put FAL_KEY=... in ~/.config/aura3d/fal.env. Get a key at https://fal.ai/dashboard/keys.";

export class FalKeyMissingError extends Error {
  constructor(detail: string) {
    super(`fal.ai key not found (${detail}). ${FAL_KEY_FIX}`);
    this.name = "FalKeyMissingError";
  }
}

/** Reads `FAL_KEY=...` (optionally `export`ed / quoted) from an env-style file; a file holding only the bare key also works. */
export function parseFalEnv(text: string): string | undefined {
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?FAL_KEY\s*=\s*["']?([^"'\s]+)/);
    if (match) return match[1];
  }
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#"));
  if (lines.length === 1 && !lines[0]!.includes("=") && !/\s/.test(lines[0]!)) return lines[0];
  return undefined;
}

export function falKeyCandidates(options: LoadFalKeyOptions = {}): readonly { readonly source: FalKeySource; readonly path: string }[] {
  const home = options.home ?? homedir();
  return [
    ...(options.keyFile ? [{ source: "key-file" as const, path: resolve(options.cwd ?? process.cwd(), options.keyFile) }] : []),
    { source: "~/.config/aura3d/fal.env", path: join(home, ".config/aura3d/fal.env") },
    { source: "~/.config/auraone/fal.env", path: join(home, ".config/auraone/fal.env") }
  ];
}

export function loadFalKey(options: LoadFalKeyOptions = {}): FalKey {
  const env = options.env ?? process.env;
  const fromEnv = env.FAL_KEY?.trim();
  if (fromEnv) return { key: fromEnv, source: "env:FAL_KEY" };
  for (const candidate of falKeyCandidates(options)) {
    if (!existsSync(candidate.path)) {
      if (candidate.source === "key-file") throw new FalKeyMissingError(`--key-file ${options.keyFile} does not exist`);
      continue;
    }
    const key = parseFalEnv(readFileSync(candidate.path, "utf8"));
    if (key) return { key, source: candidate.source };
    if (candidate.source === "key-file") throw new FalKeyMissingError(`--key-file ${options.keyFile} has no FAL_KEY line`);
  }
  throw new FalKeyMissingError("FAL_KEY is unset and no fal.env file has one");
}

/** Where the key would come from, without reading it into the caller (for --dry-run reports). */
export function describeFalKeySource(options: LoadFalKeyOptions = {}): FalKeySource | undefined {
  try {
    return loadFalKey(options).source;
  } catch {
    return undefined;
  }
}

/** Replace every occurrence of the secret (and its `Key <secret>` header form) in text. */
export function redactSecret(text: string, secret: string | undefined): string {
  if (!secret || secret.length < 4) return text;
  return text.split(secret).join("[redacted]");
}
