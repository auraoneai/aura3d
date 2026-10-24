import {
  camera,
  createAuraApp,
  environments,
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

const CUBE_ID = "pbr-cube";
const ORBIT_TARGET = [0, 0, 0] as const;
const ORBIT_DISTANCE = 5.2;
const ORBIT_FOV = 40;

// Rotating PBR cube: brushed-metal look (high metalness, mid roughness).
const cube = primitives
  .box({
    name: "pbr cube",
    size: 1.5,
    material: material.pbr({
      color: "#c8ccd4",
      metallic: 0.9,
      metalness: 0.9,
      roughness: 0.38,
      envMapIntensity: 1.2
    }),
    castShadow: true
  })
  .runtime({ id: CUBE_ID, mutable: true });

const sceneBuilder = scene()
  .background("#2b2b2f")
  // Image-based light so the metal has something to reflect.
  .add(environments.neutral({ intensity: 1.0 }))
  // Key + fill + rim.
  .add(lights.directional({ name: "key", position: [4, 5, 3], target: [0, 0, 0], intensity: 3.2, color: "#fff4e6" }))
  .add(lights.directional({ name: "fill", position: [-4, 1.5, 2.5], target: [0, 0, 0], intensity: 1.1, color: "#9db8ff" }))
  .add(lights.directional({ name: "rim", position: [-1, 3, -5], target: [0, 0, 0], intensity: 1.6, color: "#ffffff" }))
  .add(lights.ambient({ name: "ambient", intensity: 0.25 }))
  .add(cube)
  .camera(
    camera.orbit({
      target: [ORBIT_TARGET[0], ORBIT_TARGET[1], ORBIT_TARGET[2]],
      distance: ORBIT_DISTANCE,
      fov: ORBIT_FOV
    })
  );

const canvas = document.getElementById("app") as HTMLCanvasElement | null;
if (!canvas) {
  throw new Error("canvas#app not found");
}

const app = createAuraApp("#app", {
  scene: sceneBuilder,
  autoStart: false,
  resize: false,
  pixelRatio: 1
});

interface DraggableRig {
  dragBy(dxPx: number, dyPx: number, sensitivityDegPerPx?: number): void;
}

function isDraggable(rig: unknown): rig is DraggableRig {
  return typeof rig === "object" && rig !== null && typeof (rig as { dragBy?: unknown }).dragBy === "function";
}

function installOrbitControl(): void {
  const controller = app.camera;
  if (!controller) return;
  const rig = camera.rigs.orbit({
    target: [ORBIT_TARGET[0], ORBIT_TARGET[1], ORBIT_TARGET[2]],
    distance: ORBIT_DISTANCE,
    yaw: 35,
    pitch: 22,
    pitchLimits: [-80, 80],
    fov: ORBIT_FOV,
    halflife: 0.06
  });
  controller.use(rig);
  if (!isDraggable(rig)) return;

  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  canvas!.style.cursor = "grab";
  canvas!.style.touchAction = "none";
  canvas!.addEventListener("pointerdown", (e: PointerEvent) => {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    canvas!.setPointerCapture(e.pointerId);
    canvas!.style.cursor = "grabbing";
  });
  canvas!.addEventListener("pointermove", (e: PointerEvent) => {
    if (!dragging) return;
    rig.dragBy(e.clientX - lastX, e.clientY - lastY, 0.4);
    lastX = e.clientX;
    lastY = e.clientY;
  });
  const end = (e: PointerEvent): void => {
    dragging = false;
    canvas!.style.cursor = "grab";
    if (canvas!.hasPointerCapture(e.pointerId)) canvas!.releasePointerCapture(e.pointerId);
  };
  canvas!.addEventListener("pointerup", end);
  canvas!.addEventListener("pointercancel", end);
}

let spin = 0;
let last = performance.now();
let firstFrameDone = false;

function frame(now: number): void {
  const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
  last = now;
  spin += dt;

  const handle = app.nodes.get(CUBE_ID);
  if (handle) {
    handle.setRotation(spin * 0.45, spin * 0.8, spin * 0.15);
  }

  app.step(dt);

  if (!firstFrameDone) {
    firstFrameDone = true;
    window.__EVAL_READY__ = true;
  }
  requestAnimationFrame(frame);
}

void app
  .ready()
  .catch(() => undefined)
  .then(() => {
    installOrbitControl();
    last = performance.now();
    requestAnimationFrame(frame);
  });
