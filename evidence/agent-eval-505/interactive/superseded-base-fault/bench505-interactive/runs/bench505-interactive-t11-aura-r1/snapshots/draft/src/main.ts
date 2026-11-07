import { createAuraApp, scene } from "@aura3d/engine";

const app = createAuraApp("#app", { scene: scene({ background: "#000000" }) });
const c: number = app.camera;
const d: number = app.camera!.setPose;
console.log(c, d);
