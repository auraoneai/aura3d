// Fort stability (real-GPU audit 2026-11-19): forts collapsed on their own on load (levels 8, 10, 15, 18, 25, 29, 30;
// level 15 went 47 -> 0 pieces in 2 s with no shot). Root causes: angled wall blocks were yawed across their own wall
// line, every bond on a yawed piece was created with world-space anchors (so it started violated), keep planks sat up
// to 0.36 m inside their legs, and props / walls / gulls were placed inside other pieces. Now every level's layout
// is resolved by `settleLayout`, bonds keep their spawn offset, and the sim warm-starts the world before the first
// frame. Pinned here: no overlaps, and a 3 s no-shot run of every level loses nothing and scores nothing.
import { describe, expect, it } from "vitest";
import { LEVELS, pieceOverlap } from "../../../apps/showcase-slingshot-siege/src/game/levels";
import { SiegeSim } from "../../../apps/showcase-slingshot-siege/src/game/sim";
import { DECOR_COLLIDERS } from "../../../apps/showcase-slingshot-siege/src/game/decorLayout";
import { groundTopAt } from "../../../apps/showcase-slingshot-siege/src/game/ground";

const yieldToLoop = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

describe("slingshot-siege fort stability", () => {
  it("no level spawns two pieces inside each other or a gull inside a piece", () => {
    const hits: string[] = [];
    for (const level of LEVELS) {
      const P = level.pieces;
      for (let i = 0; i < P.length; i += 1) for (let j = i + 1; j < P.length; j += 1) {
        const o = pieceOverlap(P[i]!, P[j]!);
        if (o > 0.001) hits.push(`L${level.id + 1} pieces ${i} x ${j}: ${o.toFixed(3)} m`);
      }
      level.gulls.forEach((g, gi) => {
        for (const [i, p] of P.entries()) {
          const yaw = p.yaw ?? 0, dx = g.x - p.x, dz = g.z - p.z;
          const lx = Math.cos(yaw) * dx - Math.sin(yaw) * dz, lz = Math.sin(yaw) * dx + Math.cos(yaw) * dz;
          const d = Math.hypot(Math.max(0, Math.abs(lx) - p.hx), Math.max(0, Math.abs(g.y - p.y) - p.hy), Math.max(0, Math.abs(lz) - p.hz));
          if (d < 0.26 - 0.002) hits.push(`L${level.id + 1} gull ${gi} x piece ${i}: ${(0.26 - d).toFixed(3)} m`);
        }
      });
      // Nothing floats: every piece rests on the ground or within 3 mm of a piece top under it.
      //    The ground is y 0 on the turf and the sloped beach right of the turf lip (Gull Keep / Moon Roost wall ends).
      for (const p of P) expect(p.y - p.hy, `L${level.id + 1} piece below ground`).toBeGreaterThanOrEqual(Math.min(0, groundTopAt(p.x, p.z) ?? 0) - 0.001);
    }
    expect(hits).toEqual([]);
  });

  it("the warm start barely moves any fort (the layouts are stable, not just hidden by the settle)", async () => {
    // 54 s of warm starts on the 2 vCPU ACR runner: yield per level so the vitest worker can answer its RPC
    // (a synchronous block past 60 s fails the run with "Timeout calling onTaskUpdate").
    const drift: { id: number; d: number }[] = [];
    for (const level of LEVELS) {
      drift.push({ id: level.id + 1, d: new SiegeSim({ level, seed: 7, decor: DECOR_COLLIDERS }).spawnDrift() });
      await yieldToLoop();
    }
    expect(drift.filter((r) => r.d > 0.05)).toEqual([]);
  }, 600_000);

  it("every level left alone for 3 s loses no piece and no gull and scores nothing", async () => {
    const losses: string[] = [];
    for (const level of LEVELS) {
      const sim = new SiegeSim({ level, seed: 7, decor: DECOR_COLLIDERS });
      const start = sim.pieceList().map((p) => [...p.body.position]);
      let events = 0;
      for (let f = 0; f < 180; f += 1) {
        sim.update(1 / 60);
        events += sim.drainEvents().filter((e) => e.kind === "piece-broke" || e.kind === "gull-squashed" || e.kind === "joint-snapped").length;
        if (f % 30 === 29) await yieldToLoop();
      }
      let moved = 0;
      sim.pieceList().forEach((p, i) => {
        const a = start[i]!, b = p.body.position;
        moved = Math.max(moved, Math.hypot(b[0] - a[0]!, b[1] - a[1]!, b[2] - a[2]!));
      });
      const parts = sim.scoreParts();
      if (sim.piecesAlive() !== level.pieces.length || sim.gullsAlive() !== level.gulls.length || parts.destruction !== 0 || events > 0 || moved > 0.05) {
        losses.push(`L${level.id + 1}: pieces ${level.pieces.length}->${sim.piecesAlive()}, gulls ${level.gulls.length}->${sim.gullsAlive()}, score ${parts.destruction}, moved ${moved.toFixed(3)} m`);
      }
    }
    expect(losses).toEqual([]);
  }, 1_800_000);
});
