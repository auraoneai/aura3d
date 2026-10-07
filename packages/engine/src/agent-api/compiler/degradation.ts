/*
 * T4.1 — C-36 degrade() implementation (PRD-15 Phase 4).
 *
 * `createDegradationSink` produces the `SceneCompileContext.degrade` handler:
 *   strict  → throws `AuraRuntimeError(code, message, { cause })` — no silent
 *             fallback under A3D_QR_STRICT.
 *   non-strict → records the entry via `onDegradation` (C-38) and warns once
 *             per `(code, nodeId)` through `warn` (the runtime-warnings lane);
 *             a degraded frame continues.
 */

import type { AuraDegradation } from "../../contracts/compiler.js";
import { AuraRuntimeError } from "./errors.js";

export interface AuraDegradationSinkOptions {
  readonly strict: boolean;
  /** C-38 consumer hook; receives every recorded degradation (non-strict). */
  readonly onDegradation?: (degradation: AuraDegradation) => void;
  /** Non-strict warning channel (runtimeWarnings in production). */
  readonly warn?: (message: string) => void;
}

export function createDegradationSink(options: AuraDegradationSinkOptions): (d: Omit<AuraDegradation, "frame"> & { readonly frame?: number }) => void {
  const seen = new Set<string>();
  return (d) => {
    if (options.strict) {
      throw new AuraRuntimeError(d.code, d.message, { cause: d.cause });
    }
    const key = `${d.code}:${d.nodeId ?? ""}`;
    if (seen.has(key)) return; // records and warns once per (code, nodeId)
    seen.add(key);
    const entry: AuraDegradation = { ...d, frame: d.frame ?? 0 };
    options.onDegradation?.(entry);
    options.warn?.(`[${d.code}]${d.nodeId ? ` ${d.nodeId}` : ""} ${d.message}`);
  };
}
