import { describe, expect, it } from "vitest";
import { computeLineDistances, helpers, lines, points, sprites } from "../../../packages/engine/src/agent-api/index.js";
import type { AuraLineNode, AuraVec3 } from "../../../packages/engine/src/agent-api/nodes/types.js";
import { lineNodeHandler, pointsNodeHandler, spriteNodeHandler } from "../../../packages/engine/src/agent-api/compiler/lines.js";
import { AuraRuntimeError } from "../../../packages/engine/src/agent-api/compiler/errors.js";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags.js";
import type { SceneCompileContext } from "../../../packages/engine/src/contracts/compiler.js";

// threejs-parity lane L6 (docs/workflows/threejs-parity-gaps.md §5.6, SG-06):
// line-distance semantics must match three's `computeLineDistances`. The
// reference below is a transcription of three.js r185
// `Line.computeLineDistances` / `LineSegments.computeLineDistances` — per the
// parity README, `three` itself is not imported here.

type V3 = [number, number, number];
const dist = (a: V3, b: V3): number => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);

/** three.js r185 `Line.computeLineDistances` (Line/LineLoop share it). */
function threeLineDistances(positions: readonly V3[]): number[] {
  const lineDistances: number[] = [0];
  for (let i = 1; i < positions.length; i += 1) {
    lineDistances[i] = lineDistances[i - 1]! + dist(positions[i - 1]!, positions[i]!);
  }
  return lineDistances;
}

/** three.js r185 `LineSegments.computeLineDistances` (pairs accumulate continuously). */
function threeSegmentsDistances(positions: readonly V3[]): number[] {
  const lineDistances: number[] = [];
  for (let i = 0; i < positions.length; i += 2) {
    lineDistances[i] = i === 0 ? 0 : lineDistances[i - 1]!;
    lineDistances[i + 1] = lineDistances[i]! + dist(positions[i]!, positions[i + 1]!);
  }
  return lineDistances;
}

describe("computeLineDistances (SG-06/AD-08)", () => {
  const tri: V3[] = [[0, 0, 0], [3, 0, 0], [3, 4, 0], [3, 4, 12]];

  it("matches three's Line.computeLineDistances for open polylines", () => {
    expect(computeLineDistances(tri as readonly AuraVec3[], "line")).toEqual(threeLineDistances(tri));
    expect(computeLineDistances(tri as readonly AuraVec3[], "line")).toEqual([0, 3, 7, 19]);
  });

  it("matches three's LineSegments.computeLineDistances (continuous across pairs)", () => {
    const segs: V3[] = [[0, 0, 0], [3, 0, 0], [10, 0, 0], [10, 4, 0]];
    // three: [0, 3, 3, 7] — segment 2 starts where segment 1 ended.
    expect(threeSegmentsDistances(segs)).toEqual([0, 3, 3, 7]);
    expect(computeLineDistances(segs as readonly AuraVec3[], "segments")).toEqual(threeSegmentsDistances(segs));
  });

  it("loop appends the closing-segment distance (fat-path wrap edge)", () => {
    const out = computeLineDistances(tri as readonly AuraVec3[], "loop");
    expect(out.slice(0, tri.length)).toEqual(threeLineDistances(tri));
    // Closing edge |last→first| = 13 (3-4-12 → 0-0-0 is √(9+16+144)=13).
    expect(out[tri.length]).toBeCloseTo(19 + 13, 10);
  });

  it("segments requires an even point count", () => {
    const odd: V3[] = [[0, 0, 0], [1, 0, 0], [1, 1, 0]];
    expect(() => computeLineDistances(odd as readonly AuraVec3[], "segments")).toThrow(/even/);
  });
});

describe("lines.* factories", () => {
  const pts: V3[] = [[0, 0, 0], [1, 0, 0], [1, 1, 0]];

  it("lines.line accepts points or positions and produces a line node", () => {
    const viaPoints = lines.line({ points: pts }).toJSON() as AuraLineNode;
    const viaPositions = lines.line({ positions: pts.flat() }).toJSON() as AuraLineNode;
    expect(viaPoints.kind).toBe("line");
    expect(viaPoints.line).toBe("line");
    expect(viaPositions.positions).toEqual(pts);
  });

  it("validates minimum counts and pair parity", () => {
    expect(() => lines.line({ points: [[0, 0, 0]] })).toThrow(/at least 2/);
    expect(() => lines.loop({ points: [[0, 0, 0], [1, 0, 0]] })).toThrow(/at least 3/);
    expect(() => lines.segments({ points: pts })).toThrow(/even/);
  });

  it("dashed requires a positive gapSize (three LineDashedMaterial parity)", () => {
    expect(() => lines.line({ points: pts, dashed: true })).toThrow(/gapSize/);
    expect(() => lines.line({ points: pts, dashed: true, gapSize: 0.5 }).toJSON()).not.toThrow();
  });

  it("lines.fat rejects worldUnits + dashed (no a_lineDistance on baked quads)", () => {
    expect(() => lines.fat({ points: pts, width: 4, worldUnits: true, dashed: true, gapSize: 1 })).toThrow(/worldUnits/);
    const node = lines.fat({ points: pts, width: 6, dashed: true, gapSize: 1, dashSize: 2, dashOffset: 0.5 }).toJSON() as AuraLineNode;
    expect(node.line).toBe("fat");
    expect(node.width).toBe(6);
    expect(node.dashOffset).toBe(0.5);
  });
});

describe("points / sprites factories (SG-07/SG-08)", () => {
  it("points validates size and alphaTest", () => {
    expect(() => points({ positions: [[0, 0, 0]], size: 0 })).toThrow(/positive/);
    expect(() => points({ positions: [[0, 0, 0]], alphaTest: 2 })).toThrow(/alphaTest/);
    const node = points({ positions: [[0, 0, 0]], size: 12, sizeAttenuation: false, transparent: true }).toJSON();
    expect(node.kind).toBe("points");
    expect(node.size).toBe(12);
    expect(node.sizeAttenuation).toBe(false);
  });

  it("sprites.sprite validates center and maps rotation", () => {
    expect(() => sprites.sprite({ center: [2, 0.5] })).toThrow(/center/);
    const node = sprites.sprite({ center: [0, 0], rotation: 0.5, color: "#ff0000" }).toJSON();
    expect(node.kind).toBe("sprite");
    expect(node.center).toEqual([0, 0]);
    expect(node.spriteRotation).toBe(0.5);
    expect(node.color).toBe("#ff0000");
  });
});

describe("helpers.* (SC-03)", () => {
  const node = (b: { toJSON(): unknown }) => b.toJSON() as AuraLineNode;

  it("every helper produces a line-segments node with vertex-matched colors", () => {
    const builders = [
      helpers.axes({ size: 2 }),
      helpers.grid({ size: 4, divisions: 4 }),
      helpers.polarGrid({ radius: 2, sectors: 4, rings: 2, division: 8 }),
      helpers.box({ size: 2 }),
      helpers.box3({ min: [0, 0, 0], max: [1, 1, 1] }),
      helpers.arrow({ dir: [0, 1, 0], length: 2 }),
      helpers.camera({ fov: 60, near: 1, far: 10 }),
      helpers.directionalLight({ size: 1 }),
      helpers.spotLight({ angle: Math.PI / 6, distance: 5 }),
      helpers.pointLight({ sphereSize: 0.5 }),
      helpers.skeleton({ positions: [[0, 0, 0], [0, 1, 0], [0, 1, 1]] })
    ];
    for (const b of builders) {
      const n = node(b);
      expect(n.kind).toBe("line");
      expect(n.line).toBe("segments");
      expect((n.positions as readonly unknown[]).length % 2).toBe(0);
      expect(n.colors?.length).toBe((n.positions as readonly unknown[]).length);
    }
  });

  it("axes draws 3 axis-coloured segments", () => {
    const n = node(helpers.axes({ size: 1 }));
    expect(n.positions).toHaveLength(6);
    expect(n.colors).toEqual(["#ff0000", "#ff0000", "#00ff00", "#00ff00", "#0000ff", "#0000ff"]);
  });
});

// ── Handler-level checks (no GPU): flag gate, item emission, dpr fold ──

function fakeCtx(flags: ReturnType<typeof resolveQrFlags>): SceneCompileContext {
  return {
    renderer: null,
    assets: null,
    quality: { tier: "high" },
    strict: false,
    flags,
    degrade: () => undefined,
    canvas: { width: 1600, height: 1200, clientWidth: 800 }
  } as unknown as SceneCompileContext;
}

function fakeOut() {
  const items: { geometry: { topology?: string }; material: { getParameter(n: string): unknown }; modelMatrix?: unknown }[] = [];
  return {
    items,
    addItems(next: readonly unknown[]) { items.push(...(next as typeof items)); },
    addLights: () => undefined,
    set: () => undefined,
    feature: () => undefined
  };
}

describe("L6 handlers — flag gate + per-frame items", () => {
  const flagOn = resolveQrFlags({ options: "A3D_PARITY_LINES" });
  const flagOff = resolveQrFlags({ env: { A3D_PARITY_LINES: "0" } });

  it("flag off fails closed with parity-not-implemented (all three kinds)", () => {
    const out = fakeOut();
    const ctx = fakeCtx(flagOff);
    for (const [handler, node] of [
      [lineNodeHandler, lines.line({ points: [[0, 0, 0], [1, 0, 0]] }).toJSON()],
      [pointsNodeHandler, points({ positions: [[0, 0, 0]] }).toJSON()],
      [spriteNodeHandler, sprites.sprite().toJSON()]
    ] as const) {
      expect(() => handler.compile(node as never, ctx, out as never)).toThrowError(AuraRuntimeError);
      // Same contract as the old `parityPending` default: AuraRuntimeError with
      // code "parity-not-implemented" (the message itself only names the flag).
      try {
        handler.compile(node as never, ctx, out as never);
        expect.unreachable("compile should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(AuraRuntimeError);
        expect((error as AuraRuntimeError).code).toBe("parity-not-implemented");
      }
    }
  });

  it("flag on: thin line emits a 'lines'-topology item each frame", () => {
    const ctx = fakeCtx(flagOn);
    const node = lines.line({ points: [[0, 0, 0], [2, 0, 0], [2, 2, 0]] }).toJSON();
    const out = fakeOut();
    lineNodeHandler.compile(node as never, ctx, out as never);
    lineNodeHandler.update?.(node as never, undefined, ctx, out as never, 0);
    expect(out.items).toHaveLength(1);
    expect(out.items[0]!.geometry.topology).toBe("lines");
    lineNodeHandler.dispose?.(node as never);
  });

  it("dashed line routes through the screen-space (triangles) path", () => {
    const ctx = fakeCtx(flagOn);
    const node = lines.line({ points: [[0, 0, 0], [2, 0, 0], [2, 2, 0]], dashed: true, gapSize: 1 }).toJSON();
    const out = fakeOut();
    lineNodeHandler.compile(node as never, ctx, out as never);
    lineNodeHandler.update?.(node as never, undefined, ctx, out as never, 0);
    expect(out.items[0]!.geometry.topology).toBe("triangles");
    lineNodeHandler.dispose?.(node as never);
  });

  it("points folds devicePixelRatio into u_pointSize (three's size·pixelRatio)", () => {
    const ctx = fakeCtx(flagOn); // canvas 1600×1200, clientWidth 800 → dpr 2
    const node = points({ positions: [[0, 0, 0], [1, 1, 1]], size: 8 }).toJSON();
    const out = fakeOut();
    pointsNodeHandler.compile(node as never, ctx, out as never);
    pointsNodeHandler.update?.(node as never, undefined, ctx, out as never, 0);
    expect(out.items).toHaveLength(1);
    expect(out.items[0]!.geometry.topology).toBe("points");
    expect(out.items[0]!.material.getParameter("u_pointSize")).toBe(16);
    expect(out.items[0]!.material.getParameter("u_pointSizeAttenuation")).toBe(1);
    pointsNodeHandler.dispose?.(node as never);
  });

  it("runtime handle controls visibility and transform", () => {
    const ctx = fakeCtx(flagOn);
    const node = points({ positions: [[0, 0, 0]], size: 4 }).toJSON();
    const out = fakeOut();
    pointsNodeHandler.compile(node as never, ctx, out as never);
    pointsNodeHandler.update?.(node as never, { visible: false } as never, ctx, out as never, 0);
    expect(out.items).toHaveLength(0);
    pointsNodeHandler.update?.(node as never, { visible: true, position: [5, 0, 0], scale: 2 } as never, ctx, out as never, 0);
    expect(out.items).toHaveLength(1);
    const m = out.items[0]!.modelMatrix as Float32Array;
    expect(m[12]).toBe(5); // translation column
    expect(m[0]).toBe(2); // scale on diagonal
    pointsNodeHandler.dispose?.(node as never);
  });

  it("sprite compiles to a billboard-marked triangles item", () => {
    const ctx = fakeCtx(flagOn);
    const node = sprites.sprite({ center: [0.5, 0.5], spriteRotation: 0.25 }).toJSON();
    const out = fakeOut();
    spriteNodeHandler.compile(node as never, ctx, out as never);
    spriteNodeHandler.update?.(node as never, undefined, ctx, out as never, 0);
    expect(out.items[0]!.geometry.topology).toBe("triangles");
    expect(out.items[0]!.material.getParameter("u_spriteMode")).toBe(1);
    expect(out.items[0]!.material.getParameter("u_spriteRotation")).toBe(0.25);
    spriteNodeHandler.dispose?.(node as never);
  });
});
