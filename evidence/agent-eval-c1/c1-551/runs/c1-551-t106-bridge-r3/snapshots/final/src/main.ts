import { mountStudio, KEY_Y, KEY_Z } from "./three-bridge/studio.scene";

type SphereName = "glass" | "metal" | "fabric";

declare global {
  interface Window {
    __TASK_STATE__: { spheres: { name: string }[]; keyLightX: number; selected: SphereName | null };
    __EVAL_READY__?: boolean;
  }
}

const state: { spheres: { name: string }[]; keyLightX: number; selected: SphereName | null } = {
  spheres: [{ name: "glass" }, { name: "metal" }, { name: "fabric" }],
  keyLightX: -3,
  selected: null
};
window.__TASK_STATE__ = state;

const KEYS: Record<string, SphereName> = { Digit1: "glass", Digit2: "metal", Digit3: "fabric", Numpad1: "glass", Numpad2: "metal", Numpad3: "fabric" };
const SPIN_SPEED = 0.6; // rad/s
const angles: Record<SphereName, number> = { glass: 0, metal: 0, fabric: 0 };

window.addEventListener("keydown", (e) => {
  const name = KEYS[e.code];
  if (name) state.selected = name;
});

const app = mountStudio("#app");
let first = true;

app.onFrame((f) => {
  // Slow drift of the key light from left to right and back (period ~16 s).
  state.keyLightX = 4 * Math.sin(f.time * 0.4);
  app.nodes.get("key")?.setLight?.({ position: [state.keyLightX, KEY_Y, KEY_Z] });

  if (state.selected) {
    angles[state.selected] += SPIN_SPEED * f.dt;
    app.nodes.get(`sphere-${state.selected}`)?.setRotation(0, angles[state.selected], 0);
  }

  window.__TASK_STATE__ = state;
  if (first) {
    first = false;
    requestAnimationFrame(() => {
      window.__EVAL_READY__ = true;
    });
  }
});

void app.ready();
