// The Aura3D side: the emitted native scene modules, mounted unchanged.
import { mountCityBlock } from "../src/three-bridge/city-block.scene";
import { mountStylizedCar } from "../src/three-bridge/stylized-car.scene";
import { mountTreeGrove } from "../src/three-bridge/tree-grove.scene";

const mounts = { "tree-grove": mountTreeGrove, "city-block": mountCityBlock, "stylized-car": mountStylizedCar } as const;
const name = (new URLSearchParams(location.search).get("recipe") ?? "tree-grove") as keyof typeof mounts;
const w = window as unknown as { __BRIDGE_READY__?: boolean; __BRIDGE_STATE__?: unknown; __app?: unknown };
w.__BRIDGE_STATE__ = "mounting";
const app = mounts[name]("#app");
w.__app = app;
w.__BRIDGE_STATE__ = "awaiting-ready";
// No top-level await: a TLA entry plus the engine's shared chunks can stall module evaluation in the built page.
void app.ready().then(() => {
  w.__BRIDGE_STATE__ = "ready";
  let frames = 0;
  const tick = () => { frames += 1; if (frames < 30) requestAnimationFrame(tick); else w.__BRIDGE_READY__ = true; };
  requestAnimationFrame(tick);
});
