import { describe, expect, it } from "vitest";
import { scatterAlongPath } from "@aura3d/engine";
import { CUMULUS_RIDGE } from "../../../examples/kid-goku-beyond-the-clouds-port/chapter";
import { at, frameAt } from "../../../examples/kid-goku-beyond-the-clouds-port/course";
import { seeded } from "../../../examples/kid-goku-beyond-the-clouds-port/sim";
import { CHUNK } from "../../../examples/kid-goku-beyond-the-clouds-port/terrain";

/**
 * Why Cumulus Dash keeps its hand-written mesa loop (`buildMesas`, examples/kid-goku-beyond-the-clouds-port/props.ts).
 * The planner's draw order matches the loop exactly (skip, lateral, along jitter, kind, y offset, scale, depth scale, yaw,
 * then the row step), so kind, yaw, position and height come out bit for bit. The scale draws do not: the planner computes
 * `min + r * (max - min)` and `1.7 - 0.8` is 0.8999999999999999, not the loop's literal 0.9 (no `max` gives exactly 0.9),
 * so the scale differs in the last digit and every merged vertex it multiplies would too. The rule for this lane is
 * "identical output for the same seed or keep the old placement", so the loop stays and this probe records the gap.
 */
interface Spot { kind: number; yaw: number; position: readonly [number, number, number]; lateral: number; scale: number; depthScale: number }

function handWritten(): Spot[] {
  const out: Spot[] = [];
  const rnd = seeded(555);
  const protos = 6;
  for (let c0 = -60; c0 < CUMULUS_RIDGE.length + 160; c0 += CHUNK * 2) {
    for (let s = c0; s < c0 + CHUNK * 2; s += 52 + rnd() * 70) {
      for (const side of [-1, 1] as const) {
        if (rnd() < 0.18) continue;
        const f = frameAt(s);
        const lat = side * (62 + rnd() * 230);
        const p = at(s + (rnd() - 0.5) * 40, lat, 0);
        const kind = Math.floor(rnd() * protos);
        const y = f.point[1] + (rnd() * 54 - 18);
        const sx = 0.8 + rnd() * 0.9;
        const depth = 0.85 + rnd() * 0.3;
        out.push({ kind, yaw: rnd() * 6.28, position: [p[0], y, p[2]], lateral: lat, scale: sx, depthScale: depth });
      }
    }
  }
  return out;
}

function planned(): Spot[] {
  const out: Spot[] = [];
  const rnd = seeded(555);
  for (let c0 = -60; c0 < CUMULUS_RIDGE.length + 160; c0 += CHUNK * 2) {
    out.push(...scatterAlongPath({
      random: rnd, start: c0, end: c0 + CHUNK * 2, step: [52, 122], lateral: [62, 292], skipChance: 0.18, alongJitter: 40,
      kinds: 6, yOffset: [-18, 36], scale: [0.8, 1.7], scaleDepth: [0.85, 1.15], yaw: [0, 6.28],
      path: (s, lateral) => at(s, lateral, 0),
      baseHeight: (row) => frameAt(row).point[1]
    }));
  }
  return out;
}

describe("planner versus the Cumulus Dash mesa loop", () => {
  const a = handWritten(), b = planned();
  it("draws the same placements in the same order (kind, yaw, position and height are bit-identical)", () => {
    expect(b.length).toBe(a.length);
    expect(a.length).toBeGreaterThan(20);
    for (let i = 0; i < a.length; i++) {
      expect(b[i]!.kind).toBe(a[i]!.kind);
      expect(b[i]!.yaw).toBe(a[i]!.yaw);
      expect(b[i]!.lateral).toBe(a[i]!.lateral);
      expect([...b[i]!.position]).toEqual([...a[i]!.position]);
    }
  });
  it("differs only in the last digit of the scale draws, which is why the hand-written loop stays", () => {
    let exact = 0;
    for (let i = 0; i < a.length; i++) {
      for (const [x, y] of [[a[i]!.scale, b[i]!.scale], [a[i]!.depthScale, b[i]!.depthScale]] as const) {
        expect(Math.abs(x - y) / x).toBeLessThan(1e-15);
        if (x === y) exact++;
      }
    }
    expect(exact).toBeLessThan(a.length * 2);
  });
});
