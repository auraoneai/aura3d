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

// Freeze or resume the walk clip. Time scale 0 holds the current pose; 1 continues from it.
function setWalking(next: boolean): void {
  walking = next;
  if (app.time) app.time.scale = walking ? 1 : 0;
  const spider = app.nodes.get("spider") as { timeScale?: number } | undefined;
  if (spider) spider.timeScale = walking ? 1 : 0;
  window.__TASK_STATE__ = { walking };
}

window.addEventListener("keydown", (e) => {
  if (e.code !== "Space" && e.key !== " ") return;
  e.preventDefault();
  if (e.repeat) return;
  setWalking(!walking);
});

let frames = 0;
app.onFrame(() => {
  frames += 1;
  if (frames === 2) window.__EVAL_READY__ = true;
});
setWalking(false); // TEMP-TEST
void app.ready();
