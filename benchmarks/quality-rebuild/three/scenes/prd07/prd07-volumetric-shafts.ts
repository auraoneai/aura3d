// PRD-07 P5-T8 — prd07-volumetric-shafts (three r185 side).
import { runPrd07ThreeScene } from "./common";
import { getPrd07SceneSpec } from "../../../scenes/prd07/specs";

export default (host: HTMLElement) => runPrd07ThreeScene(getPrd07SceneSpec("prd07-volumetric-shafts"), host);
