// Candy-red car-paint coupe on a turntable in a dark showroom.
// Geometry and base materials come from recipes/showroom.mjs (bridged); environment, lights, camera and motion are native.
import { camera, createAuraApp, effects, environments, lights, scene, type AuraModelMaterialOverride } from "@aura3d/engine";
import { showroomModel, showroomOutput } from "./three-bridge/showroom.bridge";

const SPEED_DEG_PER_SEC = 20;

type PaintName = "red" | "blue" | "black";
type TaskState = { turntableAngleDeg: number; paintFinish: "clearcoat"; paintColor: PaintName };
const state: TaskState = { turntableAngleDeg: 0, paintFinish: "clearcoat", paintColor: "blue" };
const w = window as unknown as { __TASK_STATE__?: TaskState; __EVAL_READY__?: boolean };
w.__TASK_STATE__ = state;

// Base-coat colour only. The clear coat, flake normal map, chrome and glass are separate layers/materials and stay as authored.
const PAINTS: Record<PaintName, { label: string; color: string; metallic: number; swatch: string }> = {
  red: { label: "Red", color: "#7a0011", metallic: 0.3, swatch: "#c4001d" },
  blue: { label: "Blue", color: "#08236f", metallic: 0.5, swatch: "#1a4fd0" },
  black: { label: "Black", color: "#040405", metallic: 0.2, swatch: "#1a1a1d" }
};

function overridesFor(name: PaintName): readonly AuraModelMaterialOverride[] {
  const p = PAINTS[name];
  return [
    { target: "floor", envMapIntensity: 0.04, clearcoat: 0, roughness: 0.12, opacity: 0.9 },
    { target: "paint", envMapIntensity: 1.2, color: p.color, colorMode: "replace", metallic: p.metallic }
  ];
}

const stage = scene({ background: "#040508" })
  .add(environments.studio({ preset: "softbox", intensity: 1.15, background: false, rotation: 0.4 }))
  .add(showroomModel({ materialOverrides: overridesFor("red") }).runtime({ id: "showroom", mutable: true }))
  // Long soft-box strips: overhead, and one each side.
  .add(lights.rect({ name: "strip top", position: [0, 6.5, 0.5], target: [0, 0.8, 0], width: 9, height: 0.7, intensity: 14, color: "#fff4e8" }))
  .add(lights.rect({ name: "strip left", position: [-6.5, 3.2, 1.5], target: [0, 0.8, 0], width: 8, height: 0.6, intensity: 10, color: "#ffffff" }))
  .add(lights.rect({ name: "strip right", position: [6.5, 3.4, -2.5], target: [0, 0.8, 0], width: 8, height: 0.6, intensity: 10, color: "#ffffff" }))
  // Faint cool rim from behind.
  .add(lights.directional({ name: "rim", position: [-3, 3, -7], intensity: 1.6, color: "#9fc4ff" }))
  .add(effects.bloom({ intensity: 0.25, threshold: 1.1, radius: 0.4 }))
  .camera(camera.perspective({ position: [4.9, 1.9, 6.9], target: [0, 0.7, 0], fov: 33 }));

const app = createAuraApp("#app", { scene: stage, output: showroomOutput });

type MaterialsHandle = { setMaterialOverrides(o: readonly AuraModelMaterialOverride[]): void };

function applyPaint(name: PaintName): void {
  state.paintColor = name;
  const handle = app.nodes.get("showroom") as { readonly materials?: MaterialsHandle } | undefined;
  const dbg = document.getElementById("dbg");
  try {
    handle?.materials?.setMaterialOverrides(overridesFor(name));
    if (dbg) dbg.textContent = `handle=${String(!!handle)} materials=${String(!!handle?.materials)} keys=${handle ? Object.keys(handle).join(",") : ""}`;
  } catch (e) { if (dbg) dbg.textContent = String(e); }
}

// Buttons live below the canvas, outside it.
const bar = document.createElement("div");
bar.id = "paint-controls";
bar.style.cssText = "display:flex;gap:8px;padding:8px;width:640px;box-sizing:border-box;";
const buttons = new Map<PaintName, HTMLButtonElement>();
const refresh = (): void => {
  for (const [name, b] of buttons) {
    const on = name === state.paintColor;
    b.setAttribute("aria-pressed", String(on));
    b.style.outline = on ? "2px solid #9fc4ff" : "none";
  }
};
for (const name of ["red", "blue", "black"] as const) {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = PAINTS[name].label;
  b.dataset.paint = name;
  b.style.cssText = `padding:6px 16px;border:1px solid #555;border-radius:4px;color:#fff;background:${PAINTS[name].swatch};cursor:pointer;font:inherit;`;
  b.addEventListener("click", () => { applyPaint(name); refresh(); });
  buttons.set(name, b);
  bar.appendChild(b);
}
document.body.appendChild(bar);
const dbgEl = document.createElement("div"); dbgEl.id = "dbg"; dbgEl.style.cssText = "padding:8px;font-size:11px;max-width:640px;word-break:break-all;"; document.body.appendChild(dbgEl);
refresh();

let first = true;
app.onFrame((frame) => {
  state.turntableAngleDeg += frame.dt * SPEED_DEG_PER_SEC;
  app.nodes.require("showroom").setRotation(0, (state.turntableAngleDeg * Math.PI) / 180, 0);
  if (first) {
    first = false;
    requestAnimationFrame(() => { w.__EVAL_READY__ = true; });
  }
});

void app.ready().then(() => { if (state.paintColor !== "red") applyPaint(state.paintColor); }).catch((error: unknown) => {
  document.body.dataset.aura3dError = error instanceof Error ? error.message : String(error);
});
