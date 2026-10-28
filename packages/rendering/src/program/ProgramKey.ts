/**
 * `program/ProgramKey.ts` (PRD-01 §6.4) — canonical program keys.
 * `programKey` is the entry every consumer uses: normalize first so sparse
 * records key identically, then the frozen C-02 `computeProgramKey` (stable,
 * order-independent, includes registered feature ids/values).
 */

import { computeProgramKey, type ProgramFeatures } from "../contracts/program";
import { StructuralMemo } from "../contracts/structuralMemo";
import { normalizeProgramFeatures } from "./ProgramFeatures";

/** The sparse record a caller builds each frame -> its key, so a repeated record skips normalisation as well as serialisation. */
const sparseKeyMemo = new StructuralMemo<string>(24);

export function programKey(features: Partial<ProgramFeatures>): string {
  return sparseKeyMemo.resolve(features, () => computeProgramKey(normalizeProgramFeatures(features)));
}

export { computeProgramKey };
