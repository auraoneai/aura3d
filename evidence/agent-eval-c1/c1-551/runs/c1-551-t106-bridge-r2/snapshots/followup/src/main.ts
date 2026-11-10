import { KEY_BASE, mountStudio } from "./three-bridge/studio.scene";

type SphereName = "glass" | "metal" | "fabric";

declare global {
  interface Window {
    __TASK_STATE__?: { spheres: { name: string }[]; keyLightX: number; selected: SphereName | null };
    __EVAL_READY__?: boolean;
  }
}

const app = mountStudio("#app");

const state: { spheres: { name: string }[]; keyLightX: number; selected: SphereName | null } = {
  spheres: [{ name: "glass" }, { name: "metal" }, { name: "fabric" }],
  keyLightX: KEY_BASE[0] as number,
  selected: "fabric"
};
window.__TASK_STATE__ = state;

const KEYS: Record<string, SphereName> = { Digit1: "glass", Digit2: "metal", Digit3: "fabric", Numpad1: "glass", Numpad2: "metal", Numpad3: "fabric" };
window.addEventListener("keydown", (e) => {
  const pick = KEYS[e.code];
  if (pick) state.selected = pick;
});

const SPIN_SPEED = 0.7; // rad/s about the vertical axis
const angles: Record<SphereName, number> = { glass: 0, metal: 0, fabric: 0 };

let first = true;
app.onFrame((f) => {
  // Slow side-to-side drift of the key light (period ~14 s).
  state.keyLightX = KEY_BASE[0] + 2.6 * Math.sin(f.time * 0.45);
  app.nodes.get("key")?.setPosition(state.keyLightX, KEY_BASE[1], KEY_BASE[2]);

  // Only the selected sphere spins; the others keep their current angle.
  if (state.selected) angles[state.selected] += SPIN_SPEED * f.dt;
  for (const name of ["glass", "metal", "fabric"] as const) {
    // Only touch a sphere once it has been selected, so unselected ones are never written to.
    if (angles[name] !== 0) app.nodes.get(`sphere-${name}`)?.setRotation(0, angles[name], 0);
  }

  window.__TASK_STATE__ = state;
  if (first) {
    first = false;
    requestAnimationFrame(() => { window.__EVAL_READY__ = true; });
  }
});

void app.ready();
