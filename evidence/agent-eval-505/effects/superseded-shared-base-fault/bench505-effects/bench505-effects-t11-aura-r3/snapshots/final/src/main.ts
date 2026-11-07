import { createAuraApp, scene, primitives } from "@aura3d/engine";

const app = createAuraApp("#app", { scene: scene().add(primitives.box({ name: "a" }).runtime({ id: "a", mutable: true })) });
const h = app.nodes.require("a");
const keys: number = h;
console.log(keys);
