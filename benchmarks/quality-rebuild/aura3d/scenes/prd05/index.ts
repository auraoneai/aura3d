/**
 * Lane prd05 Aura adapter index (CONTRACTS §3.8): adapters map keyed by scene
 * id; per-scene modules are `optimized-*.ts` siblings for registry routing.
 */
import type { ReadyPayload } from "../../../shared/types";
import { prd05SceneSpecs } from "../../../scenes/prd05/index";
import { runPrd05AuraScene, type Prd05AuraSceneOptions } from "./common";

export type Prd05AdapterFn = (host: HTMLElement, options?: Prd05AuraSceneOptions) => Promise<ReadyPayload>;

export const adapters: Record<string, Prd05AdapterFn> = Object.fromEntries(
  Object.keys(prd05SceneSpecs).map((id) => [id, (host, options) => runPrd05AuraScene(prd05SceneSpecs[id]!, host, options)])
);
