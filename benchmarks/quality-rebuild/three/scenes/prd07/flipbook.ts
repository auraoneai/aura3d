// prd07-flipbook rendered with three@0.185.1: Sprite + SpriteMaterial UV
// animation over the same seeded atlas (S2 reference).
import { getPrd07SceneSpec } from "../../../scenes/prd07/specs";
import { runPrd07ThreeScene } from "./common";

export default (host: HTMLElement) => runPrd07ThreeScene(getPrd07SceneSpec("prd07-flipbook"), host);
