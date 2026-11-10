import { KEY_ID, KEY_Y, KEY_Z, mountStudio } from "./three-bridge/studio.scene";

declare global {
  interface Window {
    __TASK_STATE__: { spheres: { name: string }[]; keyLightX: number };
    __EVAL_READY__?: boolean;
  }
}

const state = {
  spheres: [{ name: "glass" }, { name: "metal" }, { name: "fabric" }],
  keyLightX: -4
};
window.__TASK_STATE__ = state;

const app = mountStudio("#app");
let ready = false;

app.onFrame((f) => {
  // slow drift of the key light from side to side (period ~16 s)
  state.keyLightX = -1.5 + 4.5 * Math.sin(f.time * 0.4);
  app.nodes.require(KEY_ID).setPosition(state.keyLightX, KEY_Y, KEY_Z);
  window.__TASK_STATE__ = state;
  if (!ready) {
    ready = true;
    window.__EVAL_READY__ = true;
  }
});

void app.ready();
