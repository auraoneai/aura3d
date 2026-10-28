// Beat-three.js WP-S.1 (decision 5): a builder never accepts an option and ignores it.
// `assertKnownOptionKeys` is the shared guard: an option object carrying a key the
// builder does not read raises `OPTION_IGNORED` naming the valid keys.

import { AuraRuntimeError } from "../compiler/errors.js";

export function optionIgnored(message: string): AuraRuntimeError {
  return new AuraRuntimeError("OPTION_IGNORED", message);
}

export function assertKnownOptionKeys(builder: string, options: unknown, valid: readonly string[]): void {
  if (options === undefined || options === null || typeof options !== "object" || Array.isArray(options)) return;
  const unknown = Object.keys(options).filter((key) => !valid.includes(key) && (options as Record<string, unknown>)[key] !== undefined);
  if (unknown.length === 0) return;
  throw optionIgnored(
    `${builder}: option${unknown.length === 1 ? "" : "s"} ${unknown.map((key) => `"${key}"`).join(", ")} ${unknown.length === 1 ? "is" : "are"} not read by this builder ` +
      `and would be silently ignored. Valid options: ${valid.join(", ")}`
  );
}
