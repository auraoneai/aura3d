// PRD-07 P6-T7 — three r185 adapter (DecalGeometry projection).
import { runPrd07ThreeScene } from "./common";
import { getPrd07SceneSpec } from "../../../scenes/prd07/specs";

export default (host: HTMLElement) => runPrd07ThreeScene(getPrd07SceneSpec("prd07-decals"), host);
