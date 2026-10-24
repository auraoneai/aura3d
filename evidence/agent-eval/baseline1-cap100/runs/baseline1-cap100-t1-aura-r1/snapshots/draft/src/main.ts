import {
  camera,
  createAuraApp,
  environments,
  lights,
  material,
  primitives,
  scene
} from "@aura3d/engine";
import type { AuraCameraSpec, AuraVec3 } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

type MutableCamera = { -readonly [K in keyof AuraCameraSpec]: AuraCameraSpec[K] };

const canvas = document.getElementById("app") as HTMLCanvasElement | null;
if (!canvas) throw new Error("Missing <canvas id=\"app\">");

// Orbit state: the camera circles the cube at a fixed distance.
const TARGET: AuraVec3 = [0, 0, 0];
const DISTANCE = 5.2;
const PITCH_LIMIT = (85 * Math.PI) / 180;
let yaw = (35 * Math.PI) / 180;
let pitch = (20 * Math.PI) / 180;

function orbitPosition(): AuraVec3 {
  const cp = Math.cos(pitch);
  return [
    TARGET[0] + DISTANCE * Math.sin(yaw) * cp,
    TARGET[1] + DISTANCE * Math.sin(pitch),
    TARGET[2] + DISTANCE * Math.cos(yaw) * cp
  ];
}

// The renderer reads this camera object every frame, so mutating its pose orbits the view.
const cameraSpec = camera.perspective({
  position: orbitPosition(),
  target: TARGET,
  fov: 40
}) as MutableCamera;

const cube = primitives
  .box({
    name: "pbr cube",
    size: 1.6,
    material: material.pbr({
      color: "#c8885a",
      metalness: 0.9,
      metallic: 0.9,
      roughness: 0.38,
      envMapIntensity: 1.2
    })
  })
  .rotate(0.45, 0, 0.2)
  .animate({ clip: "turntable", speed: 1.4 });

const sceneBuilder = scene()
  .background("#2a2a2a", { toneMapped: false })
  .add(environments.studio({ intensity: 1.1, background: false }))
  .add(lights.ambient({ intensity: 0.25 }))
  .add(lights.directional({ name: "key", position: [4, 5, 3], target: [0, 0, 0], intensity: 2.6, color: "#fff3e0" }))
  .add(lights.directional({ name: "fill", position: [-5, 1.5, 2], target: [0, 0, 0], intensity: 0.9, color: "#9db8ff" }))
  .add(lights.directional({ name: "rim", position: [-2, 3, -5], target: [0, 0, 0], intensity: 1.2, color: "#ffffff" }))
  .add(cube)
  .camera(cameraSpec);

const app = createAuraApp(canvas, { scene: sceneBuilder });

// Pointer-drag orbit; works while the cube keeps rotating.
let dragging = false;
let lastX = 0;
let lastY = 0;
canvas.style.touchAction = "none";
canvas.style.cursor = "grab";

canvas.addEventListener("pointerdown", (event) => {
  dragging = true;
  lastX = event.clientX;
  lastY = event.clientY;
  canvas.style.cursor = "grabbing";
  canvas.setPointerCapture?.(event.pointerId);
});
canvas.addEventListener("pointermove", (event) => {
  if (!dragging) return;
  const dx = event.clientX - lastX;
  const dy = event.clientY - lastY;
  lastX = event.clientX;
  lastY = event.clientY;
  yaw -= dx * 0.008;
  pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, pitch + dy * 0.008));
});
const endDrag = (event: PointerEvent): void => {
  dragging = false;
  canvas.style.cursor = "grab";
  if (canvas.hasPointerCapture?.(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
};
canvas.addEventListener("pointerup", endDrag);
canvas.addEventListener("pointercancel", endDrag);

// Apply the orbit pose each frame (also keeps the render loop running).
app.onFrame(() => {
  cameraSpec.position = orbitPosition();
});

void app.ready().then(() => {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.__EVAL_READY__ = true;
    });
  });
});
