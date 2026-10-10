/**
 * P-22 (PRD-16 Track P): the one shared "require, or skip locally" helper.
 *
 * Browser specs that depend on runner capabilities (WebGL2, a WebGPU adapter,
 * a built dist, an LFS asset) used to `test.skip(...)` whenever the capability
 * was missing. On CI that turned a broken runner or a missing build into a
 * green run. The rule now:
 *
 *   - locally (no `CI` env): a missing requirement skips, with the reason;
 *   - on CI: a missing requirement FAILS, unless its id is listed in
 *     `integrated-pending.json` (owner, issue, expiry). Listed skips are still
 *     reported by `noSkipInCiReporter`, so they stay visible.
 *
 * Usage inside a test body:
 *
 *   requireOrSkip(test, hasWebGL2, "webgl2", "runner must expose WebGL2");
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export interface IntegratedPendingEntry {
  /** Requirement id passed to requireOrSkip. */
  readonly id: string;
  /** Owning lane, e.g. "prd09". */
  readonly owner: string;
  /** Tracking issue number; every listed skip needs one. */
  readonly issue: number;
  /** ISO date after which the entry no longer excuses a CI skip. */
  readonly expires: string;
  readonly reason: string;
}

interface SkipCapable {
  skip(condition: boolean, description?: string): void;
}

const here = dirname(fileURLToPath(import.meta.url));

/** Entries from tests/support/integrated-pending.json (validated). */
export function integratedPending(now: Date = new Date()): readonly IntegratedPendingEntry[] {
  const raw = JSON.parse(readFileSync(join(here, "integrated-pending.json"), "utf8")) as { entries?: unknown };
  const entries = Array.isArray(raw.entries) ? raw.entries : [];
  return entries.filter((entry): entry is IntegratedPendingEntry => {
    const e = entry as Partial<IntegratedPendingEntry>;
    const valid = typeof e.id === "string" && typeof e.owner === "string" && Number.isInteger(e.issue) &&
      typeof e.expires === "string" && !Number.isNaN(Date.parse(e.expires)) && typeof e.reason === "string";
    return valid && Date.parse(e.expires as string) >= now.getTime();
  });
}

export function isIntegratedPending(id: string, now: Date = new Date()): boolean {
  return integratedPending(now).some((entry) => entry.id === id);
}

export class RequirementMissingError extends Error {
  constructor(public readonly requirementId: string, reason: string) {
    super(`P-22 REQUIREMENT_MISSING:${requirementId} — ${reason} (CI must not skip; list it in tests/support/integrated-pending.json with an owner and issue if this is tracked)`);
    this.name = "RequirementMissingError";
  }
}

/**
 * Enforce `condition`. Locally a false condition skips; on CI it throws unless
 * `id` is an unexpired integrated-pending entry (then it skips, and the
 * reporter lists it).
 */
export function requireOrSkip(test: SkipCapable, condition: boolean, id: string, reason: string, env: NodeJS.ProcessEnv = process.env): void {
  if (condition) return;
  if (!env.CI || isIntegratedPending(id)) {
    test.skip(true, `requireOrSkip:${id} — ${reason}`);
    return;
  }
  throw new RequirementMissingError(id, reason);
}
