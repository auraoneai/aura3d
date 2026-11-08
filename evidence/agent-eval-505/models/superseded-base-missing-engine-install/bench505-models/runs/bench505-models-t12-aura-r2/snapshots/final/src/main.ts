import { createAuraApp, scene } from "@aura3d/engine";

const app = createAuraApp("#app", { scene: scene({ background: "#000" }) });
const c = app.camera;
const n: number = c;
const m: number = app.nodes;
export { n, m };
