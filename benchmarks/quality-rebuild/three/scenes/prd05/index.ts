/**
 * Lane prd05 three adapter index (CONTRACTS §3.8): adapters map keyed by scene
 * id; per-scene modules are `optimized-*.ts` siblings for registry routing.
 */
import type { ReadyPayload } from "../../../shared/types";
import { prd05SceneSpecs } from "../../../scenes/prd05/index";
import { runPrd05ThreeScene, type Prd05ThreeSceneOptions } from "./common";

export type Prd05AdapterFn = (host: HTMLElement, options?: Prd05ThreeSceneOptions) => Promise<ReadyPayload>;

export const adapters: Record<string, Prd05AdapterFn> = Object.fromEntries(
  Object.keys(prd05SceneSpecs).map((id) => [id, (host, options) => runPrd05ThreeScene(prd05SceneSpecs[id]!, host, options)])
);
