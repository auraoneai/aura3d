// Articulated arm (b505 interactive/physics shape): `.rotation(x, y, z)` vs `.rotate(x, y, z)`, and HemisphereLight-style
// `color` vs `skyColor`. ?variant=alias uses the three.js spellings.
import { camera, createAuraApp, environments, group, lights, material, primitives, scene } from "@aura3d/engine";

const alias = new URLSearchParams(location.search).get("variant") === "alias";
const m = (c: string) => material.pbr({ color: c, roughness: 0.5, metalness: 0.1 });
const hemi = alias ? lights.hemisphere({ color: "#cfe4ff", groundColor: "#2a2420", intensity: 0.9 }) : lights.hemisphere({ skyColor: "#cfe4ff", groundColor: "#2a2420", intensity: 0.9 });

const upperBase = primitives.box({ name: "upper", size: [0.3, 1.4, 0.3], material: m("#d98c3f") }).position(0, 0.7, 0);
const lowerBase = primitives.box({ name: "lower", size: [0.26, 1.2, 0.26], material: m("#3f8cd9") }).position(0, 1.4, 0);
const upper = alias ? upperBase.rotation(0, 0, 0.5) : upperBase.rotate(0, 0, 0.5);
const lower = alias ? lowerBase.rotation(0.4, 0.6, -0.3) : lowerBase.rotate(0.4, 0.6, -0.3);

const app = createAuraApp("#app", {
  autoStart: false,
  scene: scene({ background: "#14181e" })
    .add(environments.neutral({ intensity: 0.4, background: false }))
    .add(hemi)
    .add(lights.directional({ name: "key", position: [4, 6, 3], intensity: 2, shadow: true }))
    .add(primitives.plane({ name: "floor", size: [14, 1, 14], material: m("#5a626c") }))
    .add(group("arm", [upper, lower]))
    .camera(camera.perspective({ position: [3.4, 2.4, 4.2], target: [0, 1.2, 0], fov: 42 }))
});
await app.ready();
Object.assign(window, { __PROOF_APP__: app, __PROOF_READY__: true });
