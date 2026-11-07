import { createAuraApp, scene } from "@aura3d/engine";

const app = createAuraApp("#app", { scene: scene() });
const c = app.camera;
const x: number = c;
const y: number = app.nodes;
console.log(x, y);
