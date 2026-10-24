import {
  camera,
  createAuraApp,
  environments,
  interactions,
  lights,
  material,
  primitives,
  scene
} from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

// Metallic, rough PBR surface (not unlit): reflections come from the IBL probe.
const cubeMaterial = material.pbr({
  color: "#c9a56a",
  metalness: 0.9,
  roughness: 0.38,
  envMapIntensity: 1.2
});

const cubeScene = scene()
  .background("#2a2a2a")
  // Image-based light so the metal has something to reflect; background stays dark grey.
  .add(environments.metalStudio({ background: false, intensity: 1 }))
  // Key light (warm, from upper right front).
  .add(lights.directional({ name: "key light", position: [4, 5, 4], target: [0, 0, 0], intensity: 2.4, color: "#fff4e5" }))
  // Fill light (cool, from the opposite side, weaker).
  .add(lights.directional({ name: "fill light", position: [-5, 2, 3], target: [0, 0, 0], intensity: 0.9, color: "#bcd4ff" }))
  // Rim light from behind to separate the silhouette from the background.
  .add(lights.directional({ name: "rim light", position: [-2, 3, -5], target: [0, 0, 0], intensity: 1.1, color: "#ffffff" }))
  .add(lights.hemisphere({ name: "ambient fill", skyColor: "#9aa7b8", groundColor: "#30302f", intensity: 0.5 }))
  .add(
    primitives
      .box({ name: "pbr cube", material: cubeMaterial, castShadow: true })
      .position(0, 0, 0)
      .scale(1.4)
      .runtime({ id: "cube", mutable: true })
  )
  .add(interactions.orbit({ target: "pbr cube" }))
  .camera(camera.orbit({ position: [3.6, 2.4, 4.6], target: [0, 0, 0], fov: 40 }));

const app = createAuraApp("#app", {
  scene: cubeScene,
  resize: false,
  pixelRatio: 1
});

const SPIN_Y = 0.7; // rad/s
const SPIN_X = 0.3; // rad/s
let angleY = 0.4;
let angleX = 0.25;
let readySignalled = false;

app.onFrame((frame) => {
  const dt = Number.isFinite(frame.dt) ? frame.dt : 1 / 60;
  angleY += SPIN_Y * dt;
  angleX += SPIN_X * dt;
  const cube = app.nodes.get("cube");
  if (cube) cube.setRotation(angleX, angleY, 0);
  if (!readySignalled) {
    readySignalled = true;
    // Flag after the first frame has actually been presented.
    requestAnimationFrame(() => {
      window.__EVAL_READY__ = true;
    });
  }
});
