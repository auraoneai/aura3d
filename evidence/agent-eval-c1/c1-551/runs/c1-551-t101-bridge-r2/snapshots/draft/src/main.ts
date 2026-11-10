import { mountSpider } from "./three-bridge/spider.scene";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

const app = mountSpider("#app");
let first = true;
app.onFrame(() => {
  if (first) {
    first = false;
    window.__EVAL_READY__ = true;
  }
});
void app.ready();
