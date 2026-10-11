// PRD-07 P3-T7 S14 — three r185 adapter (Sky.js noon + FogExp2).
import { runPrd07ThreeScene } from "./common";
import { getPrd07SceneSpec } from "../../../scenes/prd07/specs";

export default (host: HTMLElement) => runPrd07ThreeScene(getPrd07SceneSpec("prd07-outdoor-sky"), host);
