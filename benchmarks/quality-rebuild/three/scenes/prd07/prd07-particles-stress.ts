// prd07-particles-stress rendered with three@0.185.1 (S12 reference).
import { getPrd07SceneSpec } from "../../../scenes/prd07/specs";
import { runPrd07ThreeScene } from "./common";

export default (host: HTMLElement) => runPrd07ThreeScene(getPrd07SceneSpec("prd07-particles-stress"), host);
