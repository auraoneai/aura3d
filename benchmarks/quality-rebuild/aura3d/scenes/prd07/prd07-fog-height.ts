// PRD-07 P4-T8 S15 — prd07-fog-height (C-21 default height fog over ridges).
import { runPrd07AuraScene } from "./common";
import { getPrd07SceneSpec } from "../../../scenes/prd07/specs";

export default (host: HTMLElement) => runPrd07AuraScene(getPrd07SceneSpec("prd07-fog-height"), host);
