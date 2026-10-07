// PRD-07 P3-T7 S13 — prd07-sky-timeofday (dusk dayNight sky).
import { runPrd07AuraScene } from "./common";
import { getPrd07SceneSpec } from "../../../scenes/prd07/specs";

export default (host: HTMLElement) => runPrd07AuraScene(getPrd07SceneSpec("prd07-sky-timeofday"), host);
