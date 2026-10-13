// Scene 19-room-environment-parity rendered through the Aura3D public API (@aura3d/engine createAuraApp).
// The scene content lives in shared/scenes.ts; aura3d/common.ts is the translator.
// No environment node is authored (see the spec comment): this side exercises
// the marked-fallback neutral room, not an HDRI.
import { getSceneSpec } from "../shared/scenes";
import { runAuraScene, type RunOptions } from "./common";

export default (host: HTMLElement, opts?: RunOptions) => runAuraScene(getSceneSpec("19-room-environment-parity"), host, opts);
