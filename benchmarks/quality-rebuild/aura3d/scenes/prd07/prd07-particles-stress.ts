// prd07-particles-stress rendered through the Aura3D public API (S12).
import { getPrd07SceneSpec } from "../../../scenes/prd07/specs";
import { runPrd07AuraScene } from "./common";

export default (host: HTMLElement) => runPrd07AuraScene(getPrd07SceneSpec("prd07-particles-stress"), host);
