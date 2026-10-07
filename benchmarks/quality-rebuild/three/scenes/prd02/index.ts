/**
 * Lane prd02 three-side adapters (PRD-02 §16.1). Same spec, translated by the
 * shared `three/common.ts` — the reference arm of every prd02 comparison.
 */
import { runThreeScene } from "../../common";
import type { ReadyPayload, SceneSpec } from "../../../shared/types";
import { getPrd02Spec } from "../../../scenes/prd02/specs";

export type Prd02Adapter = (host: HTMLElement) => Promise<ReadyPayload>;

export function threeAdapterFor(sceneId: string): Prd02Adapter {
  const spec: SceneSpec = getPrd02Spec(sceneId);
  return (host) => runThreeScene(spec, host);
}
