// The Aura3D side: the emitted native scene modules, mounted unchanged.
import { mountCityBlock } from "../src/three-bridge/city-block.scene";
import { mountShaderKiosk } from "../src/three-bridge/shader-kiosk.scene";
import { mountStylizedCar } from "../src/three-bridge/stylized-car.scene";
import { mountTreeGrove } from "../src/three-bridge/tree-grove.scene";
import { mountWindmill } from "../src/three-bridge/windmill.scene";

const mounts = { "tree-grove": mountTreeGrove, "city-block": mountCityBlock, "stylized-car": mountStylizedCar, windmill: mountWindmill, "shader-kiosk": mountShaderKiosk } as const;
const name = (new URLSearchParams(location.search).get("recipe") ?? "tree-grove") as keyof typeof mounts;
// ?settle=<frames>: frames to run before ready (longer lets an animated scene reach a later pose).
const settle = Number(new URLSearchParams(location.search).get("settle") ?? 30);
interface BridgeWindow { __BRIDGE_READY__?: boolean; __BRIDGE_STATE__?: unknown; __BRIDGE_TIME__?: number; __BRIDGE_CLIPS__?: Record<string, number>; __BRIDGE_ANIMATION__?: unknown; __app?: unknown }
const w = window as unknown as BridgeWindow;
w.__BRIDGE_STATE__ = "mounting";
const app = mounts[name]("#app");
w.__app = app;
w.__BRIDGE_STATE__ = "awaiting-ready";
let clock = 0;
app.onFrame((frame: { readonly time?: number }) => { if (typeof frame.time === "number") clock = frame.time; });
// No top-level await: a TLA entry plus the engine's shared chunks can stall module evaluation in the built page.
void app.ready().then(() => {
  w.__BRIDGE_STATE__ = "ready";
  let frames = 0;
  const tick = () => {
    frames += 1;
    if (frames < settle) { requestAnimationFrame(tick); return; }
    // Freeze on this frame and publish its clock, so capture.mjs can pose the three.js original at the same instant.
    const state = (app.nodes.get(name) as { animation?: { animationState?: () => { activeActions?: readonly { clip: string; time: number }[] } | undefined } } | undefined)?.animation?.animationState?.();
    app.pause();
    w.__BRIDGE_ANIMATION__ = state ?? null;
    w.__BRIDGE_TIME__ = clock;
    w.__BRIDGE_CLIPS__ = Object.fromEntries((state?.activeActions ?? []).map((action) => [action.clip.replace(/^mixer:/, ""), action.time]));
    w.__BRIDGE_READY__ = true;
  };
  requestAnimationFrame(tick);
});
