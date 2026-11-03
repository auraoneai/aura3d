import { afterAll, describe, it, vi } from "vitest";
import { createAuraRuntimeNodeRegistry } from "../../../packages/engine/src/agent-api/app/runtimeNodes.js";
import { createAuraCameraController } from "../../../packages/engine/src/agent-api/camera/extension.js";
import { createShoulderRig } from "../../../packages/engine/src/agent-api/camera/rigs/shoulder.js";
import { createFollow2dRig } from "../../../packages/engine/src/agent-api/camera/rigs/follow2d.js";
import { createFightingRig } from "../../../packages/engine/src/agent-api/camera/rigs/fighting.js";
import { camera } from "../../../packages/engine/src/agent-api/nodes/camera.js";
import { model } from "../../../packages/engine/src/agent-api/nodes/model.js";
import { primitives } from "../../../packages/engine/src/agent-api/nodes/primitives.js";
import { scene } from "../../../packages/engine/src/agent-api/nodes/scene.js";
import type { AuraApp } from "../../../packages/engine/src/agent-api/nodes/types.js";
import { createCameraMatrices } from "../../../packages/engine/src/agent-api/sceneMath.js";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags.js";
import { assets as miniAssets } from "../../../packages/create-aura3d/templates/mini-game/src/aura-assets.js";
import { assets as ccAssets } from "../../../packages/create-aura3d/templates/character-controller/src/aura-assets.js";
import { assets as fgAssets } from "../../../packages/create-aura3d/templates/fighting-game/src/aura-assets.js";
import { createFighterNode } from "../../../packages/create-aura3d/templates/fighting-game/src/game/fighters.js";
import { glbBaseColorHistogram, projectToScreen, reconstructTemplateFrame, worldVertices } from "./native-examples-catalog-template-support.js";

const stub = (h: (url: string) => Uint8Array | undefined) => vi.stubGlobal("fetch", async (input: string | URL | Request) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const bytes = h(url); if (!bytes) throw new Error("unexpected " + url);
  return new Response(new Uint8Array(bytes), { status: 200 });
});
afterAll(() => vi.unstubAllGlobals());

async function run(template: string, snap: any, rig: any, setup: (registry: any) => void) {
  const flags = resolveQrFlags({ options: ["game"], env: {} });
  const registry = createAuraRuntimeNodeRegistry(snap, { flags });
  setup(registry);
  const frame = await reconstructTemplateFrame(template, snap, { stubFetch: stub, registry, flags });
  let items = frame.items;
  for (let f = 1; f <= 30; f++) items = frame.frame(f * 1000 / 60).items;
  const app = { scene: snap, nodes: registry, canvas: { width: 1280, height: 720 }, quality: { tier: "high" }, onFrame: () => () => {} } as unknown as AuraApp;
  const controller = createAuraCameraController(app);
  controller.use(rig);
  let pose = controller.presented();
  for (let f = 0; f < 120; f++) pose = controller.update(1 / 60, f * 1000 / 60);
  console.log(template, "pose", JSON.stringify(pose));
  const vp = createCameraMatrices(scene().camera(camera.perspective({ position: pose.position, target: pose.target, fov: pose.fov, near: pose.near, far: pose.far })).toJSON(), 1280 / 720, 0).viewProjection;
  for (const item of items) {
    const box = projectToScreen(worldVertices(item), vp);
    console.log(template, item.label, Math.round(box.minX), Math.round(box.maxX), Math.round(box.minY), Math.round(box.maxY), box.minDepth.toFixed(2));
  }
  frame.dispose(); registry.dispose();
  for (const node of snap.nodes) if (node.kind === "model") {
    const h = await glbBaseColorHistogram(`packages/create-aura3d/templates/${template}/public${node.asset.url}`);
    console.log(template, node.name, [...h.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k}:${v.toFixed(3)}`).join(" "));
  }
}

describe("probe2", () => {
  it("mini-game", async () => {
    const snap = scene().add(model(miniAssets.kaykitBarbarian, { name: "certified hero" }).position(0.38, 0.36, 0).scale(0.91 / miniAssets.kaykitBarbarian.bounds[1]).runtime({ id: "mini-player", tags: ["player"] }))
      .camera(camera.follow({ targetNode: "mini-player", position: [0, 0.35 + 3.45, 10.4], target: [0, 0.35 + 0.47, 0], fov: 50 })).toJSON();
    await run("mini-game", snap, createFollow2dRig({ target: "mini-player", framing: { subjectHeightFraction: 0.28 } }), (r) => r.require("mini-player").setPosition(0.38, 0.36, 0).setRotation(0, Math.PI / 2, 0));
  }, 120000);
  it("character-controller", async () => {
    const snap = scene()
      .add(model(ccAssets.auraclashPlayerRig, { name: "certified hero humanoid-a", castShadow: true }).position(0, 0, 0).scale(1.62 / ccAssets.auraclashPlayerRig.bounds[1]).animate({ clip: "Walk_Loop", loop: true, speed: 0 }).runtime({ id: "hero", tags: ["player"] }))
      .add(primitives.box({ name: "walkable ground", size: [30, 0.1, 30], position: [0, -0.05, 0] }))
      .add(primitives.box({ name: "distance marker north", size: [0.4, 1.4, 0.4], position: [0, 0.7, -6] }))
      .add(primitives.box({ name: "distance marker east", size: [0.4, 1.4, 0.4], position: [5, 0.7, 0] }))
      .add(primitives.box({ name: "distance marker south-east", size: [0.4, 1.4, 0.4], position: [3.5, 0.7, 4.5] }))
      .add(primitives.box({ name: "collision wall", size: [0.4, 2.4, 4], position: [2.4, 1.2, 4.2] }))
      .camera(camera.perspective({ position: [0.55, 1.75, -2.8], target: [0, 1.35, 1.1], fov: 55 })).toJSON();
    await run("character-controller", snap, createShoulderRig({ target: "hero", collision: true }), (r) => r.require("hero").setPosition(0, 0, 0).setRotation(0, 0, 0));
  }, 120000);
  it("fighting-game", async () => {
    const snap = scene()
      .add(createFighterNode("player", "auraclashPlayerRig", "Player fighter", [-0.9, 0, 0], 1, "#45f5bb", fgAssets as any, 1))
      .add(createFighterNode("rival", "auraclashRivalRig", "Rival fighter", [0.9, 0, 0], -1, "#ffca5f", fgAssets as any, 1))
      .camera(camera.perspective({ position: [0, 1.75, 5.8], target: [0, 0.85, 0], fov: 42 })).toJSON();
    await run("fighting-game", snap, createFightingRig({ fighters: ["player", "rival"] }), () => {});
  }, 120000);
});
