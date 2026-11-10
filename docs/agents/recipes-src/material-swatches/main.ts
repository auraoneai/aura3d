import { camera, createAuraApp, environments, interactions, lights, material, primitives, scene } from "@aura3d/engine";

// Material swatches: polished chrome, brushed gold, glazed ceramic and matte rubber spheres on a studio floor.
// The neutral environment gives the metals something to reflect; lights.key casts the contact shadows.
// material.glass() works the same way, but on primitives it draws without refraction and logs TRANSMISSION_DEGRADED: expected, not a bug to chase.
const swatches = [
  { name: "chrome", x: -2.4, material: material.chrome() },
  { name: "gold", x: -0.8, material: material.pbr({ color: "#d4a64a", metallic: 1, roughness: 0.28 }) },
  { name: "ceramic", x: 0.8, material: material.ceramic({ color: "#d9573b" }) },
  { name: "rubber", x: 2.4, material: material.pbr({ color: "#3b5bd9", roughness: 0.9 }) }
] as const;

let world = scene({ background: "#2a2e36" })
  .add(environments.neutral({ intensity: 1.1, background: false }))
  .add(lights.key({ target: [0, 0.6, 0], intensity: 3 }))
  .add(lights.directional({ name: "rim", position: [-3, 4, -5], target: [0, 0.6, 0], intensity: 1.2 }))
  .add(primitives.plane({ name: "ground", size: [16, 9], material: material.pbr({ color: "#3a3e47", roughness: 0.75 }) }));
for (const swatch of swatches) {
  world = world.add(primitives.sphere({ name: swatch.name, size: 1.25, material: swatch.material }).position(swatch.x, 0.625, 0).runtime({ id: swatch.name, mutable: true }));
}
const app = createAuraApp("#app", {
  scene: world.add(interactions.orbit({ target: "ceramic" })).camera(camera.auto({ fill: 0.75, angle: "front", elevation: 0.3 }))
});

// A slow bob per swatch so highlights travel across each surface.
let time = 0;
app.onFrame((frame) => {
  time += frame.dt;
  swatches.forEach((swatch, index) => app.nodes.require(swatch.name).setPosition(swatch.x, 0.625 + Math.sin(time * 1.4 + index) * 0.06, 0));
});
void app.ready();
