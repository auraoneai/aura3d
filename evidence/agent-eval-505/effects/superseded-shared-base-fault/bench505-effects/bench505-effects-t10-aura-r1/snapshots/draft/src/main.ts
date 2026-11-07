import { createAuraApp, scene, material, camera } from "@aura3d/engine";

const m = material.custom({ glsl: { fragment: "" }, uniforms: { a: { type: "bogus", value: 0 } } });
const app = createAuraApp("#app", { scene: scene({ background: "#000" }).camera(camera.perspective({ position: [0, 1, 2], target: [0, 0, 0], fov: 50, bogus: 1 })) });
const c: number = app.camera;
const e: number = app.effects;
const h: number = app.nodes.require("x");
void m; void c; void e; void h;
