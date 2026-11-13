import { material } from "@aura3d/engine";
import { describe, expect, it } from "vitest";
import {
  BASEBALL_PLAYER_BONES,
  buildArticulatedBaseballPlayerNode,
  createAthleteBeltNode,
  createAthleteCapNode,
  getAthleteBeltSpec,
  getBattingCapHelmetSpec,
  getCatcherSkullCapSpec,
  getFielderCapSpec
} from "../../../apps/showcase-aura-diamond-3d/src/art/proceduralModels";

interface CollectedRigStats {
  minY: number;
  maxY: number;
  names: Set<string>;
  vertices: number;
  coloredMeshes: number;
  minColor: number;
  meshPosByName: Map<string, number[]>;
}

function collectRigStats(
  node: unknown,
  offset: readonly [number, number, number] = [0, 0, 0],
  parentScale: readonly [number, number, number] = [1, 1, 1],
  acc: CollectedRigStats = {
    minY: Number.POSITIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
    names: new Set<string>(),
    vertices: 0,
    coloredMeshes: 0,
    minColor: 1,
    meshPosByName: new Map<string, number[]>()
  }
): CollectedRigStats {
  const raw = (typeof (node as { toJSON?: unknown })?.toJSON === "function"
    ? (node as { toJSON(): Record<string, unknown> }).toJSON()
    : node) as Record<string, unknown>;
  const pos = (raw.position as readonly [number, number, number] | undefined) ?? [0, 0, 0];
  const sc = (raw.scale as readonly [number, number, number] | undefined) ?? [1, 1, 1];
  const worldScale: readonly [number, number, number] = [
    parentScale[0] * sc[0],
    parentScale[1] * sc[1],
    parentScale[2] * sc[2]
  ];
  const worldPos: readonly [number, number, number] = [
    offset[0] + pos[0] * parentScale[0],
    offset[1] + pos[1] * parentScale[1],
    offset[2] + pos[2] * parentScale[2]
  ];
  const name = typeof raw.name === "string" ? raw.name : "";
  if (name) acc.names.add(name);

  const geom = raw.geometry as { positions?: ArrayLike<number>; colors?: ArrayLike<number> } | undefined;
  if (geom?.positions) {
    const localWorld: number[] = [];
    acc.vertices += geom.positions.length / 3;
    for (let i = 0; i < geom.positions.length; i += 3) {
      const x = geom.positions[i]! * worldScale[0] + worldPos[0];
      const y = geom.positions[i + 1]! * worldScale[1] + worldPos[1];
      const z = geom.positions[i + 2]! * worldScale[2] + worldPos[2];
      expect(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)).toBe(true);
      if (y < acc.minY) acc.minY = y;
      if (y > acc.maxY) acc.maxY = y;
      localWorld.push(x, y, z);
    }
    if (name) acc.meshPosByName.set(name, localWorld);
    if (geom.colors && geom.colors.length > 0) {
      acc.coloredMeshes += 1;
      for (let i = 0; i < geom.colors.length; i += 4) {
        const c = Math.min(geom.colors[i]!, geom.colors[i + 1]!, geom.colors[i + 2]!);
        if (c < acc.minColor) acc.minColor = c;
      }
    }
  }

  for (const child of (raw.children as unknown[] | undefined) ?? []) {
    collectRigStats(child, worldPos, worldScale, acc);
  }
  return acc;
}

describe("Aura Diamond procedural articulated athlete rigs", () => {
  for (const id of ["batter", "pitcher", "f-c", "f-ss", "runner-0", "coach-1b"] as const) {
    it(`${id}: preserves all 14 bones + raglan & compression sleeves, grounds cleats at y=0, and hits ~1.88 m height`, () => {
      const node = buildArticulatedBaseballPlayerNode(id, {
        roadKit: id === "batter" || id === "runner-0" || id === "coach-1b",
        position: [0, 0, 0],
        visible: true
      });
      const stats = collectRigStats(node);
      for (const bone of BASEBALL_PLAYER_BONES) {
        expect(stats.names.has(`${id}-${bone}`), `missing bone ${id}-${bone}`).toBe(true);
      }
      expect(stats.names.has(`${id}-sleeve-l`)).toBe(true);
      expect(stats.names.has(`${id}-sleeve-r`)).toBe(true);
      expect(stats.names.has(`${id}-jersey-sleeve-l`)).toBe(true);
      expect(stats.names.has(`${id}-jersey-sleeve-r`)).toBe(true);
      expect(stats.names.has(`${id}-spine`)).toBe(true);

      // High-resolution subdivided anatomical & garment lofts + vertex-color cavity AO (`0.24`)
      expect(stats.vertices).toBeGreaterThan(8000);
      expect(stats.coloredMeshes).toBeGreaterThanOrEqual(10);
      expect(stats.minColor).toBeLessThan(0.85);

      // Grounded cleats at y ≈ 0 and canonical ~1.88 m pro baseball stature
      expect(stats.minY).toBeGreaterThanOrEqual(-0.015);
      expect(stats.minY).toBeLessThanOrEqual(0.012);
      expect(stats.maxY).toBeGreaterThan(1.78);
      expect(stats.maxY).toBeLessThan(2.04);
    });
  }

  it("enforces radial clearance between loose raglan jersey sleeves and 3/4 compression undersleeves and equips catcher armor", () => {
    const ss = collectRigStats(buildArticulatedBaseballPlayerNode("f-ss", { position: [0, 0, 0] }));
    const catcher = collectRigStats(buildArticulatedBaseballPlayerNode("f-c", { position: [0, 0, 0] }));

    // Catcher (`f-c`) carries sculpted steel wire cage mask, chest protector, and triple-knee shin guards
    expect(catcher.vertices).toBeGreaterThan(ss.vertices + 1000);

    // Loose raglan short sleeve (`f-ss-jersey-sleeve-l`) radially clears 3/4 compression undersleeve (`f-ss-sleeve-l`)
    const ragPos = ss.meshPosByName.get("f-ss-jersey-sleeve-l")!;
    const compPos = ss.meshPosByName.get("f-ss-sleeve-l")!;
    let ragMaxZ = 0;
    let compMaxZ = 0;
    for (let i = 0; i < ragPos.length; i += 3) {
      const y = ragPos[i + 1]!;
      if (y >= 1.38 && y <= 1.46) ragMaxZ = Math.max(ragMaxZ, Math.abs(ragPos[i + 2]!));
    }
    for (let i = 0; i < compPos.length; i += 3) {
      const y = compPos[i + 1]!;
      if (y >= 1.38 && y <= 1.46) compMaxZ = Math.max(compMaxZ, Math.abs(compPos[i + 2]!));
    }
    expect(compMaxZ).toBeGreaterThan(0.04);
    expect(ragMaxZ - compMaxZ).toBeGreaterThanOrEqual(0.012);
  });

  it("differentiates batter ear-flap + C-flap helmet, fielder 6-panel curved-brim cap, catcher skull cap, and leather belt", () => {
    const helmetVerts = getBattingCapHelmetSpec().positions.length / 3;
    const fielderCapVerts = getFielderCapSpec().positions.length / 3;
    const catcherCapVerts = getCatcherSkullCapSpec().positions.length / 3;
    const beltVerts = getAthleteBeltSpec().positions.length / 3;

    expect(helmetVerts).toBeGreaterThan(fielderCapVerts);
    expect(fielderCapVerts).toBeGreaterThan(250);
    expect(catcherCapVerts).toBeGreaterThan(250);
    expect(beltVerts).toBeGreaterThan(150);

    const mat = material.pbr({ color: "#1b2a41", roughness: 0.22 });
    const batterCapJson = createAthleteCapNode("batter", mat, true).toJSON() as { geometry?: { positions?: ArrayLike<number> } };
    const fielderCapJson = createAthleteCapNode("f-ss", mat, true).toJSON() as { geometry?: { positions?: ArrayLike<number> } };
    const catcherCapJson = createAthleteCapNode("f-c", mat, true).toJSON() as { geometry?: { positions?: ArrayLike<number> } };
    const beltJson = createAthleteBeltNode("batter", mat, true).toJSON() as { geometry?: { positions?: ArrayLike<number> } };

    expect(batterCapJson.geometry!.positions!.length / 3).toBe(helmetVerts);
    expect(fielderCapJson.geometry!.positions!.length / 3).toBe(fielderCapVerts);
    expect(catcherCapJson.geometry!.positions!.length / 3).toBe(catcherCapVerts);
    expect(beltJson.geometry!.positions!.length / 3).toBe(beltVerts);
  });
});
