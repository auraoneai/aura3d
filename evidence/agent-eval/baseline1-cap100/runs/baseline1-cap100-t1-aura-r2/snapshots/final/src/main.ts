import { camera, createAuraApp, environments, interactions, lights, material, primitives, scene } from "@aura3d/engine";
import type { AuraCameraRig } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

/** The orbit rig returned by `camera.rigs.orbit` also exposes drag/angle setters. */
interface OrbitRig extends AuraCameraRig {
  dragBy(dxPx: number, dyPx: number, sensitivityDegPerPx?: number): void;
}

const canvas = document.getElementById("app");
if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error("canvas#app not found");
}

const CUBE_ID = "hero-cube";
const CAMERA_DISTANCE = 6.4;
const CAMERA_FOV = 40;
const START_YAW = 35;
const START_PITCH = 22;

// Brushed-steel style PBR cube: clearly metallic but rough enough to show broad highlights.
const cubeMaterial = material.pbr({
  color: "#b9c2cc",
  metallic: 0.9,
  roughness: 0.38,
  envMapIntensity: 1.2
});

const cube = primitives
  .box({
    name: CUBE_ID,
    size: 1.7,
    material: cubeMaterial,
    castShadow: true
  })
  .position(0, 0, 0)
  .runtime({ id: CUBE_ID, mutable: true });

const world = scene()
  .background("#2a2a2e")
  // Image-based light (reflections for the metal) without painting a backdrop.
  .add(environments.neutral({ intensity: 0.9, background: false }))
  // Soft sky/ground fill so shadowed faces stay readable.
  .add(lights.hemisphere({ skyColor: "#cfd8e6", groundColor: "#3a3a40", intensity: 0.45 }))
  // Warm key light from upper front-left.
  .add(lights.directional({ name: "key", position: [4, 5, 5], target: [0, 0, 0], intensity: 2.4, color: "#fff1dd" }))
  // Cool fill from the right, weaker.
  .add(lights.directional({ name: "fill", position: [-5, 2, 3], target: [0, 0, 0], intensity: 0.9, color: "#b8ccff" }))
  // Rim light from behind to separate silhouette from the background.
  .add(lights.directional({ name: "rim", position: [-2, 3, -5], target: [0, 0, 0], intensity: 1.3, color: "#ffffff" }))
  .add(cube)
  .add(interactions.orbit({ target: CUBE_ID }))
  .camera(
    camera.perspective({
      position: [3.2, 2.6, 5.2],
      target: [0, 0, 0],
      fov: CAMERA_FOV
    })
  );

const app = createAuraApp(canvas, {
  scene: world,
  resize: false,
  pixelRatio: 1,
  autoStart: true
});

// Orbit rig: yaw/pitch springs around the cube; pointer drag steers it.
const orbit = camera.rigs.orbit({
  target: [0, 0, 0],
  distance: CAMERA_DISTANCE,
  yaw: START_YAW,
  pitch: START_PITCH,
  pitchLimits: [-80, 80],
  fov: CAMERA_FOV,
  halflife: 0.06
}) as OrbitRig;
app.camera?.use(orbit);

// Pointer drag -> orbit (works while the cube keeps spinning).
let dragging = false;
let lastX = 0;
let lastY = 0;
canvas.style.touchAction = "none";
canvas.style.cursor = "grab";
canvas.addEventListener("pointerdown", (e: PointerEvent) => {
  dragging = true;
  lastX = e.clientX;
  lastY = e.clientY;
  canvas.setPointerCapture(e.pointerId);
  canvas.style.cursor = "grabbing";
  e.preventDefault();
});
canvas.addEventListener("pointermove", (e: PointerEvent) => {
  if (!dragging) return;
  orbit.dragBy(e.clientX - lastX, e.clientY - lastY, 0.4);
  lastX = e.clientX;
  lastY = e.clientY;
});
const endDrag = (e: PointerEvent): void => {
  if (!dragging) return;
  dragging = false;
  canvas.style.cursor = "grab";
  if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
};
canvas.addEventListener("pointerup", endDrag);
canvas.addEventListener("pointercancel", endDrag);

// Continuous self-rotation, independent of camera interaction.
let ready = false;
const markReady = (): void => {
  if (ready) return;
  ready = true;
  // Defer one rAF so the first frame has actually been presented.
  requestAnimationFrame(() => {
    window.__EVAL_READY__ = true;
  });
};

app.onFrame((frame) => {
  const handle = app.nodes.get(CUBE_ID);
  if (handle) {
    const t = frame.time;
    handle.setRotation(t * 0.45, t * 0.8, t * 0.15);
  }
  markReady();
});

void app.ready().then(() => {
  // Fallback in case no frame callback has fired yet.
  requestAnimationFrame(markReady);
});
