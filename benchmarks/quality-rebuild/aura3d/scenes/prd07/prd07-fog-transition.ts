// PRD-07 P4-T8 S16 — prd07-fog-transition (setFog transitionSeconds midpoint).
import { runPrd07AuraScene } from "./common";
import { getPrd07SceneSpec } from "../../../scenes/prd07/specs";

export default (host: HTMLElement) => runPrd07AuraScene(getPrd07SceneSpec("prd07-fog-transition"), host);
