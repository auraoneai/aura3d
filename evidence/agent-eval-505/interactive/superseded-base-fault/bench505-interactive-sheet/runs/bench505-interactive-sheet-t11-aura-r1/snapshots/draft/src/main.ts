import { createAuraApp, scene } from "@aura3d/engine";
const app = createAuraApp("#app", { scene: scene({ background: "#000" }) });
const c = app.camera;
if (c) { const k: number = c; console.log(k); }
await app.ready();
