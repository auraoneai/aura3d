// prd07-impact-library rendered through the Aura3D public API (S3 contact
// sheet). Aura-only: no three.js adapter — judged absolutely, never parity.
import { getPrd07SceneSpec } from "../../../scenes/prd07/specs";
import { runPrd07AuraScene, type Prd07RunOptions } from "./common";

export default (host: HTMLElement, opts?: Prd07RunOptions) => runPrd07AuraScene(getPrd07SceneSpec("prd07-impact-library"), host, opts);
