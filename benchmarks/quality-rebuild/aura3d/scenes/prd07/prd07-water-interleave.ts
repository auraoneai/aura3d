// PRD-07 P5-T8 — prd07-water-interleave.
import { runPrd07AuraScene, type Prd07RunOptions } from "./common";
import { getPrd07SceneSpec } from "../../../scenes/prd07/specs";

export default (host: HTMLElement, opts?: Prd07RunOptions) => runPrd07AuraScene(getPrd07SceneSpec("prd07-water-interleave"), host, opts);
