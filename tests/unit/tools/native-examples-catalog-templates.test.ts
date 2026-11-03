import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAuraRuntimeNodeRegistry } from "../../../packages/engine/src/agent-api/app/runtimeNodes.js";
import { createAuraCameraController } from "../../../packages/engine/src/agent-api/camera/extension.js";
import { createFightingRig } from "../../../packages/engine/src/agent-api/camera/rigs/fighting.js";
import { createFollow2dRig } from "../../../packages/engine/src/agent-api/camera/rigs/follow2d.js";
import { createShoulderRig } from "../../../packages/engine/src/agent-api/camera/rigs/shoulder.js";
import { createCameraPathFromPreset, sampleCameraPath } from "../../../packages/engine/src/agent-api/CameraChoreographer.js";
import { camera } from "../../../packages/engine/src/agent-api/nodes/camera.js";
import { material } from "../../../packages/engine/src/agent-api/nodes/material.js";
import { model } from "../../../packages/engine/src/agent-api/nodes/model.js";
import { primitives } from "../../../packages/engine/src/agent-api/nodes/primitives.js";
import { scene } from "../../../packages/engine/src/agent-api/nodes/scene.js";
import type { AuraApp, AuraSceneSnapshot } from "../../../packages/engine/src/agent-api/nodes/types.js";
import { createCameraMatrices } from "../../../packages/engine/src/agent-api/sceneMath.js";
import type { AuraCameraPose } from "../../../packages/engine/src/contracts/camera.js";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags.js";
import { emptyDocument } from "../../../packages/create-aura3d/templates/animation-studio/src/empty-document.js";
import { assets as miniGameAssets } from "../../../packages/create-aura3d/templates/mini-game/src/aura-assets.js";
import { assets as controllerAssets } from "../../../packages/create-aura3d/templates/character-controller/src/aura-assets.js";
import { assets as fightingAssets } from "../../../packages/create-aura3d/templates/fighting-game/src/aura-assets.js";
import { createFighterNode } from "../../../packages/create-aura3d/templates/fighting-game/src/game/fighters.js";
import type { NumericRegion } from "../../browser/native-examples-catalog.spec.js";
import {
  HEIGHT, WIDTH, glbBaseColorHistogram, projectToScreen, reconstructTemplateFrame, worldVertices,
  type ScreenBox, type Vec3
} from "./native-examples-catalog-template-support.js";

// Source-only reconstructions: the templates' own scene builders, typed GLB
// bytes, production frame-input path and camera rigs, projected without a
// browser. They ground the numeric hypotheses; they do not render pixels, and
// lighting, grading, bloom, occlusion and browser layout remain unverified.

const mounted = vi.hoisted(() => ({ snapshots: [] as AuraSceneSnapshot[] }));
vi.mock("@aura3d/engine", async (importOriginal) => ({
  ...await importOriginal<typeof import("@aura3d/engine")>(),
  createAuraApp(_target: string, options: { scene: { toJSON(): AuraSceneSnapshot } }) {
    mounted.snapshots.push(options.scene.toJSON());
    return {};
  }
}));

const root = process.cwd();
const fixturePath = "tests/fixtures/native-examples-catalog/expectations.json";
interface Case { id: string; provenance: string; source: { path: string }; sourceDependencies?: Array<{ path: string }>; regions: NumericRegion[] }
function entry(id: string): Case {
  const found = (JSON.parse(readFileSync(resolve(root, fixturePath), "utf8")) as { cases: Case[] }).cases.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`missing fixture case ${id}`);
  return found;
}
function source(path: string): string {
  return readFileSync(resolve(root, path), "utf8");
}
function stubFetch(handler: (url: string) => Uint8Array | undefined): void {
  vi.stubGlobal("fetch", async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const bytes = handler(url);
    if (!bytes) throw new Error(`Unexpected offline catalog asset request: ${url}`);
    return new Response(new Uint8Array(bytes), { status: 200 });
  });
}
afterEach(() => { vi.unstubAllGlobals(); });

function union(boxes: readonly ScreenBox[]): ScreenBox {
  return boxes.reduce((a, b) => ({
    minX: Math.min(a.minX, b.minX), maxX: Math.max(a.maxX, b.maxX), minY: Math.min(a.minY, b.minY), maxY: Math.max(a.maxY, b.maxY),
    minDepth: Math.min(a.minDepth, b.minDepth), samples: [...a.samples, ...b.samples]
  }));
}

/** The region lies on the canvas, inside the (slightly padded) projected subject, and is mostly covered by it. */
function expectRegionOnSubject(region: NumericRegion, subject: ScreenBox, canvas = { x: 0, y: 0, width: WIDTH, height: HEIGHT }, pad = 12): void {
  expect(subject.minDepth).toBeGreaterThan(0);
  expect(region.x).toBeGreaterThanOrEqual(canvas.x);
  expect(region.y).toBeGreaterThanOrEqual(canvas.y);
  expect(region.x + region.width).toBeLessThanOrEqual(canvas.x + canvas.width);
  expect(region.y + region.height).toBeLessThanOrEqual(canvas.y + canvas.height);
  expect(region.x).toBeGreaterThanOrEqual(subject.minX - pad);
  expect(region.y).toBeGreaterThanOrEqual(subject.minY - pad);
  expect(region.x + region.width).toBeLessThanOrEqual(subject.maxX + pad);
  expect(region.y + region.height).toBeLessThanOrEqual(subject.maxY + pad);
  // At least 1% of the subject's projected vertices fall inside the region.
  const inside = subject.samples.filter(({ x, y }) => x >= region.x && x <= region.x + region.width && y >= region.y && y <= region.y + region.height);
  expect(inside.length / subject.samples.length).toBeGreaterThan(0.01);
}

/** A band admits at least `share` of the subject's own (area-weighted) base colors. */
function bandShare(histogram: ReadonlyMap<string, number>, band: NumericRegion["colors"][number]): number {
  let share = 0;
  for (const [key, value] of histogram) {
    const [r, g, b] = key.split(",").map(Number) as [number, number, number];
    if (r >= band.red[0] && r <= band.red[1] && g >= band.green[0] && g <= band.green[1] && b >= band.blue[0] && b <= band.blue[1]) share += value;
  }
  return share;
}

function band(region: NumericRegion, name: string) {
  const found = region.colors.find((candidate) => candidate.name === name);
  if (!found) throw new Error(`missing band ${name}`);
  return found;
}

async function mountTemplate(template: string): Promise<AuraSceneSnapshot> {
  vi.stubGlobal("window", {});
  mounted.snapshots.length = 0;
  await import(`../../../packages/create-aura3d/templates/${template}/src/main.ts`);
  const snapshot = mounted.snapshots.at(-1);
  if (!snapshot) throw new Error(`${template} did not mount a scene`);
  return snapshot;
}

describe("source-backed template catalog expectations", () => {
  // Static typed-GLB templates: their own scene and orbit/frameAsset camera.
  const staticTemplates: Array<{
    template: string; subjectMeshes?: readonly string[];
    pins: readonly string[];
    bands: Array<{ name: string; minShare: number; meshes?: readonly string[] }>;
  }> = [
    {
      template: "asset-inspector",
      subjectMeshes: ["body", "spoiler"],
      pins: [
        'model(assets.asset, { name: "inspected typed asset" }).position(0, 0.02, 0).rotate(0, 0.5, 0).scale(0.75)',
        "camera.orbit({ target: [0, 0.75, 0], distance: 4.4, fov: 36 })",
        "diagnostics: { overlay: true }"
      ],
      bands: [{ name: "blue-grey body panels", minShare: 0.2, meshes: ["body"] }, { name: "orange trim", minShare: 0.1, meshes: ["body"] }]
    },
    {
      template: "character-viewer",
      pins: [
        'model(assets.character, { name: "rigged archer character" }).position(0, 0.24, 0).rotate(0, 0.35, 0).scale(0.85).animate({ clip: "idle", speed: 1 })',
        "camera.orbit({ target: [0, 1.1, 0], distance: 4.4, fov: 38 })"
      ],
      bands: [{ name: "brown leather", minShare: 0.3 }, { name: "green hood and tunic", minShare: 0.2 }]
    },
    {
      template: "architecture-interior",
      pins: [
        'model(assets.room, { name: "textured room kit" }).position(0, 0, -0.4).scale(0.35)',
        "camera.orbit({ target: [0, 0.95, -0.4], distance: 5.6, fov: 42 })",
        'material.fabric({ color: "#3a3129", roughness: 0.85 })'
      ],
      bands: [{ name: "blue-grey stone", minShare: 0.4 }, { name: "brown wood", minShare: 0.15 }]
    },
    {
      template: "custom-scene",
      pins: [
        'model(assets.ship, { name: "migrated ship mesh" }).position(0, 0.12, -0.4).rotate(0, -0.5, 0).scale(0.62)',
        "camera.orbit({ target: [0, 2.4, 0], distance: 13, fov: 40 })",
        'material.pbr({ color: "#28506b", roughness: 0.35, metallic: 0.15 })'
      ],
      bands: [{ name: "tan hull", minShare: 0.3 }, { name: "white sails", minShare: 0.08 }]
    },
    {
      template: "premium-product-viewer",
      subjectMeshes: ["ToyCar"],
      pins: [
        'model(assets.product, { name: "Khronos ToyCar clearcoat sample", targetMaxDimension: PRODUCT_MAX_DIMENSION }).position(0, PLINTH_TOP, 0).rotate(0, 0.65, 0)',
        "padding: 1.45,"
      ],
      bands: [{ name: "green car body", minShare: 0.3, meshes: ["ToyCar"] }, { name: "brown wood trim", minShare: 0.05, meshes: ["ToyCar"] }]
    }
  ];

  for (const spec of staticTemplates) {
    it(`projects the ${spec.template} typed subject through its own camera and GLB colors`, async () => {
      const fixtureCase = entry(`template:${spec.template}`);
      expect(fixtureCase.provenance).toMatch(/no reference capture/i);
      const main = source(fixtureCase.source.path);
      for (const pin of spec.pins) expect(main).toContain(pin);
      const snapshot = await mountTemplate(spec.template);
      const frame = await reconstructTemplateFrame(spec.template, snapshot, { stubFetch });
      try {
        const subjectItems = frame.items.filter((item) => item.label?.startsWith("actor-0:") &&
          (!spec.subjectMeshes || spec.subjectMeshes.some((mesh) => item.label!.includes(`:${mesh}:`))));
        expect(subjectItems.length).toBeGreaterThan(0);
        const subject = union(subjectItems.map((item) => projectToScreen(worldVertices(item), frame.viewProjection)));
        const region = fixtureCase.regions[0]!;
        expectRegionOnSubject(region, subject);
        const node = snapshot.nodes.find((candidate) => candidate.kind === "model")!;
        if (node.kind !== "model") throw new Error("no model");
        const glb = `packages/create-aura3d/templates/${spec.template}/public${node.asset.url}`;
        expect(fixtureCase.sourceDependencies?.some(({ path }) => path === glb)).toBe(true);
        for (const expected of spec.bands) {
          const histogram = await glbBaseColorHistogram(glb, expected.meshes);
          expect(bandShare(histogram, band(region, expected.name))).toBeGreaterThanOrEqual(expected.minShare);
        }
        if (spec.template === "asset-inspector") {
          // The bottom-right diagnostics overlay (right:12px, min-width 220px) stays clear.
          expect(region.x + region.width).toBeLessThan(WIDTH - 12 - 220);
        }
      } finally {
        frame.dispose();
      }
    }, 120_000);
  }

  it("places the large-scene region over several instanced trees and excludes the meadow color", async () => {
    const fixtureCase = entry("template:large-scene");
    const main = source(fixtureCase.source.path);
    expect(main).toContain('primitives.plane({ name: "meadow ground", size: [34, 1, 30], material: material.pbr({ color: "#3f5a33", roughness: 0.95 }), receiveShadow: true })');
    expect(main).toContain("camera.orbit({ target: [0, 0.6, 0], distance: 18, fov: 44 })");
    const snapshot = await mountTemplate("large-scene");
    const frame = await reconstructTemplateFrame("large-scene", snapshot, { stubFetch });
    try {
      const trees = frame.items.find((item) => item.label?.startsWith("actor-0:"))!;
      expect(trees.instanceTransforms?.length).toBe(42 * 16);
      const region = fixtureCase.regions[0]!;
      const vertexCount = trees.geometry.vertexBuffer.vertexCount;
      const vertices = worldVertices(trees);
      let treesInside = 0;
      for (let instance = 0; instance < 42; instance += 1) {
        const box = projectToScreen(vertices.slice(instance * vertexCount, (instance + 1) * vertexCount), frame.viewProjection);
        const cx = (box.minX + box.maxX) / 2, cy = (box.minY + box.maxY) / 2;
        if (cx >= region.x && cx <= region.x + region.width && cy >= region.y && cy <= region.y + region.height) treesInside += 1;
      }
      expect(treesInside).toBeGreaterThanOrEqual(6);
      const node = snapshot.nodes.find((candidate) => candidate.kind === "model" && candidate.name === "instanced forest trees")!;
      if (node.kind !== "model") throw new Error("no tree node");
      const histogram = await glbBaseColorHistogram(`packages/create-aura3d/templates/large-scene/public${node.asset.url}`);
      const leaves = band(region, "tree canopy green");
      expect(bandShare(histogram, leaves)).toBeGreaterThanOrEqual(0.5);
      // The meadow's authored color is outside the canopy band.
      expect([0x3f, 0x5a, 0x33][1]!).toBeLessThan(leaves.green[0]);
    } finally {
      frame.dispose();
    }
  }, 120_000);

  // Game templates mount through createGame (DOM HUD, input, sound). Their
  // relevant subject nodes and camera rigs are rebuilt with the same public
  // builders, pinned to the template source text, and posed by the real camera
  // controller after runtime bounds are published.
  async function rigPose(template: string, snapshot: AuraSceneSnapshot, use: (controller: ReturnType<typeof createAuraCameraController>) => void, setup: (registry: ReturnType<typeof createAuraRuntimeNodeRegistry>) => void) {
    const flags = resolveQrFlags({ options: ["game"], env: {} });
    const registry = createAuraRuntimeNodeRegistry(snapshot, { flags });
    setup(registry);
    const frame = await reconstructTemplateFrame(template, snapshot, { stubFetch, registry, flags });
    try {
      let items = frame.items;
      for (let index = 1; index <= 30; index += 1) items = frame.frame(index * 1000 / 60).items;
      const app = { scene: snapshot, nodes: registry, canvas: { width: WIDTH, height: HEIGHT }, quality: { tier: "high" }, onFrame: () => () => {} } as unknown as AuraApp;
      const controller = createAuraCameraController(app);
      use(controller);
      let pose: AuraCameraPose = controller.presented();
      for (let index = 0; index < 120; index += 1) pose = controller.update(1 / 60, index * 1000 / 60);
      const viewProjection = createCameraMatrices(
        scene().camera(camera.perspective({ position: pose.position, target: pose.target, fov: pose.fov, near: pose.near, far: pose.far })).toJSON(),
        WIDTH / HEIGHT, 0
      ).viewProjection;
      // Resolve vertices before the actors (and their geometry) are disposed.
      const meshes = items.map((item) => ({ label: item.label ?? "", skinned: item.skinning !== undefined, world: worldVertices(item) }));
      return { pose, meshes, viewProjection };
    } finally {
      frame.dispose();
      registry.dispose();
    }
  }

  it("frames the mini-game hero through the follow2d rig, below the pointer-transparent HUD", async () => {
    const fixtureCase = entry("template:mini-game");
    const main = source(fixtureCase.source.path);
    expect(main).toContain("start: { x: 0, y: 0.35 }");
    expect(main).toContain('model(assets.kaykitBarbarian, { name: "certified hero" })\n        .position(level.start.x + 0.38, level.start.y + 0.01, 0)');
    expect(main).toContain(".scale(0.91 / assets.kaykitBarbarian.bounds[1])");
    expect(main).toContain('camera.rigs.follow2d({ target: "mini-player", framing: { subjectHeightFraction: 0.28 } })');
    expect(main).toContain("player.setRotation(0, state.player.facing === 1 ? Math.PI / 2 : -Math.PI / 2, 0)");
    expect(main).toContain("left:16px;top:16px;z-index:5;min-width:260px");
    expect(main).toContain("pointer-events:none");
    const snapshot = scene()
      .add(model(miniGameAssets.kaykitBarbarian, { name: "certified hero" }).position(0.38, 0.36, 0).scale(0.91 / miniGameAssets.kaykitBarbarian.bounds[1])
        .runtime({ id: "mini-player", tags: ["player"] }))
      .camera(camera.follow({ targetNode: "mini-player", position: [0, 0.35 + 3.45, 10.4], target: [0, 0.35 + 0.47, 0], fov: 50 }))
      .toJSON();
    const { pose, meshes, viewProjection } = await rigPose("mini-game", snapshot,
      (controller) => controller.use(createFollow2dRig({ target: "mini-player", framing: { subjectHeightFraction: 0.28 } })),
      (registry) => registry.require("mini-player").setPosition(0.38, 0.36, 0).setRotation(0, Math.PI / 2, 0));
    expect(pose.fov).toBe(50);
    const subject = union(meshes.filter((mesh) => /:(Barbarian_(Body|Head|ArmLeft|ArmRight|LegLeft|LegRight)):/.test(mesh.label))
      .map((mesh) => projectToScreen(mesh.world, viewProjection)));
    const region = fixtureCase.regions[0]!;
    expectRegionOnSubject(region, subject);
    // The HUD panel's five 13px/1.35 lines plus padding end well above y = 150.
    expect(region.y).toBeGreaterThanOrEqual(150);
    const histogram = await glbBaseColorHistogram("packages/create-aura3d/templates/mini-game/public/aura-assets/kaykit-barbarian.glb");
    expect(bandShare(histogram, band(region, "skin"))).toBeGreaterThanOrEqual(0.06);
    expect(bandShare(histogram, band(region, "red-brown clothing"))).toBeGreaterThanOrEqual(0.15);
  }, 120_000);

  it("frames the controller hero with the subject-scoped shoulder rig once the inert look pad is gone", async () => {
    const fixtureCase = entry("template:character-controller");
    const main = source(fixtureCase.source.path);
    expect(main).not.toContain("look-pad");
    expect(main).toContain('app.camera?.use(camera.rigs.shoulder({ target: "hero", collision: true }))');
    expect(main).toContain(".animate({ clip: CERTIFIED_CLIP, loop: true, speed: 0 })");
    expect(main).toContain('material.pbr({ color: "#4a6b3a", roughness: 0.92 })');
    expect(source("templates/character-controller/src/main.ts")).toBe(main);
    const snapshot = scene()
      .add(model(controllerAssets.auraclashPlayerRig, { name: "certified hero humanoid-a", castShadow: true }).position(0, 0, 0)
        .scale(1.62 / controllerAssets.auraclashPlayerRig.bounds[1]).animate({ clip: "Walk_Loop", loop: true, speed: 0 }).runtime({ id: "hero", tags: ["player"] }))
      .add(primitives.box({ name: "walkable ground", size: [30, 0.1, 30], position: [0, -0.05, 0] }))
      .add(primitives.box({ name: "distance marker north", size: [0.4, 1.4, 0.4], position: [0, 0.7, -6] }))
      .add(primitives.box({ name: "distance marker east", size: [0.4, 1.4, 0.4], position: [5, 0.7, 0] }))
      .add(primitives.box({ name: "distance marker south-east", size: [0.4, 1.4, 0.4], position: [3.5, 0.7, 4.5] }))
      .add(primitives.box({ name: "collision wall", size: [0.4, 2.4, 4], position: [2.4, 1.2, 4.2] }))
      .camera(camera.perspective({ position: [0.55, 1.75, -2.8], target: [0, 1.35, 1.1], fov: 55 }))
      .toJSON();
    const { pose, meshes, viewProjection } = await rigPose("character-controller", snapshot,
      (controller) => controller.use(createShoulderRig({ target: "hero", collision: true })),
      (registry) => registry.require("hero").setPosition(0, 0, 0).setRotation(0, 0, 0));
    expect(pose.position[2]).toBeLessThan(-2.3);
    const subject = union(meshes.filter((mesh) => mesh.skinned).map((mesh) => projectToScreen(mesh.world, viewProjection)));
    const region = fixtureCase.regions[0]!;
    expectRegionOnSubject(region, subject);
    // Clear of the top-left HUD panel (pointer-events: none) and the hidden-on-desktop touch pad.
    expect(region.y).toBeGreaterThan(150);
    const histogram = await glbBaseColorHistogram("packages/create-aura3d/templates/character-controller/public/aura-assets/auraclash-player-rig.glb");
    const leather = band(region, "leather brown");
    expect(bandShare(histogram, leather)).toBeGreaterThanOrEqual(0.03);
    expect(bandShare(histogram, band(region, "light trim"))).toBeGreaterThanOrEqual(0.03);
    // The authored ground color #4a6b3a is outside the leather band.
    expect(0x6b).toBeGreaterThan(leather.green[1]);
  }, 120_000);

  it("projects both fighters through the fighting rig, above the bottom HUD", async () => {
    const fixtureCase = entry("template:fighting-game");
    const main = source(fixtureCase.source.path);
    expect(main).toContain("const playerStart = [-0.9, 0, 0] as const;");
    expect(main).toContain("const rivalStart = [0.9, 0, 0] as const;");
    expect(main).toContain('createFighterNode("player", PLAYER_FIGHTER_ASSET, "Player fighter", playerStart, 1, "#45f5bb", typedFighterAssets, 1)');
    expect(main).toContain('createFighterNode("rival", RIVAL_FIGHTER_ASSET, "Rival fighter", rivalStart, -1, "#ffca5f", typedFighterAssets, 1)');
    expect(main).toContain('app.camera?.use(camera.rigs.fighting({ fighters: ["player", "rival"] }))');
    expect(source("packages/create-aura3d/templates/fighting-game/src/styles.css")).toContain("inset: auto 18px 18px 18px;");
    const snapshot = scene()
      .add(createFighterNode("player", "auraclashPlayerRig", "Player fighter", [-0.9, 0, 0], 1, "#45f5bb", fightingAssets as never, 1))
      .add(createFighterNode("rival", "auraclashRivalRig", "Rival fighter", [0.9, 0, 0], -1, "#ffca5f", fightingAssets as never, 1))
      .camera(camera.perspective({ position: [0, 1.75, 5.8], target: [0, 0.85, 0], fov: 42 }))
      .toJSON();
    expect(snapshot.nodes.filter((node) => node.kind === "model")).toHaveLength(2);
    const { pose, meshes, viewProjection } = await rigPose("fighting-game", snapshot,
      (controller) => controller.use(createFightingRig({ fighters: ["player", "rival"] })), () => {});
    expect(pose.position[0]).toBeCloseTo(0, 3);
    const torso = (prefix: string) => union(meshes.filter((mesh) => mesh.label.startsWith(prefix) && /_(Body|Legs):/.test(mesh.label))
      .map((mesh) => projectToScreen(mesh.world, viewProjection)));
    const player = torso("actor-0:"), rival = torso("actor-1:");
    const region = fixtureCase.regions[0]!;
    expectRegionOnSubject(region, union([player, rival]));
    for (const fighter of [player, rival]) {
      expect((fighter.minX + fighter.maxX) / 2).toBeGreaterThan(region.x);
      expect((fighter.minX + fighter.maxX) / 2).toBeLessThan(region.x + region.width);
    }
    // The fixed bottom HUD stays below the region; at 1280 x 720 its panels sit in the lower third.
    expect(region.y + region.height).toBeLessThan(HEIGHT * 2 / 3);
    const playerColors = await glbBaseColorHistogram("packages/create-aura3d/templates/fighting-game/public/aura-assets/auraclash-player-rig.glb");
    const rivalColors = await glbBaseColorHistogram("packages/create-aura3d/templates/fighting-game/public/aura-assets/auraclash-rival-rig.glb");
    expect(bandShare(playerColors, band(region, "player leather brown"))).toBeGreaterThanOrEqual(0.03);
    expect(bandShare(rivalColors, band(region, "rival dark maroon"))).toBeGreaterThanOrEqual(0.1);
  }, 120_000);

  it("projects the animation-channel moon portal inside the framed preview canvas, which now receives pointer hits", () => {
    const fixtureCase = entry("template:animation-channel");
    const main = source(fixtureCase.source.path);
    const css = source("packages/create-aura3d/templates/animation-channel/src/sample-episode-visual.css");
    expect(main).toContain('camera.perspective({ position: [0, 1.18, 4.4], target: [0, 0.82, -0.45], fov: 38 })');
    expect(main).toContain('primitives.sphere({ name: "Aura3D glowing moon portal core", material: moonMat }).position(0, 1.35, -1.95).scale([0.62, 0.62, 0.04])');
    expect(main).toContain('primitives.torus({ name: "Aura3D moon portal rim", material: bloomCyan }).position(0, 1.35, -1.94).scale([0.78, 0.78, 0.026])');
    expect(main).toContain('const bloomCyan = material.emissive({ color: "#7de2ff", emissive: "#7de2ff", emissiveIntensity: 1.45 })');
    // #app (and so its canvas) is no longer pointer-transparent.
    const appRule = css.slice(css.indexOf("#app {"), css.indexOf("}", css.indexOf("#app {")));
    expect(appRule).not.toContain("pointer-events");
    expect(css).toContain("width: min(1280px, calc(100vw - 48px));");
    expect(css).toContain("aspect-ratio: 16 / 9;");
    expect(css).toContain("border: 1px solid rgba(125, 226, 255, 0.28);");
    // 1280 x 720: content box 1232 x 693 centered with a 1px border -> canvas at (24, 13.5).
    const canvas = { x: 24, y: 13.5, width: 1232, height: 693 };
    const snapshot = scene()
      .add(primitives.sphere({ name: "core", material: material.emissive({ color: "#b7f4ff" }) }).position(0, 1.35, -1.95).scale([0.62, 0.62, 0.04]))
      .camera(camera.perspective({ position: [0, 1.18, 4.4], target: [0, 0.82, -0.45], fov: 38 }))
      .toJSON();
    const viewProjection = createCameraMatrices(snapshot, canvas.width / canvas.height, 0).viewProjection;
    // The unit sphere's silhouette after the authored 0.62 scale (radius 0.31).
    const disc: Vec3[] = Array.from({ length: 64 }, (_, index) => {
      const angle = index / 64 * Math.PI * 2;
      return [0.31 * Math.cos(angle), 1.35 + 0.31 * Math.sin(angle), -1.95] as const;
    });
    const core = projectToScreen(disc, viewProjection, canvas);
    const region = fixtureCase.regions[0]!;
    expectRegionOnSubject(region, core, { x: 24, y: 14, width: 1232, height: 692 }, 2);
    // The typed robots (x = +/-0.72, normalized 1.395 m tall) project outside the region.
    for (const x of [-0.72, 0.72]) {
      const robot = projectToScreen([[x - 0.35, 0.08, -0.34], [x + 0.35, 1.5, -0.34]], viewProjection, canvas);
      expect(Math.min(Math.abs(robot.maxX - (region.x + region.width / 2)), Math.abs(robot.minX - (region.x + region.width / 2)))).toBeGreaterThan(region.width / 2);
    }
    const glow = band(region, "cyan portal glow");
    for (const [value, range] of [[0x7d, glow.red], [0xe2, glow.green], [0xff, glow.blue]] as const) {
      expect(value).toBeGreaterThanOrEqual(range[0]);
      expect(value).toBeLessThanOrEqual(range[1]);
    }
  });

  it("records the animation-studio empty placeholder by its self-lit stage mark under the establishing preset", () => {
    const fixtureCase = entry("template:animation-studio");
    const route = source(fixtureCase.source.path);
    expect(route).toContain("const documentToPlay = injected ?? emptyDocument;");
    const player = source("packages/create-aura3d/templates/animation-studio/src/scene-player.ts");
    expect(player).toContain('<canvas id="live-canvas" width="960" height="540"');
    expect(player).toContain("perspectiveMat4((sample.fov * Math.PI) / 180, aspect, 0.1, 100)");
    expect(emptyDocument.assets.characters).toHaveLength(0);
    expect(emptyDocument.assets.props).toHaveLength(0);
    const mark = emptyDocument.set.pieces.find((piece) => piece.id === "void-stage-mark")!;
    expect(mark.glow).toEqual({ dim: 0.6, full: 0.6 });
    expect(mark.geometry).toBe("cube");
    const shot = emptyDocument.shots[0]!;
    const path = createCameraPathFromPreset({ id: "catalog", presetId: shot.presetId, startTime: shot.startTime, endTime: shot.endTime, subjectPosition: [...shot.cameraSubject] });
    const sample = sampleCameraPath(path, 0);
    expect(sample.position).toEqual([0, 3.95, 7.5]);
    expect(sample.target).toEqual([0, 1.95, 0]);
    const snapshot = scene().camera(camera.perspective({ position: [...sample.position] as unknown as Vec3, target: [...sample.target] as unknown as Vec3, fov: sample.fov, near: 0.1, far: 100 })).toJSON();
    // The live canvas is 960 x 540 centered in the 1280 x 720 page.
    const canvas = { x: 160, y: 90, width: 960, height: 540 };
    const viewProjection = createCameraMatrices(snapshot, 960 / 540, 0).viewProjection;
    const [sx, , sz] = mark.scale, [px, py, pz] = mark.position;
    const corners: Vec3[] = [];
    for (const dx of [-0.5, 0.5]) for (const dz of [-0.5, 0.5]) corners.push([px + dx * sx, py + 0.5 * mark.scale[1], pz + dz * sz]);
    const top = projectToScreen(corners, viewProjection, canvas);
    const region = fixtureCase.regions[0]!;
    // The region straddles the mark's top face and the surrounding void floor.
    expect(region.x).toBeLessThan(top.minX);
    expect(region.x + region.width).toBeGreaterThan(top.maxX);
    expect(region.y).toBeLessThan(top.minY);
    expect(region.y + region.height).toBeGreaterThan(top.maxY);
    expect(region.x).toBeGreaterThanOrEqual(canvas.x);
    expect(region.y + region.height).toBeLessThanOrEqual(canvas.y + canvas.height);
    const markArea = (top.maxX - top.minX) * (top.maxY - top.minY) * 0.75;
    expect(markArea / (region.width * region.height)).toBeGreaterThan(band(region, "self-lit stage mark").minFraction);
    // Emissive 0.33 linear is about sRGB 156: inside the band; the dark floor/clear colors are not.
    const stage = band(region, "self-lit stage mark");
    expect(stage.red[0]).toBeGreaterThan(Math.round(255 * (1.055 * 0.09 ** (1 / 2.4) - 0.055)));
  });
});
