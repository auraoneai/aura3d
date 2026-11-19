import { describe, expect, it } from "vitest";
import { outlinePoint, playerMesh } from "../../../apps/showcase-shape-shift-sprint/src/meshes";
import { MORPH_SHAPE_COLORS, buildMorphPlayerNode } from "../../../apps/showcase-shape-shift-sprint/src/art/proceduralModels";
import { ShapeShiftSim } from "../../../apps/showcase-shape-shift-sprint/src/sim";
import { PLAYER_IDS, buildWorld, mascotStride } from "../../../apps/showcase-shape-shift-sprint/src/world";
import { LOOK } from "../../../apps/showcase-shape-shift-sprint/src/look";

/**
 * Morph mascot (owner review): the player is one gel creature whose body is exactly the gate shape it matches
 * (sphere / cube / cone = circle / square / triangle holes), in the gate colour, with eyes and running feet.
 */
type N = { name?: string; kind?: string; primitive?: string; geometry?: { positions?: Float32Array }; children?: N[]; runtime?: { id?: string }; materials?: { color?: string; tint?: string }[] };
const walk = (n: N, out: N[] = []): N[] => { out.push(n); for (const c of n.children ?? []) walk(c, out); return out; };

/** Silhouette of the body seen from the chase camera (+Z looking -Z): x-extent per height band, normalised. */
function silhouette(pos: Float32Array): number[] {
  let minY = Infinity, maxY = -Infinity;
  for (let i = 1; i < pos.length; i += 3) { minY = Math.min(minY, pos[i]!); maxY = Math.max(maxY, pos[i]!); }
  const bands = new Array(5).fill(0);
  for (let i = 0; i < pos.length; i += 3) {
    const b = Math.min(4, Math.floor(((pos[i + 1]! - minY) / (maxY - minY)) * 5));
    bands[b] = Math.max(bands[b], Math.abs(pos[i]!));
  }
  const m = Math.max(...bands);
  return bands.map((v) => v / m);
}

describe("shape-shift-sprint morph mascot", () => {
  it("each form's body is the gameplay shape mesh, coloured like its gate, with eyes and two feet", () => {
    for (const i of [0, 1, 2] as const) {
      const all = walk(buildMorphPlayerNode(i, playerMesh(i)).toJSON() as unknown as N);
      const body = all.filter((n) => n.geometry?.positions);
      expect(body.length).toBeGreaterThanOrEqual(1);
      expect(MORPH_SHAPE_COLORS[i]).toBe(LOOK.shapes[i]);
      expect(all.filter((n) => n.primitive === "sphere").length, "two eyes + two pupils").toBe(4);
      expect(all.filter((n) => /-foot-\d$/.test(n.runtime?.id ?? "")).length).toBe(2);
    }
  });

  it("silhouettes match the gate set: ball round, block straight-sided, cone tapering to a point", () => {
    const [ball, block, cone] = ([0, 1, 2] as const).map((i) => silhouette(Float32Array.from(playerMesh(i).positions)));
    // circle: narrow at top and bottom, widest mid
    expect(ball[2]).toBeCloseTo(1, 1); expect(ball[0]!).toBeLessThan(0.85); expect(ball[4]!).toBeLessThan(0.85);
    // square: every band at full width
    for (const v of block!) expect(v).toBeGreaterThan(0.9);
    // triangle: monotonically narrowing upward
    for (let b = 1; b < 5; b++) expect(cone![b]!).toBeLessThan(cone![b - 1]! + 1e-6);
    expect(cone![4]!).toBeLessThan(0.45);
    // and the gate holes use the same three outlines
    expect(Math.hypot(...outlinePoint(0, 0.125, 1))).toBeCloseTo(1, 3);
  });

  it("exactly one form shows, and it switches with the sim's shape (morph input); feet stride while running", () => {
    const sim = new ShapeShiftSim(7);
    const world = buildWorld({ sim, aspect: 16 / 9 } as never);
    const visible = new Map<string, boolean>();
    const anything: unknown = new Proxy(function () {}, { get: () => anything, apply: () => anything });
    const handle = (id: string): unknown => new Proxy({}, {
      get(_t, key: string) {
        if (key === "setVisible") return (v: boolean) => { visible.set(id, v); return handle(id); };
        if (key.startsWith("set")) return () => handle(id);
        return anything;
      }
    });
    const rt = world.bind({ nodes: { require: handle, get: handle }, camera: anything } as never);
    sim.begin();
    for (const shape of [0, 1, 2, 0] as const) {
      (sim.o as { shapeIndex: number }).shapeIndex = shape;
      sim.advance();
      rt.update(sim, 16 / 9);
      expect(PLAYER_IDS.filter((id) => visible.get(id)), `shape ${shape}`).toEqual([`player-${shape}`]);
    }
    expect(mascotStride(0.1, true, false)).not.toBeCloseTo(mascotStride(0.3, true, false), 2);
    expect(mascotStride(0.1, true, true)).toBe(0);
  }, 60_000);
});
