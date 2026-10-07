/**
 * F-7b: runtime C-34 rule `look/evidence-only-feel`.
 *
 * `app.feel` emitted events but no channel produced an effect for 300+
 * frames — the signature of feel that is counted in evidence but never
 * rendered. The feel extension binds a probe via `bindFeelLintProbe` at
 * `createAuraFeelBus`; the rule reads it on each `lookLint` pass.
 */
import { registerLookLintRule, type AuraLookLintRule, type AuraLookLintFinding } from "../../../contracts/looks.js";

export interface FeelLintProbeResult {
  /** Total emits since bus creation. */
  readonly emitted: number;
  /** Executed counts per channel. */
  readonly executed: Readonly<Record<string, number>>;
  /** Frames the bus has advanced. */
  readonly frames: number;
}

let probe: (() => FeelLintProbeResult | undefined) | undefined;

export function bindFeelLintProbe(p: () => FeelLintProbeResult | undefined): void {
  probe = p;
}

export const FEEL_EVIDENCE_ONLY_FRAME_THRESHOLD = 300;

export function runEvidenceOnlyFeelCheck(e: FeelLintProbeResult | undefined): readonly AuraLookLintFinding[] {
  if (!e || e.emitted <= 0) return [];
  const anyExecuted = Object.values(e.executed).some((v) => v > 0);
  if (anyExecuted || e.frames < FEEL_EVIDENCE_ONLY_FRAME_THRESHOLD) return [];
  return [{
    code: "look/evidence-only-feel",
    severity: "error",
    message: `app.feel emitted ${e.emitted} events over ${e.frames} frames but every channel's executed is 0 — evidence-only feel (PRD-08 F-7)`
  }];
}

export const evidenceOnlyFeelRule: AuraLookLintRule = {
  code: "look/evidence-only-feel",
  owner: "prd08",
  run: () => runEvidenceOnlyFeelCheck(probe?.())
};

registerLookLintRule(evidenceOnlyFeelRule);
