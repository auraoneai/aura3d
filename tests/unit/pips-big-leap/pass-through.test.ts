// Pass-through pass (owner, 2026-11-18: "it just runs right through rather than stopping"). Every solid-looking decor
// prop whose drawn footprint reaches the playable corridor (a platform top, in Pip's 0.9 m walking band) is a collider
// Pip stops against, placed where the default look draws it and sized from its Idol model; colliders never swallow a
// pickup, checkpoint, spring, the spawn or the Sun-Gate opening; hazard visuals match their hurt boxes.
import { describe, expect, it } from "vitest";
import { game } from "@aura3d/engine";
import {
  DECOR_BODIES,
  SUN_GATE_JAMBS,
  buildWorld,
  decorBodyBox,
  groundIdolDecor,
  type BuiltWorld
} from "../../../apps/showcase-pips-big-leap/src/game/world";
import { worldSpec } from "../../../apps/showcase-pips-big-leap/src/game/worlds";
import { WORLD_IDS } from "../../../apps/showcase-pips-big-leap/src/game/looks";
import { createPlayer, stepPlayer, type PlayerInput } from "../../../apps/showcase-pips-big-leap/src/game/player";
import { WINDMILL_HUB } from "../../../apps/showcase-pips-big-leap/src/art/idolModels";
import { sharedAssets } from "../../../apps/showcase-pips-big-leap/src/aura-assets.shared";
import type { DecorSpec, SolidBox, WorldSpec } from "../../../apps/showcase-pips-big-leap/src/game/types";

type Node = { kind?: string; name?: string; position?: readonly number[]; size?: readonly number[]; children?: readonly Node[] };
const walk = (nodes: readonly Node[]): Node[] => nodes.flatMap((n) => [n, ...walk(n.children ?? [])]);

/** Idol model per decor kind (src/art/idolModels.ts DECOR_IDOL) — the drawn footprint the collider must match. */
const IDOL_KEY: Partial<Record<DecorSpec["kind"], string>> = {
  tree: "pipOakTree", conifer: "pipConifer", mushroom: "pipToadstool", flower: "pipFlower", rock: "pipBoulder",
  pillar: "pipStonePillar", arch: "pipStoneArch", sail: "pipWatchtower", windmill: "pipWindmillTower", crate: "pipCrate",
  barrel: "pipBarrel", lantern: "pipLantern", crystal: "pipCrystal", vent: "pipEmberVent"
};
/** Soft or airborne decor Pip may brush through. */
const SOFT = new Set<DecorSpec["kind"]>(["flower", "cloud", "hawk", "star"]);
const PIP_HALF = 0.3;
const PIP_H = 0.9;
const bounds = (key: string) => (sharedAssets as unknown as Record<string, { bounds: readonly [number, number, number] }>)[key]!.bounds;

const decorSolids = (b: BuiltWorld) => b.solids.filter((s) => s.decor);
const platformSolids = (b: BuiltWorld) => b.solids.filter((s) => !s.decor);

/** Platform footprints Pip can walk (movers swept over their travel). */
function corridor(spec: WorldSpec) {
  return spec.platforms.filter((p) => !p.ghost).map((p) => {
    const m = p.mover;
    const ax = m?.axis === "x" ? m.amplitude : 0, az = m?.axis === "z" ? m.amplitude : 0, ay = m?.axis === "y" ? m.amplitude : 0;
    return { id: p.id, x: p.x, z: p.z, hx: p.w / 2 + ax, hz: p.d / 2 + az, top: p.y, topHi: p.y + ay, topLo: p.y - ay };
  });
}

describe("pips-big-leap pass-through: solid decor is solid", () => {
  it("every solid decor footprint that reaches the playable corridor has a collider at its drawn spot", () => {
    const report: string[] = [];
    for (const id of WORLD_IDS) {
      const spec = worldSpec(id);
      const built = buildWorld(spec);
      const plats = platformSolids(built);
      const lanes = corridor(spec);
      const nodes = walk((built.scene.toJSON() as unknown as { nodes: Node[] }).nodes);
      for (const [i, d] of spec.decor.entries()) {
        if (SOFT.has(d.kind)) continue;
        const s = d.s ?? 1;
        const animated = d.kind === "banner" || d.kind === "fan";
        const g = animated ? d : groundIdolDecor({ kind: d.kind as never, x: d.x, y: d.y, z: d.z, yaw: d.yaw, s: d.s }, plats, spec.gate);
        // Drawn footprint: the Idol bounds (banners: pole, fans: ring) around the drawn position.
        const key = IDOL_KEY[d.kind];
        const [bw, bh, bd] = key ? bounds(key) : d.kind === "fan" ? [2.2, 0.53, 2.2] : [0.12, 2.15, 0.12];
        const r = (Math.max(bw, bd) / 2) * s;
        const inCorridor = lanes.some((l) =>
          Math.abs(g.x - l.x) < l.hx + r && Math.abs(g.z - l.z) < l.hz + r && g.y < l.topHi + PIP_H && g.y + bh * s > l.topLo
        );
        const bodies = DECOR_BODIES[d.kind];
        expect(bodies, `${id} ${d.id}: ${d.kind} has no collider body`).toBeDefined();
        const mine = decorSolids(built).filter((c) => c.id === `decor:${d.id}` || c.id.startsWith(`decor:${d.id}:`));
        if (d.kind === "banner") {
          // A banner hung over the Sun-Gate has no collider; its pole foot must then clear Pip's head on the floor below.
          const floor = plats.filter((b) => Math.abs(d.x - b.x) <= b.hx && Math.abs(d.z - b.z) <= b.hz && b.y + b.hy <= d.y + 0.25).map((b) => b.y + b.hy);
          const onFloor = floor.some((t) => Math.abs(t - d.y) <= 0.25);
          if (!onFloor) {
            expect(mine, `${id} ${d.id} hung banner`).toHaveLength(0);
            expect(d.y - Math.max(...floor), `${id} ${d.id} pole foot above Pip's head`).toBeGreaterThanOrEqual(PIP_H);
            continue;
          }
        }
        expect(mine.length, `${id} ${d.id}`).toBe(bodies!.length);
        bodies!.forEach((b, k) => {
          const want = decorBodyBox(b, g.x, g.y, g.z, d.yaw ?? 0, s);
          const got = mine[k]!;
          for (const ax of ["x", "y", "z", "hx", "hy", "hz"] as const) expect(got[ax], `${id} ${d.id} ${ax}`).toBeCloseTo(want[ax], 6);
          // Collider inside the drawn bounds and not a token sliver of them (visual ~= hitbox).
          if (key) {
            expect(Math.max(b.hx, b.hz) * 2, `${id} ${d.id} too wide`).toBeLessThanOrEqual(Math.max(bw, bd) + 1e-6);
            expect(b.hx * 2, `${id} ${d.id} too thin`).toBeGreaterThanOrEqual(bw * (d.kind === "arch" ? 0.25 : 0.5));
            expect(b.h + (b.dy ?? 0), `${id} ${d.id} height`).toBeCloseTo(bh + (b.dy ?? 0), 1);
          }
        });
        // The drawn node sits where the collider was placed (diorama look).
        const drawn = animated
          ? nodes.find((n) => n.name === `${d.id}:${d.kind}`)
          : nodes.find((n) => new RegExp(`^pbl-decor:${d.kind}:\\d+$`).test(n.name ?? "") && Math.abs(n.position![0]! - g.x) < 1e-6 && Math.abs(n.position![2]! - g.z) < 1e-6);
        expect(drawn, `${id} ${d.id} drawn at its collider`).toBeDefined();
        if (inCorridor) report.push(`${id}:${d.id}`);
        void i;
      }
      // The Sun-Gate jambs are solid too; the opening between them stays clear for the gate trigger.
      const jambs = decorSolids(built).filter((c) => c.id.startsWith("decor:sun-gate:"));
      expect(jambs).toHaveLength(SUN_GATE_JAMBS.length);
      for (const j of jambs) expect(Math.abs(j.x - spec.gate.x) - j.hx, `${id} gate opening`).toBeGreaterThan(1.2);
    }
    // The start plazas' trees, rocks, crates, pillars and crystals, the Forest vista arch, the gate lanterns…
    expect(report.length).toBeGreaterThan(20);
  });

  it("decor colliders never swallow the spawn, pickups, checkpoints, springs or the gate trigger", () => {
    for (const id of WORLD_IDS) {
      const spec = worldSpec(id);
      const built = buildWorld(spec);
      const points: [string, number, number, number][] = [
        ["spawn", spec.spawn[0], spec.spawn[1], spec.spawn[2]],
        ["gate", spec.gate.x, spec.gate.y, spec.gate.z],
        ...[...spec.seeds, ...spec.acorns, ...spec.hearts].map((p) => [p.id, p.x, p.y - 0.6, p.z] as [string, number, number, number]),
        ...[...spec.checkpoints, ...spec.springs].map((p) => [p.id, p.x, p.y, p.z] as [string, number, number, number])
      ];
      for (const c of decorSolids(built)) {
        for (const [what, x, y, z] of points) {
          const hit = Math.abs(x - c.x) < c.hx + PIP_HALF && Math.abs(z - c.z) < c.hz + PIP_HALF && y < c.y + c.hy && y + PIP_H > c.y - c.hy;
          expect(hit, `${id}: ${c.id} blocks ${what}`).toBe(false);
        }
      }
    }
  });

  it("windmill sail discs spin clear of every platform Pip can stand on or jump from", () => {
    for (const id of WORLD_IDS) {
      const spec = worldSpec(id);
      for (const d of spec.decor.filter((x) => x.kind === "windmill")) {
        const s = d.s ?? 1, yaw = d.yaw ?? 0;
        const [hx, hy, hz] = WINDMILL_HUB;
        const hub = [d.x + (hx * Math.cos(yaw) + hz * Math.sin(yaw)) * s, d.y + hy * s, d.z + (-hx * Math.sin(yaw) + hz * Math.cos(yaw)) * s];
        const r = 1.97 * s;
        for (const l of corridor(spec)) {
          const clear = Math.abs(hub[0]! - l.x) > l.hx + r + PIP_HALF || Math.abs(hub[2]! - l.z) > l.hz + 0.3 * s + PIP_HALF || hub[1]! - r > l.topHi + 2.5 || hub[1]! + r < l.topLo;
          expect(clear, `${id} ${d.id} sails sweep ${l.id}`).toBe(true);
        }
      }
    }
  });

  it("the collision world stays identical in both looks and decor bodies never ground other decor", () => {
    for (const id of WORLD_IDS) {
      const a = buildWorld(worldSpec(id));
      const b = buildWorld(worldSpec(id), { look: "original" });
      expect(JSON.stringify(a.solids)).toBe(JSON.stringify(b.solids));
      expect(platformSolids(a).every((s) => !s.id.startsWith("decor:"))).toBe(true);
    }
  });

  it("Pip running at a start-plaza boulder stops against it (and can still hop onto it)", () => {
    const spec = worldSpec("w1");
    const rock = spec.decor.find((d) => d.id === "w1-r1")!;
    const built = buildWorld(spec);
    const body = built.solids.find((s) => s.id === "decor:w1-r1") as SolidBox;
    const p = createPlayer(built);
    p.x = rock.x;
    p.z = rock.z + 2.2;
    const assist = game.jumpAssist({ coyoteMs: built.motion.tuning.coyoteMs, bufferMs: built.motion.tuning.jumpBufferMs });
    const idle: PlayerInput = { moveX: 0, moveZ: 0, jumpPressed: false, jumpHeld: false, divePressed: false, poundPressed: false };
    for (let f = 0; f < 90; f += 1) stepPlayer(p, built, { ...idle, moveZ: 1 }, 1 / 60, { doubleJump: false, assist });
    expect(p.z, "stopped at the boulder's near face").toBeGreaterThanOrEqual(body.z + body.hz + PIP_HALF - 0.01);
    expect(p.z).toBeLessThan(body.z + body.hz + PIP_HALF + 0.05);
    for (let f = 0; f < 50; f += 1) stepPlayer(p, built, { ...idle, moveZ: 1, jumpPressed: f === 0, jumpHeld: true }, 1 / 60, { doubleJump: false, assist });
    expect(p.y, "hopped up onto the boulder").toBeGreaterThan(body.y + body.hy - 0.05);
  });
});

describe("pips-big-leap pass-through: hazard visuals match their hurt boxes", () => {
  it("each hazard's slab and sculpted feature sit on its hurt box footprint", () => {
    for (const id of WORLD_IDS) {
      const spec = worldSpec(id);
      const built = buildWorld(spec);
      const nodes = walk((built.scene.toJSON() as unknown as { nodes: Node[] }).nodes);
      for (const h of built.hazards) {
        const slab = nodes.find((n) => n.name === `hazard:${h.spec.id}`)!;
        const feature = nodes.find((n) => n.name === `hazard:${h.spec.id}:mesh`)!;
        expect(slab, `${id} ${h.spec.id}`).toBeDefined();
        expect(feature, `${id} ${h.spec.id}`).toBeDefined();
        expect(slab.size![0]).toBeCloseTo(h.hx * 2, 6);
        expect(slab.size![2]).toBeCloseTo(h.hz * 2, 6);
        expect(slab.position![0]).toBeCloseTo(h.x, 6);
        expect(slab.position![2]).toBeCloseTo(h.z, 6);
        // Slab top = hurt-volume top; the feature grows from the slab top at the box centre.
        expect(slab.position![1]! + slab.size![1]! / 2).toBeCloseTo(h.y + h.hy, 6);
        expect(feature.position![0]).toBeCloseTo(h.x, 6);
        expect(feature.position![2]).toBeCloseTo(h.z, 6);
      }
    }
  });
});
