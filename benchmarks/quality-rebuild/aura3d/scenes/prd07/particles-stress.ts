// prd07-particles-stress rendered through the Aura3D public API (S12).
import { getPrd07SceneSpec } from "../../../scenes/prd07/specs";
import { runPrd07AuraScene, type Prd07RunOptions } from "./common";

export default (host: HTMLElement, opts?: Prd07RunOptions) => runPrd07AuraScene(getPrd07SceneSpec("prd07-particles-stress"), host, opts);
