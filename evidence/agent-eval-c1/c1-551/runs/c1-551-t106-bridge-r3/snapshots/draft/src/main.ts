import { mountStudio, KEY_Y, KEY_Z } from "./three-bridge/studio.scene";

declare global {
  interface Window {
    __TASK_STATE__: { spheres: { name: string }[]; keyLightX: number };
    __EVAL_READY__?: boolean;
  }
}

const state = {
  spheres: [{ name: "glass" }, { name: "metal" }, { name: "fabric" }],
  keyLightX: -3
};
window.__TASK_STATE__ = state;

const app = mountStudio("#app");
let first = true;

app.onFrame((f) => {
  // Slow drift of the key light from left to right and back (period ~16 s).
  state.keyLightX = 4 * Math.sin(f.time * 0.4);
  app.nodes.get("key")?.setLight?.({ position: [state.keyLightX, KEY_Y, KEY_Z] });
  window.__TASK_STATE__ = state;
  if (first) {
    first = false;
    requestAnimationFrame(() => {
      window.__EVAL_READY__ = true;
    });
  }
});

void app.ready();
