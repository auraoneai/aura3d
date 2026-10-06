// Scene 11-multiple-lights rendered with three@0.185.1 using its documented quality settings.
// The scene content lives in shared/scenes.ts; three/common.ts is the translator.
import { getSceneSpec } from "../shared/scenes";
import { runThreeScene, type RunOptions } from "./common";

export default (host: HTMLElement, opts?: RunOptions) => runThreeScene(getSceneSpec("11-multiple-lights"), host, opts);
