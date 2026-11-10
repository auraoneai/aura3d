import { mountSpider } from "./three-bridge/spider.scene";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

const app = mountSpider("#app");
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
