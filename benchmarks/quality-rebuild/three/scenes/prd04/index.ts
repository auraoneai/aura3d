/**
 * Lane prd04 adapter index (CONTRACTS §3.8): per-scene modules named by scene
 * id plus an `adapters` map. `main.ts` discovers lane adapters once PRD 12
 * lands registry routing (T1.2); until then the lane capture harness under
 * `tests/qr/prd04/` imports this map directly.
 */
import type { ReadyPayload } from "../../../shared/types";
import { prd04SceneSpecs } from "../../../scenes/prd04/index";
import { runPrd04ThreeScene } from "./common";

export const adapters: Record<string, (host: HTMLElement) => Promise<ReadyPayload>> = Object.fromEntries(
  Object.keys(prd04SceneSpecs).map((id) => [id, (host: HTMLElement) => runPrd04ThreeScene(prd04SceneSpecs[id], host)])
);
