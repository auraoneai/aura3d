// PRD-07 P4-T8 S15 — three r185 adapter (FogExp2 approximation of height fog).
import { runPrd07ThreeScene } from "./common";
import { getPrd07SceneSpec } from "../../../scenes/prd07/specs";

export default (host: HTMLElement) => runPrd07ThreeScene(getPrd07SceneSpec("prd07-fog-height"), host);
