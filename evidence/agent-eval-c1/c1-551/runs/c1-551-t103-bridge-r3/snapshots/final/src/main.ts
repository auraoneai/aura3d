import { camera, createAuraApp, effects, lights, scene, sky } from "@aura3d/engine";
import { canyonModel, canyonOutput } from "./three-bridge/canyon.bridge";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
    __TASK_STATE__?: Record<string, unknown>;
  }
}

// Canyon layout, kept in sync with recipes/canyon.mjs (periodic in z with period PERIOD).
const PERIOD = 240;
const K = (Math.PI * 2) / PERIOD;
const centre = (z: number): number => 9 * Math.sin(K * z + 0.4) + 4 * Math.sin(2 * K * z + 1.7);
const camU = (z: number): number => 5 * Math.sin(3 * K * z + 0.3);

const SPEED = 4.5; // metres per second; one loop = PERIOD / SPEED seconds
const EYE = 2.2;

const lightAt = (elevationDeg: number, azimuthDeg: number, distance: number): [number, number, number] => {
  const e = (elevationDeg * Math.PI) / 180;
  const a = (azimuthDeg * Math.PI) / 180;
  return [Math.sin(a) * Math.cos(e) * distance, Math.sin(e) * distance, -Math.cos(a) * Math.cos(e) * distance];
};
const SUN_EL = 7;
const SUN_AZ = 340;

const poseAt = (time: number) => {
  const z = -((time * SPEED) % PERIOD);
  const zAhead = z - 32;
  const bob = 0.05 * Math.sin(time * 1.3);
  const position: [number, number, number] = [centre(z) + camU(z), EYE + bob, z];
  const target: [number, number, number] = [centre(zAhead) + camU(zAhead) * 0.5, 4.2 + bob + 5, zAhead];
  return { position, target, z };
};

const start = poseAt(0);
const app = createAuraApp("#app", {
  scene: scene({ background: "#3b3a78" })
    .add(
      sky.gradient({
        zenith: "#1c3aa8",
        horizon: "#e0708a",
        ground: "#6b4a5c",
        exponent: 1.3,
        horizonGlow: 0.9,
        sun: { elevationDeg: SUN_EL, azimuthDeg: SUN_AZ, intensity: 1, color: "#ffb25a", discSize: 1.4 },
        bands: [
          { elevationDeg: 3, widthDeg: 10, color: "#ff8a3c", intensity: 0.9 },
          { elevationDeg: 11, widthDeg: 16, color: "#c2399a", intensity: 0.6 }
        ]
      })
    )
    .add(lights.hemisphere({ skyColor: "#7a82d8", groundColor: "#a2583c", intensity: 0.75 }))
    .add(
      lights.directional({
        name: "sun",
        position: lightAt(SUN_EL, SUN_AZ, 200),
        target: [0, 0, 0],
        intensity: 6,
        color: "#ff9a4a",
        shadow: { fit: "camera", maxDistance: 140, cascades: 3, mapSize: 2048, filter: "pcss", softness: 1.5, bias: 0.0008, normalBias: 0.05 }
      })
    )
    .add(canyonModel())
    .add(effects.fog({ mode: "exp", color: "#c47a9e", density: 0.004, affectsBackground: false }))
    .camera(camera.perspective({ position: start.position, target: start.target, fov: 62, near: 0.3, far: 450 })),
  output: canyonOutput
});

let first = true;
let flying = true;
let flightTime = 0; // advances only while flying, so pausing holds the camera in place

const button = document.getElementById("toggle-flight");
button?.addEventListener("click", () => {
  flying = !flying;
  button.textContent = flying ? "Pause flythrough" : "Resume flythrough";
});

app.onFrame((f) => {
  if (flying) flightTime += f.dt;
  const p = poseAt(flightTime);
  app.camera?.setPose({ position: p.position, target: p.target }, { cut: true });
  window.__TASK_STATE__ = { flying, cameraX: p.position[0], cameraY: p.position[1], cameraZ: p.position[2] };
  if (first) {
    first = false;
    window.__EVAL_READY__ = true;
  }
});
void app.ready();
