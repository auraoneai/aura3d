// Type check for docs/agents/threejs-to-aura3d.md: every "Aura3D line" in that table appears here verbatim, so
// `pnpm exec tsc -p docs/agents/recipes-src/tsconfig.json` fails when a documented call stops existing or changes shape.
// Nothing here runs; it only has to compile against the engine's public root exports.
import {
  batched, camera, createAuraApp, distanceLod, effects, environments, geometry, group, instances, interactions, labels,
  lights, material, particles, physics, primitives, raycast, scene, shadows, sky, text3D, type AuraTransformSpec
} from "@aura3d/engine";

const transforms: AuraTransformSpec[] = [{ position: [0, 0.5, 0], rotation: [0, 0.3, 0], scale: [1, 2, 1] }];
const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
const normals = new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]);

// 1 scene, camera, renderer, loop
const stage = scene({ background: "#101418" }).camera(camera.perspective({ position: [3, 2, 5], target: [0, 1, 0], fov: 45 }));
const app = createAuraApp("#app", { scene: stage });
app.onFrame((frame) => { void frame.dt; });
await app.ready();

// 2 mesh = geometry + material
stage.add(primitives.box({ name: "crate", size: [1, 1, 1], material: material.pbr({ color: "#c8a46a", roughness: 0.6 }) }));
stage.add(primitives.sphere({ name: "ball", size: 1, material: material.pbr({ color: "#ff5533" }) })); // size is the diameter

// 3 transforms, then moving something at runtime
stage.add(primitives.box({ name: "mover" }).position(0, 1, 0).rotate(0, 0.5, 0).scale(2).runtime({ id: "mover", mutable: true }));
app.nodes.require("mover").setPosition(1, 1, 0);
app.nodes.require("mover").setRotation(0, 1, 0);
app.nodes.require("mover").setScale(1.5);

// 3b E3-06 three.js spellings that compile to the canonical call (see docs/agents/guessable-api.md)
stage.add(primitives.box({ name: "tilted" }).position(0, 1, 0).rotation(0, 0.5, 0)); // mesh.rotation.set(...) == .rotate(...)
stage.add(primitives.plane({ name: "floor", size: [20, 20], material: material.pbr({ color: "#2a3038", side: "double" }) })); // PlaneGeometry(w, h) == size [w, 1, d]
stage.add(lights.directional({ position: [4, 6, 3], intensity: 3, castShadow: true })); // light.castShadow = true == shadow: true
stage.add(lights.hemisphere({ color: "#bcd7ff", groundColor: "#202428", intensity: 0.6 })); // HemisphereLight(sky, ground) == skyColor

// 4 Group / Object3D hierarchy (children use local transforms)
stage.add(group("arm", [primitives.capsule({ size: [0.1, 0.5, 0.1] }).position(0, -0.25, 0)], { position: [0, 1.4, 0] }).runtime({ id: "arm", mutable: true }));

// 5 BufferGeometry
stage.add(geometry.custom(geometry.define({ positions, normals, indices: [0, 1, 2], bounds: { min: [0, 0, 0], max: [1, 1, 0] } }), { name: "tri", material: material.pbr({ color: "#33aaff" }) }));

// 6 materials
const standard = material.pbr({ color: "#888888", roughness: 0.4, metallic: 1 });
const physical = material.physical({ color: "#d4af37", metallic: 1, roughness: 0.2, clearcoat: 0.8 });
const glow = material.emissive({ color: "#ffffff", emissive: "#46dcff", emissiveIntensity: 2 });
const shader = material.custom({ glsl: { fragment: "out vec4 outColor; void main() { outColor = vec4(1.0); }" }, uniforms: { uTint: { type: "f32", value: 0 } } });
void [standard, physical, glow, shader];
app.nodes.require("mover").setUniform?.("uTint", 1);

// 7 lights and shadows
stage.add(lights.directional({ position: [4, 6, 3], target: [0, 0, 0], intensity: 3, shadow: true }));
stage.add(lights.point({ position: [0, 3, 0], intensity: 12, distance: 10, color: "#ffb866" }));
stage.add(lights.spot({ position: [0, 5, 0], target: [0, 0, 0], angle: 0.5, penumbra: 0.4, intensity: 30 }));
stage.add(lights.hemisphere({ skyColor: "#cfe3ff", groundColor: "#4d5a3c", intensity: 0.5 }));
stage.add(lights.ambient({ intensity: 0.2 }));
stage.add(primitives.box({ castShadow: true, receiveShadow: true }));

// 8 environment, sky, fog
stage.add(environments.neutral({ intensity: 0.8, background: false }));
stage.add(sky.preetham({ sun: { elevationDeg: 35, azimuthDeg: 120 } }));
stage.add(effects.fog({ color: "#a9c9e6", density: 0.01 }));

// 9 instancing
stage.add(instances.box({ name: "bricks", transforms, colors: ["#aa5533"], material: material.pbr({ color: "#ffffff" }) }));
void [distanceLod, batched];

// 10 animation: procedural joints are runtime handles; GLB clips are played by name
app.nodes.require("arm").setRotation(0.4, 0, 0);
app.nodes.require("mover").play("Idle", { loop: true, crossFade: 0.3 });

// 11 input, picking
stage.add(interactions.orbit({ target: "crate" }));
stage.add(interactions.pointer({ target: "crate" }));
const hits = raycast({ origin: [0, 5, 0], direction: [0, -1, 0] });
void hits;

// 12 post-processing
stage.add(effects.bloom({ intensity: 0.6, threshold: 0.8, radius: 0.5 }));
stage.add(effects.vignette({ intensity: 0.3 }));

// 13 text
stage.add(text3D("Aura3D", { size: 0.5, depth: 0.1 }));
stage.add(labels.billboard("score 10", { position: [0, 2, 0] }));

// 14 particles
stage.add(effects.particles({ rate: 30, lifetime: [0.6, 1.2], speed: [1, 2], size: [0.1, 0.3], color: "#ff8a2a", blend: "additive" }));
void [particles, physics, shadows];

// 15 disposal
app.dispose();

// 16 math: immutable by default, mutable three.js-shaped classes from the compat subpath
import { Vector3 } from "@aura3d/math/three";
import { Clock } from "@aura3d/engine";
const v = new Vector3(1, 2, 3).add(new Vector3(1, 0, 0)); // mutates v and returns it
void [v, new Clock()];
