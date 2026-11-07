// Glass hall: `material.pbr({ side: "double" })` vs `doubleSided: true`, a spot light with `castShadow: true` vs
// `shadow: true`, and a runtime `setLight({ skyColor })` vs `setLight({ color })`. ?variant=alias uses the three.js spellings.
import { camera, createAuraApp, environments, lights, material, primitives, scene } from "@aura3d/engine";

const params = new URLSearchParams(location.search);
const alias = params.get("variant") === "alias";
const pane = alias ? material.pbr({ color: "#9fd0e6", roughness: 0.1, opacity: 0.35, side: "double" }) : material.pbr({ color: "#9fd0e6", roughness: 0.1, opacity: 0.35, doubleSided: true });
const lamp = alias
  ? lights.spot({ name: "lamp", position: [0, 4.2, 1.5], target: [0, 0, 0], angle: 0.9, intensity: 120, color: "#ffd9a0", castShadow: true })
  : lights.spot({ name: "lamp", position: [0, 4.2, 1.5], target: [0, 0, 0], angle: 0.9, intensity: 120, color: "#ffd9a0", shadow: true });
const sky = lights.hemisphere({ name: "sky", skyColor: "#88aaff", groundColor: "#1c1a18", intensity: 0.8 }).runtime({ id: "sky", mutable: true });

const app = createAuraApp("#app", {
  autoStart: false,
  scene: scene({ background: "#10141a" })
    .add(environments.neutral({ intensity: 0.5, background: false }))
    .add(sky)
    .add(lamp)
    .add(primitives.plane({ name: "floor", size: [12, 1, 12], material: material.pbr({ color: "#6b6560", roughness: 0.8 }) }))
    .add(primitives.box({ name: "pane-a", size: [3, 2, 0.06], material: pane }).position(-1.2, 1, 0.4).rotate(0, 0.4, 0))
    .add(primitives.box({ name: "pane-b", size: [3, 2, 0.06], material: pane }).position(1.4, 1, -0.6).rotate(0, -0.5, 0))
    .add(primitives.sphere({ name: "orb", size: 0.9, material: material.pbr({ color: "#e0603f", roughness: 0.35 }) }).position(0, 0.45, 0))
    .camera(camera.perspective({ position: [4.2, 2.6, 5.2], target: [0, 1, 0], fov: 44 }))
});
try {
  await app.ready();
  const node = app.nodes.require("sky");
  if (alias) node.setLight({ skyColor: "#ffc080" }); else node.setLight({ color: "#ffc080" });
  Object.assign(window, { __PROOF_APP__: app, __PROOF_READY__: true });
} catch (error) {
  Object.assign(window, { __PROOF_ERROR__: String(error), __PROOF_APP__: app });
  throw error;
}
