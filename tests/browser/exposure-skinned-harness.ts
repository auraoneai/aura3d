// Mounts the bench skinned-character Aura3D scene against the workspace engine (not the published package), so the
// exposure change can be measured before it ships. The scene source is the bench's own, unmodified.
import { runBench } from "../../tools/bench-vs-threejs/shared/glue";
import { start } from "../../tools/bench-vs-threejs/skinned-character/aura/scene";

void runBench("skinned-character-aura", start);
