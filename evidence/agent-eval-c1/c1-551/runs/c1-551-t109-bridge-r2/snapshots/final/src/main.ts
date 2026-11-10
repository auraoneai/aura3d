import { camera, createAuraApp, environments, lights, scene } from "@aura3d/engine";
import { carpaintLights, carpaintModel, carpaintOutput } from "./three-bridge/carpaint.bridge";

const SPEED_DEG_PER_SEC = 20;

type PaintColor = "red" | "blue" | "black";

// Base-layer colours only. Clearcoat, flake normal map, chrome and glass are untouched.
const PAINTS: Record<PaintColor, { label: string; base: string; swatch: string }> = {
  red: { label: "Red", base: "#6e000a", swatch: "#b0101e" },
  blue: { label: "Blue", base: "#06238a", swatch: "#1f4fd0" },
  black: { label: "Black", base: "#030304", swatch: "#2a2a2e" },
};
// Material slots in the bridged GLB that carry the body paint (body and roof).
const PAINT_MATERIAL = "candy_paint";

declare global {
  interface Window {
    __TASK_STATE__?: { turntableAngleDeg: number; paintFinish: string; paintColor: PaintColor };
    __EVAL_READY__?: boolean;
  }
}

let paintColor: PaintColor = "red";
let angleDeg = 0;

function publishState(): void {
  window.__TASK_STATE__ = { turntableAngleDeg: angleDeg, paintFinish: "clearcoat", paintColor };
}
publishState();

const stage = scene({ background: "#05060a" })
  .add(environments.studio({ preset: "softbox", intensity: 1.0, background: false }))
  // Long soft-box strips: two overhead, one low on the side.
  .add(lights.rect({ name: "strip top left", position: [-2.2, 4.2, 1.2], target: [0, 0.6, 0], width: 0.7, height: 7, intensity: 12, color: "#fff4ea" }))
  .add(lights.rect({ name: "strip top right", position: [2.4, 4.2, -1.0], target: [0, 0.6, 0], width: 0.7, height: 7, intensity: 12, color: "#ffffff" }))
  .add(lights.rect({ name: "strip side", position: [-5.5, 2.2, -1.5], target: [0, 0.6, 0], width: 0.5, height: 5, intensity: 10, color: "#f3f6ff" }))
  // Faint cool rim from behind.
  .add(lights.directional({ name: "rim", position: [-1, 3, -6], target: [0, 0.8, 0], intensity: 1.4, color: "#9fc4ff" }))
  .add(carpaintModel().runtime({ id: "turntable", mutable: true }))
  .addMany(carpaintLights())
  .camera(camera.perspective({ position: [4.5, 1.35, 4.9], target: [0, 0.5, 0], fov: 30, near: 0.1, far: 100 }));

const app = createAuraApp("#app", { scene: stage, output: carpaintOutput });

// ---- paint buttons (DOM, outside the canvas) ----
const buttons = new Map<PaintColor, HTMLButtonElement>();
let modelReady = false;

function applyPaint(): void {
  if (!modelReady) return;
  const handle = app.nodes.require("turntable") as { materials?: { setMaterialOverrides(o: readonly { target: string; color: string; colorMode: "replace" }[]): void } };
  handle.materials?.setMaterialOverrides([{ target: PAINT_MATERIAL, color: PAINTS[paintColor].base, colorMode: "replace" }]);
}

function selectPaint(next: PaintColor): void {
  paintColor = next;
  for (const [key, button] of buttons) button.setAttribute("aria-pressed", String(key === next));
  for (const [key, button] of buttons) button.style.outline = key === next ? "2px solid #ffffff" : "2px solid transparent";
  applyPaint();
  publishState();
}

const bar = document.createElement("div");
bar.id = "paint-controls";
bar.style.cssText = "display:flex;gap:8px;padding:10px;width:640px;box-sizing:border-box;";
for (const key of Object.keys(PAINTS) as PaintColor[]) {
  const spec = PAINTS[key];
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = spec.label;
  button.dataset.paint = key;
  button.style.cssText = `padding:6px 16px;border:1px solid #555;border-radius:4px;color:#fff;cursor:pointer;font:inherit;background:linear-gradient(90deg, ${spec.swatch} 0 14px, #1a1c22 14px);padding-left:26px;`;
  button.addEventListener("click", () => selectPaint(key));
  buttons.set(key, button);
  bar.appendChild(button);
}
document.body.appendChild(bar);
selectPaint("blue");

let first = true;
app.onFrame((frame) => {
  angleDeg += frame.dt * SPEED_DEG_PER_SEC;
  app.nodes.require("turntable").setRotation(0, (angleDeg * Math.PI) / 180, 0);
  publishState();
  if (first) {
    first = false;
    window.__EVAL_READY__ = true;
  }
});

void app.ready().then(() => {
  modelReady = true;
  if (paintColor !== "red") applyPaint();
});
