// prd07-trails-beams rendered through the Aura3D public API (S11 sampler).
// Aura-only: trails/beams/aurora/mesh-particles have no three.js reference.
import { getPrd07SceneSpec } from "../../../scenes/prd07/specs";
import { runPrd07AuraScene } from "./common";

export default (host: HTMLElement) => runPrd07AuraScene(getPrd07SceneSpec("prd07-trails-beams"), host);
