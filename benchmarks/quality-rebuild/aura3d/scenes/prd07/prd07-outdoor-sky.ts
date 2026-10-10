// PRD-07 P3-T7 S14 — prd07-outdoor-sky (noon preetham + exp2 fog).
import { runPrd07AuraScene, type Prd07RunOptions } from "./common";
import { getPrd07SceneSpec } from "../../../scenes/prd07/specs";

export default (host: HTMLElement, opts?: Prd07RunOptions) => runPrd07AuraScene(getPrd07SceneSpec("prd07-outdoor-sky"), host, opts);
