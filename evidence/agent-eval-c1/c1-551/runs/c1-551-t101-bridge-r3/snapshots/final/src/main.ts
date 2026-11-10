import { mountSpider } from "./three-bridge/spider.scene";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
    __TASK_STATE__?: { walking: boolean };
  }
}

const app = mountSpider("#app");
let walking = true;
window.__TASK_STATE__ = { walking };

// The runtime node handle carries a per-node `timeScale` that scales its clip playback (0 freezes the pose).
type TimeScaledHandle = { timeScale?: number };

const setWalking = (next: boolean): void => {
  walking = next;
  window.__TASK_STATE__ = { walking };
  if (app.nodes.has("spider")) {
    (app.nodes.require("spider") as unknown as TimeScaledHandle).timeScale = walking ? 1 : 0;
  }
};

window.addEventListener("keydown", (event) => {
  if (event.code !== "Space" && event.key !== " ") return;
  event.preventDefault();
  if (event.repeat) return;
  setWalking(!walking);
});

let marked = false;
app.onFrame(() => {
  if (!marked) {
    marked = true;
    requestAnimationFrame(() => {
      window.__EVAL_READY__ = true;
    });
  }
});
void app.ready();
