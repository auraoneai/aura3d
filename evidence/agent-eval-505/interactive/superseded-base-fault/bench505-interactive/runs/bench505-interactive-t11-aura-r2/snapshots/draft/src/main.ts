import { createAuraApp, scene, camera } from "@aura3d/engine";

const app = createAuraApp("#app", { scene: scene().camera(camera.perspective({ position: [0, 0, 5], target: [0, 0, 0], fov: 45 })) });
const c = app.camera;
const x: number = c;
const y: number = app.nodes;
void x; void y;
