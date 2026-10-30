import { describe, expect, it } from "vitest";
import { parseMaze } from "../../../apps/showcase-dot-dash-3d/src/game/grid";
import { MAZE_ORDER, MAZES } from "../../../apps/showcase-dot-dash-3d/src/game/mazes";
import { PULSE_LIFE, TRACE_FADE, TRACE_HOLD, TraceField, traceEdges } from "../../../apps/showcase-dot-dash-3d/src/game/traces";

const calm = { reducedMotion: false, reducedFlash: false };

/** Signature effect (DD47-M1 interim, DD47-V1 trace pulse): copper traces light up behind the courier. */
describe("dot-dash-3d copper traces", () => {
  it("lays one trace per pair of adjacent walkable tiles on every board, inside the pool caps", () => {
    for (const id of MAZE_ORDER) {
      const m = parseMaze(MAZES[id]);
      const edges = traceEdges(m);
      expect(edges.length).toBeGreaterThan(100);
      expect(edges.length).toBeLessThanOrEqual(640);
      for (const e of edges) {
        expect(m.walkable[e.a]).toBe(true);
        expect(m.walkable[e.b]).toBe(true);
      }
    }
  });

  it("lights the traces the courier passed and fades them after the hold", () => {
    const m = parseMaze(MAZES.classic);
    const field = new TraceField(m);
    const e = field.edges[0]!;
    const ax = e.a % m.width, ay = (e.a / m.width) | 0;
    const far = field.edges.find((o) => Math.hypot(o.x - e.x, o.y - e.y) > 6)!;
    expect(field.edgeGlow(e, 0, calm)).toBe(0);
    field.visit(ax, ay, 10);
    // 0.5 s later the passed corridor is lit, an untouched one is not (acceptance: +25 over untouched)
    expect(field.edgeGlow(e, 10.5, calm)).toBe(1);
    expect(field.edgeGlow(far, 10.5, calm)).toBe(0);
    expect(field.edgeGlow(e, 10 + TRACE_HOLD + TRACE_FADE / 2, calm)).toBeCloseTo(0.5, 5);
    expect(field.edgeGlow(e, 10 + TRACE_HOLD + TRACE_FADE + 0.01, calm)).toBe(0);
  });

  it("ripples a surge pulse outward; reduced motion swaps the ring for a steady soft lift; reduced flash halves it", () => {
    const m = parseMaze(MAZES.classic);
    const field = new TraceField(m);
    const origin = field.edges[Math.floor(field.edges.length / 2)]!;
    field.pulse(origin.x, origin.y, 0);
    const ring = field.edges.find((o) => Math.abs(Math.hypot(o.x - origin.x, o.y - origin.y) - 4.5) < 0.3)!;
    const atRing = field.edgeGlow(ring, 0.5, calm);
    expect(atRing).toBeGreaterThan(0.3);
    expect(field.edgeGlow(origin, 0.5, calm)).toBe(0);
    expect(field.edgeGlow(ring, 0.5, { reducedMotion: false, reducedFlash: true })).toBeCloseTo(atRing / 2, 5);
    const still = field.edgeGlow(ring, 0.5, { reducedMotion: true, reducedFlash: false });
    expect(still).toBeLessThanOrEqual(0.35);
    expect(still).toBeCloseTo(field.edgeGlow(origin, 0.5, { reducedMotion: true, reducedFlash: false }), 5);
    field.prune(PULSE_LIFE + 0.1);
    expect(field.edgeGlow(ring, PULSE_LIFE + 0.1, calm)).toBe(0);
  });
});
