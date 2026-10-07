/**
 * `program/ProgramKey.ts` (PRD-01 §6.4) — canonical program keys.
 * `programKey` is the entry every consumer uses: normalize first so sparse
 * records key identically, then the frozen C-02 `computeProgramKey` (stable,
 * order-independent, includes registered feature ids/values).
 */

import { computeProgramKey, type ProgramFeatures } from "../contracts/program";
import { normalizeProgramFeatures } from "./ProgramFeatures";

export function programKey(features: Partial<ProgramFeatures>): string {
  return computeProgramKey(normalizeProgramFeatures(features));
}

export { computeProgramKey };
