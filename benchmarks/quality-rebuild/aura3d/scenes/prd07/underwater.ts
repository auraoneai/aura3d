// PRD-07 P4-T8 S17 — prd07-underwater (per-channel absorption σ=(0.42,0.11,0.07)).
import { runPrd07AuraScene, type Prd07RunOptions } from "./common";
import { getPrd07SceneSpec } from "../../../scenes/prd07/specs";

export default (host: HTMLElement, opts?: Prd07RunOptions) => runPrd07AuraScene(getPrd07SceneSpec("prd07-underwater"), host, opts);
