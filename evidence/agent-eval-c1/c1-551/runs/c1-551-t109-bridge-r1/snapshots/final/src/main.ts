import { camera, createAuraApp, effects, environments, lights, scene, surfaces } from "@aura3d/engine";
import { carModel, carOutput } from "./three-bridge/car.bridge";
import { stageModel } from "./three-bridge/stage.bridge";

type PaintColor = "red" | "blue" | "black";

declare global {
  interface Window {
    __TASK_STATE__?: { turntableAngleDeg: number; paintFinish: "clearcoat"; paintColor: PaintColor };
    __EVAL_READY__?: boolean;
  }
}

const SPEED_DEG_PER_S = 20;
const DECK_Y = 0.06; // height of the reflective turntable surface

// Base paint colour only: clear coat, flake maps, chrome and glass are separate layers/materials and stay as authored.
const PAINT: Record<PaintColor, string> = {
  red: "#a30818", // candy red
  blue: "#0b2a8f", // deep metallic blue
  black: "#060607", // gloss black
};
const paintOverride = (c: PaintColor) => [{ target: "candy_paint", color: PAINT[c], colorMode: "replace" as const }];

const app = createAuraApp("#app", {
  scene: scene({ background: "#05060a" })
    // Structured softbox probe: overhead + side strip lights that the clear coat mirrors.
    .add(environments.studio({ preset: "softbox", intensity: 1.5, background: false }))
    // Long soft-box strips (key from above-left, two side strips) and a faint cool rim.
    .add(lights.directional({ name: "strip_top", color: "#fff3e6", intensity: 1.2, position: [-1.5, 6, 2.5] }))
    .add(lights.directional({ name: "strip_left", color: "#ffffff", intensity: 0.5, position: [-6, 2.5, 1] }))
    .add(lights.directional({ name: "strip_right", color: "#e8f0ff", intensity: 0.5, position: [6, 2.2, -2] }))
    .add(lights.directional({ name: "rim_cool", color: "#7fb2ff", intensity: 1.0, position: [-2, 2.5, -6] }))
    // Showroom floor with a circular opening, chrome rim and cool ring light.
    .add(stageModel())
    // Faint mirror inside the opening (a dark tint keeps the reflection subtle).
    .add(surfaces.mirror({ name: "deck_mirror", size: [5.4, 5.4], resolution: 512, tint: "#9096a0", position: [0, DECK_Y, 0] }))
    // The car, rotated on the platform by main.ts.
    .add(carModel({ materialOverrides: paintOverride("red") }).position(0, DECK_Y, 0).runtime({ id: "car", mutable: true }))
    .add(effects.bloom({ intensity: 0.35, threshold: 0.85, radius: 0.5 }))
    .camera(camera.perspective({ position: [3.9, 1.45, 5.1], target: [0, 0.6, 0], fov: 34 })),
  output: { ...carOutput, exposure: 1.0 }
});

const state: { turntableAngleDeg: number; paintFinish: "clearcoat"; paintColor: PaintColor } = {
  turntableAngleDeg: 0,
  paintFinish: "clearcoat",
  paintColor: "red",
};
window.__TASK_STATE__ = state;

const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>("#paint-buttons button[data-paint]"));
function setPaint(color: PaintColor): void {
  state.paintColor = color;
  const car = app.nodes.require("car") as unknown as { materials?: AuraModelMaterialHandle };
  car.materials?.setMaterialOverrides(paintOverride(color));
  for (const b of buttons) b.setAttribute("aria-pressed", String(b.dataset.paint === color));
}
for (const b of buttons) {
  b.addEventListener("click", () => setPaint(b.dataset.paint as PaintColor));
}

let started = false;
app.onFrame((f) => {
  state.turntableAngleDeg += f.dt * SPEED_DEG_PER_S;
  app.nodes.require("car").setRotation(0, (state.turntableAngleDeg * Math.PI) / 180, 0);
  window.__TASK_STATE__ = state;
  if (!started) {
    started = true;
    window.__EVAL_READY__ = true;
  }
});

void app.ready();
