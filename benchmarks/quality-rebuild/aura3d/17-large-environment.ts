// Scene 17-large-environment rendered through the Aura3D public API (@aura3d/engine createAuraApp).
// The scene content lives in shared/scenes.ts; aura3d/common.ts is the translator.
import { getSceneSpec } from "../shared/scenes";
import { runAuraScene } from "./common";

export default (host: HTMLElement) => runAuraScene(getSceneSpec("17-large-environment"), host);
