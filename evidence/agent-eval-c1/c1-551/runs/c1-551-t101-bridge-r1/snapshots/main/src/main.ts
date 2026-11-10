import { mountSpider } from "./three-bridge/spider.scene";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
    __TASK_STATE__?: Record<string, unknown>;
  }
}

const app = mountSpider("#app");
let frames = 0;
app.onFrame((f) => {
  frames += 1;
  window.__TASK_STATE__ = { time: f.time, period: 2, frames };
  if (frames === 2) window.__EVAL_READY__ = true;
});
void app.ready();
