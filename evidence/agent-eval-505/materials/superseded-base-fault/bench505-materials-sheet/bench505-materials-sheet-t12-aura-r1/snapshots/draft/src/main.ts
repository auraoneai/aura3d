import { createAuraApp, scene } from "@aura3d/engine";
const app = createAuraApp("#app", { scene: scene({ background: "#000" }) });
const c = app.camera;
const x: number = c;
const y: number = (c as NonNullable<typeof c>).zzz;
const z: number = app.nodes;
void x; void y; void z;
