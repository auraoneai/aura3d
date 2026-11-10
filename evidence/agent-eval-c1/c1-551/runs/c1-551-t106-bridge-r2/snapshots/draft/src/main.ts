import { KEY_BASE, mountStudio } from "./three-bridge/studio.scene";

declare global {
  interface Window {
    __TASK_STATE__?: { spheres: { name: string }[]; keyLightX: number };
    __EVAL_READY__?: boolean;
  }
}

const app = mountStudio("#app");

const state = {
  spheres: [{ name: "glass" }, { name: "metal" }, { name: "fabric" }],
  keyLightX: KEY_BASE[0] as number
};
window.__TASK_STATE__ = state;

let first = true;
app.onFrame((f) => {
  // Slow side-to-side drift of the key light (period ~14 s).
  state.keyLightX = KEY_BASE[0] + 2.6 * Math.sin(f.time * 0.45);
  app.nodes.get("key")?.setPosition(state.keyLightX, KEY_BASE[1], KEY_BASE[2]);
  window.__TASK_STATE__ = state;
  if (first) {
    first = false;
    requestAnimationFrame(() => { window.__EVAL_READY__ = true; });
  }
});

void app.ready();
