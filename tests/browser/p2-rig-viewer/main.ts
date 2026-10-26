// Remote-only rig viewer: one asset from the root typed table playing one clip, framed head to foot. Query: ?asset=<key>&clip=<name>&speed=1&side=1
import { camera, createGameApp, lights, looks, model, scene } from "@aura3d/engine";
import { assets } from "../../../src/aura-assets";

const q = new URLSearchParams(location.search);
const key = q.get("asset") ?? "bunkerGuardMeshy";
const clip = q.get("clip") ?? "Walk_Loop";
const speed = Number(q.get("speed") ?? 1);
const side = q.get("side") === "1";
const def = (assets as unknown as Record<string, { bounds: readonly [number, number, number] }>)[key];
if (!def) throw new Error(`unknown asset ${key}`);
const [w, h, d] = def.bounds;
const long = Math.max(w, d);
const target: [number, number, number] = [0, h * 0.5, 0];
const dist = Math.max(h, long) * 2.1;
const position: [number, number, number] = side ? [dist, h * 0.55, 0.001] : [dist * 0.55, h * 0.7, dist * 0.85];
const nodes = [
  looks.preset("outdoor-day", { fogDensityScale: 0, background: "#3b4350" }),
  lights.ambient({ name: "amb", color: "#dce8f8", intensity: 0.45 }),
  lights.directional({ name: "key", color: "#fff1d6", intensity: 1.1, position: [4, 8, 6] }),
  lights.directional({ name: "rim", color: "#bfe0ff", intensity: 0.5, position: [-5, 4, -6] }),
  (model((assets as never)[key], { name: "rig", position: [0, 0, 0] } as never) as unknown as { animate: (o: { clip: string; loop: boolean; speed: number }) => unknown }).animate({ clip, loop: true, speed })
];
let s = scene().background("#3b4350", { toneMapped: false });
for (const node of nodes) s = s.add(node as never);
s = s.camera(camera.perspective({ position, target, fov: 38 }));
const gameApp = createGameApp("#app", { diagnostics: { overlay: false, performancePanel: false }, renderer: { qualityProfile: "production" }, loop: { fixedDt: 1 / 60, maxSubSteps: 2 }, scene: s });
(window as unknown as { __RIG__: unknown }).__RIG__ = { ready: true, app: gameApp.app, key, clip };
