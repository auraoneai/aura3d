/**
 * Lane prd04 adapter index (CONTRACTS §3.8): per-scene modules named by scene
 * id plus an `adapters` map. `main.ts` discovers lane adapters once PRD 12
 * lands registry routing (T1.2); until then the lane capture harness under
 * `tests/qr/prd04/` imports this map directly.
 */
import type { ReadyPayload } from "../../../shared/types";
import { prd04SceneSpecs } from "../../../scenes/prd04/index";
import { runPrd04ThreeScene } from "./common";

export type Prd04AdapterFn = (host: HTMLElement, options?: { readonly qrFlags?: readonly string[] }) => Promise<ReadyPayload>;

export const adapters: Record<string, Prd04AdapterFn> = Object.fromEntries(
  // three.js is the flag-free reference oracle — A3D_QR_* flags don't apply.
  Object.keys(prd04SceneSpecs).map((id) => [id, (host) => runPrd04ThreeScene(prd04SceneSpecs[id], host)])
);
