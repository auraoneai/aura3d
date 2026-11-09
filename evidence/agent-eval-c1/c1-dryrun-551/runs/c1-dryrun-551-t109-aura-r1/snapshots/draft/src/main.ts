// Stub-model solution (C1 dry run only): native Aura3D car-paint product on a turntable.
import { camera, createAuraApp, group, looks, material, primitives, scene } from "@aura3d/engine";

const paint = (color: string) => material.pbr({ color, metallic: 0.55, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.04 });
const rubber = material.pbr({ color: "#16171a", roughness: 0.9 });
const chrome = material.pbr({ color: "#e8e8ec", metallic: 1, roughness: 0.08 });
const wheel = (x: number, z: number) => primitives.cylinder({ name: `wheel-${x}-${z}`, size: [0.62, 0.3, 0.62], material: rubber, rotation: [0, 0, Math.PI / 2] }).position(x, 0.31, z);
const car = group("car", [
  primitives.capsule({ name: "body", size: [1.5, 3.4, 0.95], material: paint("#b0121b"), rotation: [Math.PI / 2, 0, 0] }).position(0, 0.72, 0).runtime({ id: "body", mutable: true }),
  primitives.sphere({ name: "cabin", size: [1.1, 0.6, 1.4], material: material.pbr({ color: "#0d0f14", roughness: 0.05, metallic: 0.2 }) }).position(0, 1.12, -0.15),
  primitives.torus({ name: "trim", size: [1.55, 0.06, 1.55], material: chrome }).position(0, 0.7, 0),
  wheel(-0.78, 1), wheel(0.78, 1), wheel(-0.78, -1), wheel(0.78, -1)
]).runtime({ id: "car", mutable: true });

const app = createAuraApp("#app", {
  scene: scene()
    .add(looks.preset("product-studio", { exposureEv: -1 }))
    .add(primitives.cylinder({ name: "turntable", size: [5, 0.12, 5], material: material.pbr({ color: "#202228", roughness: 0.25, metallic: 0.3 }) }).position(0, -0.06, 0))
    .add(car)
    .camera(camera.auto({ subject: "car", fill: 0.7, elevation: 0.25 })),
  ...looks.appOptions("product-studio")
});

const w = window as unknown as { __TASK_STATE__?: unknown; __EVAL_READY__?: boolean };
let angle = 0;
app.onFrame((f) => {
  angle += 20 * f.dt;
  app.nodes.require("car").setRotation(0, (angle * Math.PI) / 180, 0);
  w.__TASK_STATE__ = { turntableAngleDeg: angle, paintFinish: "clearcoat" };
});
void app.ready().then(() => {
  w.__EVAL_READY__ = true;
});
