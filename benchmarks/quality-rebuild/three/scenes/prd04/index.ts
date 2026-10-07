/**
 * Lane prd04 adapter index (CONTRACTS §3.8): per-scene modules named by scene
 * id plus an `adapters` map. `main.ts` discovers lane adapters once PRD 12
 * lands registry routing (T1.2); until then the lane capture harness under
 * `tests/qr/prd04/` imports this map directly.
 */
import type { ReadyPayload } from "../../../shared/types";
import { prd04SceneSpecs } from "../../../scenes/prd04/index";
import { runPrd04ThreeScene, type Prd04ThreeSceneOptions } from "./common";

export type Prd04AdapterFn = (host: HTMLElement, options?: {
  readonly qrFlags?: readonly string[];
  readonly transmission?: "auto" | "env" | "off";
} & Prd04ThreeSceneOptions) => Promise<ReadyPayload>;

export const adapters: Record<string, Prd04AdapterFn> = Object.fromEntries(
  // three.js is the flag-free reference oracle — A3D_QR_* flags don't apply;
  // probe controls (tint/strip/pixels) do.
  Object.keys(prd04SceneSpecs).map((id) => [id, (host, options) => runPrd04ThreeScene(
    prd04SceneSpecs[id],
    host,
    {
      ...(options?.tint !== undefined ? { tint: options.tint } : {}),
      ...(options?.strip !== undefined ? { strip: options.strip } : {}),
      ...(options?.pixels !== undefined ? { pixels: options.pixels } : {})
    }
  )])
);
