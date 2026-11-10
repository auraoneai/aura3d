// Type-checks every call shown in llms.txt "Exact signatures" (marketing/content/llms-core.txt). Not run: tsc only.
import { camera, createAuraApp, effects, environments, group, instances, interactions, lights, lines, looks, material, primitives, scene, sky, texture } from "@aura3d/engine";

const knot = primitives.torusKnot({ name: "knot", size: 0.8, material: material.physical({ color: "#c9a46a", metallic: 1, roughness: 0.2, clearcoat: 0.8, clearcoatRoughness: 0.1 }) })
  .position(0, 1, 0).rotation(0, 0.5, 0).scale(1.2).runtime({ id: "knot", mutable: true });
const arm = group("arm", [primitives.box({ name: "upper", size: [0.2, 1, 0.2], material: material.pbr({ color: "#888", roughness: 0.5 }) })], { position: [0, 1, 0] });
const ring = lines.loop({ points: [[1, 0, 0], [0, 0, 1], [-1, 0, 0], [0, 0, -1]], colors: ["#fff", "#f00", "#fff", "#f00"] });
const path = lines.line({ points: [[0, 0, 0], [1, 1, 0]] });
const dots = instances.sphere({ name: "dots", transforms: [{ position: [0, 0, 0], scale: 0.2 }], colors: ["#ff0"], material: material.pbr({ color: "#fff" }) }).runtime({ id: "dots", mutable: true });
const glow = material.emissive({ color: "#111", emissive: "#38d6ff", emissiveIntensity: 3 });
const swatches = [material.carPaint({ color: "#b00" }), material.chrome(), material.glass(), material.ceramic({ color: "#eee" }), material.fabric({ color: "#335" }), material.pbr({ color: "#fff", opacity: 0.5, doubleSided: true, emissive: "#000", emissiveIntensity: 0 })];
const shader = material.custom({ glsl: { fragment: "out vec4 outColor; uniform float clk; void main() { outColor = vec4(vec3(sin(clk)), 1.0); }" }, uniforms: { clk: { type: "f32", value: 0 } }, transparent: false });
const pixels = texture.data({ width: 2, height: 2, data: new Uint8Array(16), format: "rgba8" });
const canvasTexture = texture.canvas({ canvas: document.createElement("canvas") });
void [pixels, canvasTexture, swatches, shader, glow];

const app = createAuraApp("#app", {
  scene: scene({ background: "#101418" })
    .add(looks.preset("product-studio", { exposureEv: -1 }))
    .add(environments.neutral({ intensity: 0.8, background: false }))
    .add(environments.studio({ preset: "softbox", intensity: 1 }))
    .add(lights.key({ target: [0, 1, 0], intensity: 3, color: "#fff4e6", shadow: true }))
    .add(lights.directional({ position: [3, 5, 2], target: [0, 0, 0], intensity: 1.5, color: "#fff", shadow: true }))
    .add(lights.point({ name: "lamp", position: [0, 2, 0], intensity: 8, color: "#ffd9a0", distance: 10, decay: 2 }).runtime({ id: "lamp", mutable: true }))
    .add(lights.rect({ position: [0, 3, 2], target: [0, 1, 0], width: 2, height: 1, intensity: 5, color: "#fff" }))
    .add(lights.softbox({ position: [2, 3, 2], target: [0, 1, 0], width: 1, height: 1 }))
    .add(lights.ambient({ intensity: 0.2, color: "#fff" }))
    .add(lights.hemisphere({ skyColor: "#bcd7ff", groundColor: "#443322", intensity: 0.6 }))
    .add(primitives.plane({ name: "ground", size: [12, 1, 12], material: material.pbr({ color: "#ccc", roughness: 0.9 }) }))
    .add(knot).add(arm).add(ring).add(path).add(dots)
    .add(primitives.cylinder({ name: "post", size: [0.2, 2, 0.2], castShadow: true, receiveShadow: true }))
    .add(primitives.ring({ name: "halo", size: 1.5, material: glow }))
    .add(effects.bloom({ intensity: 0.5, threshold: 0.8, radius: 0.5 }))
    .add(effects.particles({ name: "sparks", position: [0, 0.2, 0], rate: 80, maxParticles: 300, lifetime: [1, 1.6], speed: [2, 4], size: [0.1, 0.2], color: "#6fc8ff", gravity: 4, drag: 0.1, blend: "additive", seed: 3 }))
    .add(effects.fog({ mode: "exp2", color: "#9fb7d9", density: 0.03 }))
    .add(sky.gradient({ zenith: "#1b3a6b", horizon: "#f2a65a", ground: "#2a2018" }))
    .add(interactions.orbit({ target: "knot" }))
    .camera(camera.auto({ subject: "knot", fill: 0.6, angle: "three-quarter", elevation: 0.3 })),
  ...looks.appOptions("product-studio")
});
const specs = [camera.orbit({ position: [4, 3, 6], target: [0, 1, 0], fov: 35 }), camera.perspective({ position: [0, 2, 6], target: [0, 1, 0], fov: 40 }), camera.flythrough({ position: [0, 5, 20], target: [0, 0, 0], fov: 55, from: [0, 5, 20], to: [0, 3, -20] })];
void specs;
app.onFrame((f) => {
  const h = app.nodes.require("knot");
  h.setPosition(0, 1 + Math.sin(f.time) * 0.1, 0).setRotation(0, f.time * 0.5, 0).setScale(1.2).setScale([1, 1.2, 1]).translate(0, 0, 0);
  h.setVisible(true);
  h.setMaterial(material.pbr({ color: "#c9a46a", metallic: 1, roughness: 0.25 }));
  h.setColor?.("#ff0000");
  h.setEmissive?.("#ff8800", 2);
  h.setOpacity?.(1);
  app.nodes.require("lamp").setLight?.({ color: "#ffeecc", intensity: 6, distance: 8 }, { transitionSeconds: 0.3 });
  app.nodes.require("lamp").setIntensity?.(6);
  app.nodes.require("dots").setInstances([{ position: [0, Math.sin(f.time), 0], scale: 0.2 }], ["#ff0"]);
  app.nodes.get("maybe")?.setUniform?.("clk", f.time);
  app.camera?.setPose({ position: [4, 3, 6], target: [0, 1, 0], fov: 35 }, { cut: true });
  app.camera?.setPose(camera.framePose({ min: [-1, 0, -1], max: [1, 2, 1] }, { fill: 0.6, azimuth: f.time * 0.2, aspect: 16 / 9 }));
  app.atmosphere?.setFog({ mode: "exp2", color: "#9fb7d9", density: 0.02 });
  if (app.time) app.time.scale = 1;
});
app.pause(); app.resume();
void app.ready();
