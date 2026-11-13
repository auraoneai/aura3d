import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  broadcastCrispCubeText,
  flipbookQuadMaterial,
  lavaMagmaMaterial,
  riverWaterMaterial
} from "../src/game/surfaceShaders";
import { VEHICLE_OVERRIDES, critterNodeTransforms } from "../src/game/critterLook";
import { CRITTERS, buildScene, lane, probeScene, setLookMode, startRun, st, step } from "../src/game/core";
import { MOVER_LENGTH, TRAIN_CAR_LENGTH, laneMovers, moverHalf } from "../src/game/world";
import { COL_W } from "../src/game/themes";
import {
  HOP_YAW,
  composeCharacterEulerXYZ,
  hopPitch,
  hopScale,
  idleBreathScale,
  turnToward
} from "../src/game/diorama";
import { CRITTER_ASSET_IDS, assets } from "../src/aura-assets";
import manifest from "../aura.assets.json";
import {
  buildHeroVehicleMultiMaterialNode,
  buildHorizonRidgeSpec,
  buildMeadowBushSpec,
  buildProceduralCritterNode,
  buildProceduralVehicleSpec,
  buildRailTrackStripSpec,
  buildRescuePodNode,
  buildStarCoinStandingSpec,
  buildStarCoinUnitSpec,
  buildStoopingHawkNode,
  buildWoodlandTreeSpec,
  inspectProceduralCritterBounds
} from "../src/art/proceduralModels";

type SceneNode = {
  kind?: string;
  light?: string;
  effect?: string;
  name?: string;
  mode?: string;
  near?: number;
  far?: number;
  maxOpacity?: number;
  density?: number;
  children?: SceneNode[];
};
const flattenNodes = (nodes: SceneNode[]): SceneNode[] =>
  nodes.flatMap((n) => [n, ...flattenNodes(n.children ?? [])]);

describe("WP-14 Cross Hop 10/10 diorama overhaul", () => {
  it("ships paired GLSL 300 es + WGSL shaders with WebGPU instanceColor stream parity", () => {
    for (const mat of [riverWaterMaterial(), lavaMagmaMaterial()]) {
      const s = JSON.stringify(mat);
      expect(s).toContain("instanceColor");
      expect(s).toContain("outColor");
      expect(s).toContain("@location(12) a_instanceColor");
      expect(s).toContain("a3dApplyEnvironmentFog");
    }
    for (const kind of ["ripple", "dust"] as const) {
      const s = JSON.stringify(flipbookQuadMaterial(kind, [220, 240, 255], 0.35, 0.85));
      expect(s).toContain("texture(");
      expect(s).toContain("Texture");
      expect(s).toContain("Sampler");
    }
  });

  it("serializes broadcast-crisp 3D LUT into valid Adobe .cube format", () => {
    const cube = broadcastCrispCubeText(8);
    const lines = cube.trim().split("\n");
    expect(lines[0]).toContain("Broadcast Crisp");
    expect(lines).toContain("LUT_3D_SIZE 8");
    const triplets = lines.filter((l) => /^\d+\.\d+ \d+\.\d+ \d+\.\d+$/.test(l));
    expect(triplets).toHaveLength(8 * 8 * 8);
  });

  it("authors vivid scene with zero ambient lights, GTAO, SSR, cinematicBloom, flipbooks, and horizon ridge", () => {
    setLookMode("vivid");
    const s = buildScene() as { nodes: SceneNode[] };
    const all = flattenNodes(s.nodes);
    expect(all.filter((n) => n.kind === "light" && n.light === "ambient")).toHaveLength(0);
    const effects = all.filter((n) => n.kind === "effect").map((n) => n.effect);
    expect(effects).toEqual(
      expect.arrayContaining([
        "contact-shadows",
        "ambient-occlusion",
        "screen-space-reflections",
        "bloom",
        "vignette"
      ])
    );
    const names = all.map((n) => n.name ?? "");
    expect(names).toEqual(expect.arrayContaining(["horizon-ridge", "vfx-ripple-0", "vfx-dust-0"]));
    expect(VEHICLE_OVERRIDES[0]?.clearcoat).toBe(1);
    expect(critterNodeTransforms("hop")?.Hips).toBeDefined();
  });

  it("detects close vehicle near-misses without altering row score", () => {
    startRun("drill", { id: "nm", label: "Near Miss", desc: "", script: ["meadow", "meadow", "road", "meadow"] }, 42);
    const roadLane = lane(2);
    const xs = new Float32Array(16);
    const count = laneMovers(roadLane, 1 / 60, xs);
    expect(count).toBeGreaterThan(0);
    // Place Hop on road row 2 in the graze band behind one car while clear of all other cars
    let grazeX = 0;
    const half = moverHalf(roadLane);
    for (let i = 0; i < count; i++) {
      const cand = xs[i]! - roadLane.dir * (half + 0.62);
      if (Math.abs(cand) > 8) continue;
      let clearOfOthers = true;
      for (let j = 0; j < count; j++) {
        if (Math.abs(xs[j]! - cand) <= half + 0.32) { clearOfOthers = false; break; }
      }
      if (clearOfOthers) { grazeX = cand; break; }
    }
    st.playerRow = 2;
    st.score = 2;
    st.row = 2;
    st.playerCol = grazeX / COL_W;
    step(1 / 60, { buffered: () => false });
    expect(st.dead).toBeNull();
    expect(st.nearMisses).toBe(1);
    expect(st.score).toBe(2);
  });

  it("WP-13: sculpts wheel-well sedans/pickups/box-trucks, batched trees/bushes/rail-tracks, rolling hills, and near>=70 far>=260 fog", () => {
    for (const [kind, target] of [
      ["car", MOVER_LENGTH.car],
      ["pickup", MOVER_LENGTH.pickup],
      ["truck", MOVER_LENGTH.truck]
    ] as const) {
      const spec = buildProceduralVehicleSpec(kind, { targetMaxDimension: target });
      expect(spec.colors?.length).toBe((spec.positions.length / 3) * 4);
      expect(spec.bounds).toBeDefined();
      const spanX = spec.bounds!.max[0] - spec.bounds!.min[0];
      expect(spanX).toBeCloseTo(target, 2);
      expect(spec.bounds!.min[1]).toBeCloseTo(0, 3);
    }
    const heroPickup = buildHeroVehicleMultiMaterialNode("pickup", { targetMaxDimension: MOVER_LENGTH.pickup }).toJSON();
    expect(JSON.stringify(heroPickup)).toContain("hero-pickup-glass");

    for (const propSpec of [
      buildHorizonRidgeSpec(),
      buildWoodlandTreeSpec(),
      buildMeadowBushSpec(),
      buildRailTrackStripSpec(34)
    ]) {
      expect(propSpec.positions.length).toBeGreaterThan(90);
      expect(propSpec.bounds).toBeDefined();
    }

    for (const mode of ["vivid", "diorama", "original"] as const) {
      setLookMode(mode);
      const sceneJson = buildScene() as { nodes: SceneNode[] };
      const all = flattenNodes(sceneJson.nodes);
      const names = all.map((n) => n.name ?? "");
      expect(names).toEqual(expect.arrayContaining(["d-trees", "d-bushes", "m-rail-tracks", "horizon-ridge"]));
      const fogNodes = all.filter((n) => n.kind === "effect" && n.effect === "fog");
      expect(fogNodes.length).toBeGreaterThan(0);
      for (const fog of fogNodes) {
        expect(fog.mode).toBe("linear");
        expect(fog.near ?? 0).toBeGreaterThanOrEqual(145);
        expect(fog.far ?? 0).toBeGreaterThanOrEqual(420);
        expect(fog.maxOpacity ?? 1).toBeLessThanOrEqual(0.24);
        expect(fog.density).toBeUndefined();
      }
      const dofNodes = all.filter(
        (n) => n.kind === "effect" && (n.effect === "depth-of-field" || n.effect === "depthOfField")
      );
      expect(dofNodes).toHaveLength(0);
      expect(all.filter((n) => n.kind === "model")).toHaveLength(0);
    }
  });

  it("ships zero Meshy .glb files and sculpts all 12 playable critters, hawk, pod, coins & fleet grounded at minY = 0", () => {
    const appRoot = path.resolve(__dirname, "..");
    const glbFiles: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === "node_modules" || entry.name === "dist") continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.toLowerCase().endsWith(".glb")) glbFiles.push(full);
      }
    };
    walk(appRoot);
    expect(glbFiles).toEqual([]);
    expect(manifest.assets).toEqual([]);
    expect(Object.keys(assets)).toEqual([]);

    expect(CRITTERS).toHaveLength(12);
    expect(CRITTER_ASSET_IDS).toHaveLength(12);
    for (const critterId of CRITTER_ASSET_IDS) {
      const info = inspectProceduralCritterBounds(critterId, 1.05);
      expect(info.vertexCount).toBeGreaterThanOrEqual(500);
      expect(info.materialGroupCount).toBeGreaterThanOrEqual(5);
      expect(info.bounds.min[1]).toBeCloseTo(0, 4);
      expect(info.bounds.max[1]).toBeCloseTo(1.05, 4);
      expect(info.bounds.min[0] + info.bounds.max[0]).toBeCloseTo(0, 4);
      expect(info.bounds.min[2] + info.bounds.max[2]).toBeCloseTo(0, 4);
      const nodeJson = buildProceduralCritterNode(critterId, { name: `hero-${critterId}`, targetHeight: 1.05 }).toJSON();
      expect(JSON.stringify(nodeJson)).not.toContain(".glb");
    }

    for (const [kind, target] of [
      ["car", MOVER_LENGTH.car],
      ["hatch", MOVER_LENGTH.hatch],
      ["suv", MOVER_LENGTH.suv],
      ["taxi", MOVER_LENGTH.taxi],
      ["van", MOVER_LENGTH.van],
      ["pickup", MOVER_LENGTH.pickup],
      ["truck", MOVER_LENGTH.truck],
      ["tram", MOVER_LENGTH.tram],
      ["train", TRAIN_CAR_LENGTH],
      ["hover", MOVER_LENGTH.hover]
    ] as const) {
      const spec = buildProceduralVehicleSpec(kind, { targetMaxDimension: target });
      expect(spec.bounds!.min[1]).toBeCloseTo(0, 3);
    }

    expect(buildStarCoinStandingSpec(0.5).bounds!.min[1]).toBeCloseTo(0, 3);
    expect(buildStarCoinUnitSpec().bounds).toBeDefined();
    expect(JSON.stringify(buildStoopingHawkNode().toJSON())).toContain("hawk");
    expect(JSON.stringify(buildRescuePodNode().toJSON())).toContain("pod-dome-glass");
    const probe4 = probeScene(4) as { nodes: SceneNode[] };
    expect(flattenNodes(probe4.nodes).filter((n) => n.kind === "model")).toHaveLength(0);
  });

  it("animates hop squash/stretch, forward pitch arc, idle breath, and drift-free ZYX yaw banking", () => {
    expect(hopScale(0.08, true, -1, false)[1]).toBeLessThan(0.9);
    expect(hopScale(0.48, true, -1, false)[1]).toBeGreaterThan(1.08);
    expect(hopPitch(0.25, true, -1, false)).toBeLessThan(-0.15);
    expect(hopPitch(0.75, true, -1, false)).toBeGreaterThan(0.15);
    expect(hopPitch(0, false, -1, false)).toBe(0);
    expect(idleBreathScale(0.45, false, -1, false)[1]).not.toBe(1);

    // Simulate 1,000 hop & turn cycles across all 4 cardinal directions and verify zero cumulative drift at rest
    let yaw = Math.PI;
    const dirs = ["fwd", "left", "fwd", "right", "back"] as const;
    for (let i = 0; i < 1000; i++) {
      const goal = HOP_YAW[dirs[i % dirs.length]!]!;
      for (let f = 0; f < 8; f++) yaw = turnToward(yaw, goal, 1 / 60);
    }
    const finalGoal = HOP_YAW[dirs[999 % dirs.length]!]!;
    expect(yaw).toBeCloseTo(finalGoal, 10);
    const restA = composeCharacterEulerXYZ(finalGoal, 0, 0);
    const restB = composeCharacterEulerXYZ(yaw, hopPitch(1, false, 0.5, false), 0);
    expect(restB[0]).toBeCloseTo(restA[0], 10);
    expect(restB[1]).toBeCloseTo(restA[1], 10);
    expect(restB[2]).toBeCloseTo(restA[2], 10);
  });
});
