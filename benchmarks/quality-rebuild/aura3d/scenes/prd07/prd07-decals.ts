// PRD-07 P6-T7 — prd07-decals (§6.9 merged decal pass + surface trail).
import { runPrd07AuraScene } from "./common";
import { getPrd07SceneSpec } from "../../../scenes/prd07/specs";

export default (host: HTMLElement) => runPrd07AuraScene(getPrd07SceneSpec("prd07-decals"), host);
