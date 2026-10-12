/** Lane prd03 adapter — prd03-taa (PRD-03 Phase 4). */
import { runAuraScene, type RunOptions } from "../../common";
import { PRD03_SCENE_SPECS } from "../../../scenes/prd03/specs";

// Debug probe: v2 S5 records the dilated velocity at the 1-px line (GL
// pixel 640,359 at 1280x720) into diagnostics().post.stagesRan, and a
// per-frame current/resolved column log collected into payload.extra.
(globalThis as { __A3D_QR_POST_PROBE__?: readonly [number, number] }).__A3D_QR_POST_PROBE__ = [640, 359];

export default (host: HTMLElement, opts?: RunOptions) => runAuraScene(PRD03_SCENE_SPECS["prd03-taa"], host, {
  ...opts,
  collectExtra: () => ({ taaProbeLog: (globalThis as { __A3D_QR_POST_PROBE_LOG__?: string[] }).__A3D_QR_POST_PROBE_LOG__ ?? [] })
});
