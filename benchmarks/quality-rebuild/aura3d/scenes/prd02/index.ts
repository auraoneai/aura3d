/**
 * Lane prd02 Aura-side adapters (PRD-02 §16.1). Each scene id maps to a module
 * default-equivalent: `(host) => ReadyPayload`, run through the shared
 * `aura3d/common.ts` translator so lane scenes get zero tuning beyond the spec.
 */
import { runAuraScene } from "../../common";
import type { ReadyPayload, SceneSpec } from "../../../shared/types";
import { getPrd02Spec } from "../../../scenes/prd02/specs";

export type Prd02Adapter = (host: HTMLElement) => Promise<ReadyPayload>;

export function auraAdapterFor(sceneId: string): Prd02Adapter {
  const spec: SceneSpec = getPrd02Spec(sceneId);
  return (host) => runAuraScene(spec, host);
}
