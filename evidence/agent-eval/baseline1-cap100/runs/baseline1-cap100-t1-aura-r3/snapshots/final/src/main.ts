import {
  createAuraApp,
  scene,
  primitives,
  material,
  lights,
  environments,
  interactions,
  camera
} from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

const canvas = document.getElementById("app") as HTMLCanvasElement;

// --- Orbit camera state (yaw/pitch/distance around the cube at the origin) ---
const TARGET: [number, number, number] = [0, 0, 0];
const DISTANCE = 5.4;
const MIN_PITCH = -1.35;
const MAX_PITCH = 1.35;
let yaw = 0.7;
let pitch = 0.4;

// Mutable camera spec: the renderer reads this same object every frame,
// so updating position/target in place moves the camera.
type MutableCamera = {
  position: [number, number, number];
  target: [number, number, number];
};
const cameraSpec = camera.perspective({
  position: [0, 0, DISTANCE],
  target: TARGET,
  fov: 40
}) as unknown as MutableCamera;

function applyOrbit(): void {
  const cp = Math.cos(pitch);
  cameraSpec.position = [
    TARGET[0] + DISTANCE * Math.sin(yaw) * cp,
    TARGET[1] + DISTANCE * Math.sin(pitch),
    TARGET[2] + DISTANCE * Math.cos(yaw) * cp
  ];
  cameraSpec.target = TARGET;
}
applyOrbit();

const cube = primitives
  .box({
    name: "pbr-cube",
    size: 1.6,
    material: material.pbr({
      color: "#c9a56a",
      metallic: 0.85,
      metalness: 0.85,
      roughness: 0.32,
      envMapIntensity: 1.3
    })
  })
  .rotate(0.45, 0, 0.25)
  .animate({ clip: "spin", speed: 1.1, loop: true });

const world = scene()
  .background("#2a2a2e")
  .camera(cameraSpec as unknown as ReturnType<typeof camera.perspective>)
  .add(environments.neutral({ intensity: 1.0, background: false }))
  .add(lights.ambient({ intensity: 0.25 }))
  .add(
    lights.directional({
      name: "key",
      position: [4, 5, 4],
      target: [0, 0, 0],
      intensity: 2.6,
      color: "#fff4e0"
    })
  )
  .add(
    lights.directional({
      name: "fill",
      position: [-5, 2, 3],
      target: [0, 0, 0],
      intensity: 0.9,
      color: "#a8c4ff"
    })
  )
  .add(
    lights.directional({
      name: "rim",
      position: [0, 3, -5],
      target: [0, 0, 0],
      intensity: 1.2,
      color: "#ffffff"
    })
  )
  .add(cube)
  .add(interactions.orbit());

const app = createAuraApp("#app", {
  scene: world,
  resize: false,
  pixelRatio: 1,
  autoStart: true
});

// --- Pointer drag to orbit (works while the cube spins) ---
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
});
canvas.addEventListener("pointermove", (e: PointerEvent) => {
  if (!dragging) return;
  const dx = e.clientX - lastX;
  const dy = e.clientY - lastY;
  lastX = e.clientX;
  lastY = e.clientY;
  yaw -= dx * 0.01;
  pitch = Math.max(MIN_PITCH, Math.min(MAX_PITCH, pitch + dy * 0.01));
  applyOrbit();
});
const endDrag = (e: PointerEvent): void => {
  if (!dragging) return;
  dragging = false;
  canvas.style.cursor = "grab";
  if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
};
canvas.addEventListener("pointerup", endDrag);
canvas.addEventListener("pointercancel", endDrag);

// Signal readiness once the first frame has been drawn.
let signalled = false;
const off = app.onFrame(() => {
  if (signalled) return;
  signalled = true;
  window.__EVAL_READY__ = true;
  off();
});
// Fallback in case the frame callback never fires before the first rAF.
void app.ready().then(() => {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.__EVAL_READY__ = true;
    });
  });
});
