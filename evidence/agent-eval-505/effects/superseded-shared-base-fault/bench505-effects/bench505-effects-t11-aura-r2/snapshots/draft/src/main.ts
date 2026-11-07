import { createAuraApp, scene, lights } from "@aura3d/engine";

const app = createAuraApp("#app", { scene: scene().add(lights.point({ name: "p" }).runtime({ id: "p", mutable: true })) });
const h = app.nodes.require("p");
h.setIntensity(1);
h.setVisible(true);
h.setColor("#fff");
h.setEmissive("#fff");
h.setOpacity(1);
const x: number = h;
void x;
