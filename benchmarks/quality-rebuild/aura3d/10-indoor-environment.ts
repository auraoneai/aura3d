// Scene 10-indoor-environment rendered through the Aura3D public API (@aura3d/engine createAuraApp).
// The scene content lives in shared/scenes.ts; aura3d/common.ts is the translator.
import { getSceneSpec } from "../shared/scenes";
import { runAuraScene, type RunOptions } from "./common";

export default (host: HTMLElement, opts?: RunOptions) => runAuraScene(getSceneSpec("10-indoor-environment"), host, opts);
