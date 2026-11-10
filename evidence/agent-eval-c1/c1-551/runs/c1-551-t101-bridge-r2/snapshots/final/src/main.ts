import type { AuraActorAnimationApi, AuraRuntimeNodeHandle } from "@aura3d/engine";
import { mountSpider } from "./three-bridge/spider.scene";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
    __TASK_STATE__?: { walking: boolean };
  }
}

const CLIP = "spider_walk";
const app = mountSpider("#app");
const state = { walking: true };
window.__TASK_STATE__ = state;

function clipTime(node: AuraRuntimeNodeHandle): number {
  const anim = (node as { readonly animation?: AuraActorAnimationApi }).animation;
  const actions = anim?.animationState()?.activeActions ?? [];
  const a = actions.find((x) => x.clip === CLIP) ?? actions[0];
  return a ? a.time : 0;
}

// Pause = restart the loop clip at its current time with speed 0; resume = same with speed 1.
function setWalking(next: boolean): void {
  if (next === state.walking) return;
  const node = app.nodes.require("spider");
  const t = clipTime(node);
  state.walking = next;
  window.__TASK_STATE__ = { walking: next };
  node.play(CLIP, { loop: true, speed: next ? 1 : 0, startTime: t, restart: true });
}

window.addEventListener("keydown", (e) => {
  if (e.code === "Space") {
    e.preventDefault();
    if (!e.repeat) setWalking(!state.walking);
  }
});

let first = true;
app.onFrame(() => {
  if (first) {
    first = false;
    window.__EVAL_READY__ = true;
  }
});
void app.ready();
