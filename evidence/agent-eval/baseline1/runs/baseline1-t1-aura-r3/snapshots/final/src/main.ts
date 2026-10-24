import {
  camera,
  createAuraApp,
  environments,
  lights,
  material,
  primitives,
  scene
} from "@aura3d/engine";
import type { AuraCameraSpec } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

const canvas = document.getElementById("app") as HTMLCanvasElement;

const TARGET: [number, number, number] = [0, 0, 0];
const DISTANCE = 5.6;
const FOV = 40;

// Metallic, rough PBR cube that spins continuously (declarative "turntable" clip).
const cube = primitives
  .box({
    name: "pbr cube",
    material: material.pbr({ color: "#c9a56b", metallic: 0.9, roughness: 0.4 })
  })
  .scale([1.4, 1.4, 1.4])
  .position(0, 0, 0)
  .rotate(0.35, 0, 0.15)
  .animate({ clip: "turntable", speed: 1.2 });

// Orbit state (degrees). Dragging changes yaw/pitch; the cube keeps spinning on its own.
let yaw = 35;
let pitch = 22;

function eyePosition(): [number, number, number] {
  const y = (yaw * Math.PI) / 180;
  const p = (pitch * Math.PI) / 180;
  return [
    TARGET[0] + DISTANCE * Math.sin(y) * Math.cos(p),
    TARGET[1] + DISTANCE * Math.sin(p),
    TARGET[2] + DISTANCE * Math.cos(y) * Math.cos(p)
  ];
}

const world = scene({ background: "#2b2b2b" })
  .add(cube)
  .add(environments.studio({ intensity: 1.0 }))
  .add(lights.ambient({ intensity: 0.25 }))
  .add(lights.directional({ name: "key light", position: [4, 5, 4], target: TARGET, intensity: 2.6 }))
  .add(lights.directional({ name: "fill light", position: [-4, 2, 3], target: TARGET, intensity: 0.9, color: "#9db8ff" }))
  .add(lights.directional({ name: "rim light", position: [-2, 3, -5], target: TARGET, intensity: 1.2 }))
  .camera(camera.orbit({ distance: DISTANCE, target: TARGET, position: eyePosition(), fov: FOV }));

const app = createAuraApp(canvas, {
  scene: world,
  pixelRatio: 1,
  resize: false
});

// The renderer resolves the scene camera spec every frame, so updating its position orbits the view.
function applyCamera(): void {
  const spec = app.scene.camera as { position?: readonly [number, number, number] } & AuraCameraSpec;
  (spec as { position?: readonly [number, number, number] }).position = eyePosition();
}

let dragging = false;
let lastX = 0;
let lastY = 0;
const SENSITIVITY = 0.4;

canvas.style.touchAction = "none";
canvas.style.cursor = "grab";

canvas.addEventListener("pointerdown", (e: PointerEvent) => {
  dragging = true;
  lastX = e.clientX;
  lastY = e.clientY;
  canvas.setPointerCapture(e.pointerId);
  canvas.style.cursor = "grabbing";
});
canvas.addEventListener("pointermove", (e: PointerEvent) => {
  if (!dragging) return;
  yaw -= (e.clientX - lastX) * SENSITIVITY;
  pitch += (e.clientY - lastY) * SENSITIVITY;
  pitch = Math.max(-85, Math.min(85, pitch));
  lastX = e.clientX;
  lastY = e.clientY;
  applyCamera();
});
const endDrag = (e: PointerEvent): void => {
  dragging = false;
  canvas.style.cursor = "grab";
  if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
};
canvas.addEventListener("pointerup", endDrag);
canvas.addEventListener("pointercancel", endDrag);

let readyFlagged = false;
app.onFrame(() => {
  if (readyFlagged) return;
  readyFlagged = true;
  // Resolve after the frame that triggered this callback has been presented.
  requestAnimationFrame(() => {
    window.__EVAL_READY__ = true;
  });
});
