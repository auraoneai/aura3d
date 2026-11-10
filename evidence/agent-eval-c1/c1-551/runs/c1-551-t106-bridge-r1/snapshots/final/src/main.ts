import { KEY_ID, KEY_Y, KEY_Z, RADIUS, SPACING, mountStudio } from "./three-bridge/studio.scene";

type SphereName = "glass" | "metal" | "fabric";

declare global {
  interface Window {
    __TASK_STATE__: { spheres: { name: string }[]; keyLightX: number; selected: SphereName | null };
    __EVAL_READY__?: boolean;
  }
}

const state: Window["__TASK_STATE__"] = {
  spheres: [{ name: "glass" }, { name: "metal" }, { name: "fabric" }],
  keyLightX: -4,
  selected: null
};
window.__TASK_STATE__ = state;

const layout: Record<SphereName, number> = { glass: -SPACING, metal: 0, fabric: SPACING };
const angle: Record<SphereName, number> = { glass: 0, metal: 0, fabric: 0 };
const SPIN_SPEED = 0.8; // rad/s

const keyMap: Record<string, SphereName> = {
  Digit1: "glass", Digit2: "metal", Digit3: "fabric",
  Numpad1: "glass", Numpad2: "metal", Numpad3: "fabric"
};
window.addEventListener("keydown", (e) => {
  const name = keyMap[e.code] ?? ({ "1": "glass", "2": "metal", "3": "fabric" } as Record<string, SphereName>)[e.key];
  if (name) state.selected = name;
});

const app = mountStudio("#app");
let ready = false;

app.onFrame((f) => {
  // slow drift of the key light from side to side (period ~16 s)
  state.keyLightX = -1.5 + 4.5 * Math.sin(f.time * 0.4);
  app.nodes.require(KEY_ID).setPosition(state.keyLightX, KEY_Y, KEY_Z);

  if (state.selected) angle[state.selected] += SPIN_SPEED * f.dt;
  (Object.keys(layout) as SphereName[]).forEach((n) => {
    app.nodes.require(n).setPosition(layout[n], RADIUS, 0).setRotation(0, angle[n], 0);
  });

  window.__TASK_STATE__ = state;
  if (!ready) {
    ready = true;
    window.__EVAL_READY__ = true;
  }
});

void app.ready();
