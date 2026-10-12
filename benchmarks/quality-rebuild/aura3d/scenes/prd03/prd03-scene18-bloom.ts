/** Lane prd03 adapter — prd03-scene18-bloom (PRD-03 §16.1). */
import { runAuraScene, type RunOptions } from "../../common";
import { PRD03_SCENE_SPECS } from "../../../scenes/prd03/specs";

const spec = PRD03_SCENE_SPECS["prd03-scene18-bloom"];
// The shared harness maps `spec.bloom` through the frozen
// `mapThreeUnrealBloom` (bloomMapping.ts, Q-12-2) for every scene.

// Forward the harness RunOptions (qrFlags/variant/dpr): without them the
// spec's lane-default `qrFlags: ["post"]` made the flags-off capture post-on.
export default (host: HTMLElement, opts?: RunOptions) => runAuraScene(spec, host, opts);
