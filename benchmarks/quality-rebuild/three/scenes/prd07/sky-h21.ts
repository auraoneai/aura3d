// 07 Phase D S4 — three r185 adapter for prd07-sky-h21 (Sky.js at the dayNight sun, hour 21).
import { runPrd07ThreeScene } from "./common";
import { getPrd07SceneSpec } from "../../../scenes/prd07/specs";

export default (host: HTMLElement) => runPrd07ThreeScene(getPrd07SceneSpec("prd07-sky-h21"), host);
