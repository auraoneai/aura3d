// Scene 17-large-environment rendered with three@0.185.1 using its documented quality settings.
// The scene content lives in shared/scenes.ts; three/common.ts is the translator.
import { getSceneSpec } from "../shared/scenes";
import { runThreeScene } from "./common";

export default (host: HTMLElement) => runThreeScene(getSceneSpec("17-large-environment"), host);
