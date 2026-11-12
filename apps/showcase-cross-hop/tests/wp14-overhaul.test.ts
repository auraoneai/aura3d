import { describe, expect, it } from "vitest";
import {
  broadcastCrispCubeText,
  flipbookQuadMaterial,
  lavaMagmaMaterial,
  riverWaterMaterial
} from "../src/game/surfaceShaders";
import { VEHICLE_OVERRIDES, critterNodeTransforms } from "../src/game/critterLook";
import { buildScene, lane, setLookMode, startRun, st, step } from "../src/game/core";
import { MOVER_LENGTH, laneMovers, moverHalf } from "../src/game/world";
import { COL_W } from "../src/game/themes";
import {
  buildHeroVehicleMultiMaterialNode,
  buildHorizonRidgeSpec,
  buildMeadowBushSpec,
  buildProceduralVehicleSpec,
  buildRailTrackStripSpec,
  buildWoodlandTreeSpec
} from "../src/art/proceduralModels";

type SceneNode = {
  kind?: string;
  light?: string;
  effect?: string;
  name?: string;
  near?: number;
  far?: number;
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
        expect(fog.near ?? 0).toBeGreaterThanOrEqual(70);
        expect(fog.far ?? 0).toBeGreaterThanOrEqual(260);
      }
    }
  });
});
