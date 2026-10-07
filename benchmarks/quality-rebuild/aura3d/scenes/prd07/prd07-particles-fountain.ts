// prd07-particles-fountain rendered through the Aura3D public API.
// Spec: benchmarks/quality-rebuild/scenes/prd07/specs.ts (S1, seed 1414).
import { getPrd07SceneSpec } from "../../../scenes/prd07/specs";
import { runPrd07AuraScene } from "./common";

export default (host: HTMLElement) => runPrd07AuraScene(getPrd07SceneSpec("prd07-particles-fountain"), host);
