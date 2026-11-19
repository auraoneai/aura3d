// Pass-through pass (owner, 2026-11-18): shots, blocks and debris must not pass through solid-looking decor.
//  1. No decor (visual bounds or collider) stands in the play volume: the flight lane along z = 0 out to the right wall,
//     and every level's fortress at spawn (pieces, gulls, windmill rotors). The island windmill's sweeping sails count.
//  2. Every solid-looking decor piece of the stage has a static collider whose box matches its visual bounds.
//  3. In the sim those colliders are static and stop a shot that would otherwise fly on.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { CHAPTERS, LEVELS } from "../../../apps/showcase-slingshot-siege/src/game/levels";
import { buildStage } from "../../../apps/showcase-slingshot-siege/src/game/stage";
import { SiegeSim } from "../../../apps/showcase-slingshot-siege/src/game/sim";
import { AMMO } from "../../../apps/showcase-slingshot-siege/src/game/ammo";
import { DECOR_COLLIDERS, DECOR_FILL, DECOR_LOCAL_BOUNDS, type DecorCollider } from "../../../apps/showcase-slingshot-siege/src/game/decorLayout";
import { windmillSailPose, WINDMILL_PLACEMENT, WINDMILL_SAILS_ID } from "../../../apps/showcase-slingshot-siege/src/art/idolModels";

type Node = { kind?: string; name?: string; asset?: { url?: string }; position?: number[]; rotation?: number[]; scale?: number | number[];
  instances?: { position?: number[]; rotation?: number[]; scale?: number | number[] }[]; children?: Node[]; geometry?: { positions?: number[] } };
const json = (n: unknown): Node => (typeof (n as { toJSON?: () => unknown }).toJSON === "function" ? (n as { toJSON: () => Node }).toJSON() : (n as Node));
const walk = (nodes: readonly Node[]): Node[] => nodes.flatMap((n) => [n, ...walk(n.children ?? [])]);

const manifest = JSON.parse(readFileSync("aura.assets.json", "utf8")) as { assets: { id: string; url: string; boundsMetadata?: { min: number[]; max: number[] } }[] };
const boundsByUrl = (url: string): { id: string; min: number[]; max: number[] } => {
  const a = manifest.assets.find((e) => e.url === url);
  if (!a?.boundsMetadata) throw new Error(`no bounds for ${url}`);
  return { id: a.id, ...a.boundsMetadata };
};

/** A yawed box: centre, half extents on its own axes, vertical span. Engine yaw: x' = c x + s z, z' = -s x + c z. */
interface Box { readonly c: readonly [number, number]; readonly h: readonly [number, number]; readonly yaw: number; readonly y0: number; readonly y1: number }
const axes = (yaw: number): [number, number][] => [[Math.cos(yaw), -Math.sin(yaw)], [Math.sin(yaw), Math.cos(yaw)]];
/** Separating-axis overlap depth (> 0 = the boxes interpenetrate by that much on their shallowest axis). */
function overlap(a: Box, b: Box): number {
  const dy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  if (dy <= 0) return dy;
  const A = axes(a.yaw), B = axes(b.yaw);
  let depth = dy;
  for (const ax of [...A, ...B]) {
    const r = (o: Box, X: [number, number][]) => Math.abs(X[0]![0] * ax[0] + X[0]![1] * ax[1]) * o.h[0] + Math.abs(X[1]![0] * ax[0] + X[1]![1] * ax[1]) * o.h[1];
    const d = Math.abs((a.c[0] - b.c[0]) * ax[0] + (a.c[1] - b.c[1]) * ax[1]);
    depth = Math.min(depth, r(a, A) + r(b, B) - d);
    if (depth <= 0) return depth;
  }
  return depth;
}
const s3 = (s: number | number[] | undefined): number[] => (s === undefined ? [1, 1, 1] : typeof s === "number" ? [s, s, s] : s);
/** Visual box of a placed mesh with local bounds min/max (yaw only: decor stands upright). */
function visualBox(t: { position?: number[]; rotation?: number[]; scale?: number | number[] }, min: readonly number[], max: readonly number[]): Box {
  const s = s3(t.scale), p = t.position ?? [0, 0, 0], yaw = t.rotation?.[1] ?? 0;
  const lx = ((min[0]! + max[0]!) / 2) * s[0]!, lz = ((min[2]! + max[2]!) / 2) * s[2]!;
  const c = Math.cos(yaw), sn = Math.sin(yaw);
  return { c: [p[0]! + c * lx + sn * lz, p[2]! - sn * lx + c * lz], h: [((max[0]! - min[0]!) / 2) * s[0]!, ((max[2]! - min[2]!) / 2) * s[2]!], yaw, y0: p[1]! + min[1]! * s[1]!, y1: p[1]! + max[1]! * s[1]! };
}
const colliderBox = (d: DecorCollider): Box => ({ c: [d.center[0], d.center[2]], h: [d.half[0], d.half[2]], yaw: d.yaw, y0: d.center[1] - d.half[1], y1: d.center[1] + d.half[1] });

/** Solid-looking decor model nodes of the GU47 / Idol stage. */
const SOLID_MODEL = /^(island-tree-\d|prop-watchtower|prop-gatehouse|prop-windmill|prop-stone-bridge|fortress-flag-bastion|fg-crate-\d|fg-barrel-\d)$/;

interface Visual { readonly name: string; readonly box: Box; readonly mesh: string }
function stageVisuals(chapterIndex: number): { visuals: Visual[]; sails: Box; cliffLocal: { min: number[]; max: number[] } } {
  const nodes = walk(buildStage(CHAPTERS[chapterIndex]!, { reducedMotion: false }).nodes.map(json));
  const visuals: Visual[] = [];
  for (const n of nodes) {
    if (n.kind !== "model" || !SOLID_MODEL.test(n.name ?? "")) continue;
    const b = boundsByUrl(n.asset!.url!);
    visuals.push({ name: n.name!, box: visualBox(n, b.min, b.max), mesh: b.id });
  }
  // Limestone cliffs: one instanced mesh; local bounds from the mesh itself.
  const cliffs = nodes.find((n) => n.name === "coastal-limestone-cliffs")!;
  const P = cliffs.geometry!.positions!;
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < P.length; i += 3) for (let k = 0; k < 3; k += 1) { min[k] = Math.min(min[k]!, P[i + k]!); max[k] = Math.max(max[k]!, P[i + k]!); }
  cliffs.instances!.forEach((t, i) => visuals.push({ name: `coastal-limestone-cliffs#${i}`, box: visualBox(t, min, max), mesh: "cliff" }));
  // Mast and banner pole: unit cylinders (radius 0.5, height 1, centred).
  const poles = nodes.find((n) => n.name === "flag-poles")!;
  const poleNames = ["fg-banner-pole", "fortress-flag-mast"];
  poles.instances!.forEach((t, i) => visuals.push({ name: poleNames[i]!, box: visualBox(t, [-0.5, -0.5, -0.5], [0.5, 0.5, 0.5]), mesh: "pole" }));
  // The windmill's sail cross sweeps a disc about its axle (local +X): radius = the 1.8 m arm, thickness = the cross.
  const sailNode = nodes.find((n) => n.name === WINDMILL_SAILS_ID)!;
  const sb = boundsByUrl(sailNode.asset!.url!);
  const pose = windmillSailPose(0);
  const R = Math.max(-sb.min[1]!, sb.max[1]!, -sb.min[2]!, sb.max[2]!);
  const sails: Box = { c: [pose.position[0], pose.position[2]], h: [(sb.max[0]! - sb.min[0]!) / 2, R], yaw: pose.rotation[1], y0: pose.position[1] - R, y1: pose.position[1] + R };
  return { visuals, sails, cliffLocal: { min, max } };
}

/**
 * The play volume per level: the shot lane plus the fortress bodies as the sim actually spawns them (after the
 * layout settle and the warm start: real body positions and yaw), not the recipe numbers.
 */
function playVolume(level: (typeof LEVELS)[number]): { name: string; box: Box }[] {
  // Shot lane: from in front of the sling to the right wall's inner face, z = 0 +/- (largest ball radius + the triple
  // split's 0.3 m side offset), floor to well above the highest lob.
  const ball = Math.max(...Object.values(AMMO).map((a) => a.radius));
  const out: { name: string; box: Box }[] = [{ name: "lane", box: { c: [6.45, 0], h: [13.05, ball + 0.3], yaw: 0, y0: 0, y1: 14 } }];
  const sim = new SiegeSim({ level, seed: 7, decor: DECOR_COLLIDERS });
  const yawOf = (q: readonly number[]): number => 2 * Math.atan2(q[1]!, q[3]!);
  sim.pieceList().forEach((p, i) => {
    const b = p.body.position;
    // Upright pieces only: a tilted one would make the yaw-only box meaningless.
    expect(Math.hypot(p.body.rotation[0]!, p.body.rotation[2]!), `L${level.id + 1} piece ${i} tilted at spawn`).toBeLessThan(0.02);
    out.push({ name: `piece ${i}`, box: { c: [b[0]!, b[2]!], h: [p.spec.hx, p.spec.hz], yaw: yawOf(p.body.rotation), y0: b[1]! - p.spec.hy, y1: b[1]! + p.spec.hy } });
  });
  sim.gullList().forEach((g, i) => {
    const b = g.body.position;
    out.push({ name: `gull ${i}`, box: { c: [b[0]!, b[2]!], h: [0.26, 0.26], yaw: 0, y0: b[1]! - 0.26, y1: b[1]! + 0.26 } });
  });
  level.windmills.forEach((w, i) => out.push({ name: `windmill ${i}`, box: { c: [w.x, w.z], h: [w.bladeLength, 0.15], yaw: 0, y0: w.y - w.bladeLength, y1: w.y + w.bladeLength } }));
  return out;
}

describe("slingshot-siege decor pass-through", () => {
  const ch0 = stageVisuals(0);

  it("every solid-looking decor piece has a static collider matching its visual bounds", () => {
    expect(ch0.visuals.length).toBe(15 + 9 + 2);
    expect(DECOR_COLLIDERS.length).toBe(ch0.visuals.length);
    for (const v of ch0.visuals) {
      const col = DECOR_COLLIDERS.find((d) => d.name === v.name);
      expect(col, `${v.name} has no collider`).toBeTruthy();
      const c = colliderBox(col!);
      // Same footing, same yaw, same height span.
      expect(Math.hypot(c.c[0] - v.box.c[0], c.c[1] - v.box.c[1]), `${v.name} centre`).toBeLessThan(0.02);
      expect(Math.abs(Math.sin(c.yaw - v.box.yaw)), `${v.name} yaw`).toBeLessThan(0.01);
      expect(Math.abs(c.y0 - v.box.y0), `${v.name} base`).toBeLessThan(0.02);
      expect(Math.abs(c.y1 - v.box.y1), `${v.name} top`).toBeLessThan(0.02);
      // Footprint: never wider than the visual, and at least the documented fill of it (a pine is a cone on a disc).
      const fill = v.mesh === "pole" ? 1 : DECOR_FILL[(v.mesh === "cliff" ? "cliff" : v.mesh) as keyof typeof DECOR_FILL].xz;
      expect(fill, v.name).toBeGreaterThanOrEqual(0.45);
      for (const k of [0, 1] as const) {
        expect(c.h[k], `${v.name} half ${k}`).toBeLessThanOrEqual(v.box.h[k] * 1.01 + 0.01);
        expect(c.h[k], `${v.name} half ${k}`).toBeGreaterThanOrEqual(v.box.h[k] * fill - 0.01);
      }
    }
  });

  it("the collider bounds table matches the admitted GLBs and the cliff mesh", () => {
    for (const [id, b] of Object.entries(DECOR_LOCAL_BOUNDS)) {
      const src = id === "cliff" ? ch0.cliffLocal : manifest.assets.find((a) => a.id === id)?.boundsMetadata;
      expect(src, id).toBeTruthy();
      for (let k = 0; k < 3; k += 1) {
        expect(b.min[k]!, `${id} min ${k}`).toBeCloseTo(src!.min[k]!, 2);
        expect(b.max[k]!, `${id} max ${k}`).toBeCloseTo(src!.max[k]!, 2);
      }
    }
  });

  it("decor is the same on every chapter", () => {
    for (let c = 1; c < CHAPTERS.length; c += 1) {
      const other = stageVisuals(c);
      expect(other.visuals.map((v) => v.name)).toEqual(ch0.visuals.map((v) => v.name));
      other.visuals.forEach((v, i) => expect(v.box, v.name).toEqual(ch0.visuals[i]!.box));
    }
  });

  it("no decor (visual or collider) and no windmill sail sweep stands in the shot lane or any level's fortress", () => {
    const hits: string[] = [];
    const things: { name: string; box: Box }[] = [
      ...ch0.visuals.map((v) => ({ name: `${v.name} (visual)`, box: v.box })),
      ...DECOR_COLLIDERS.map((d) => ({ name: `${d.name} (collider)`, box: colliderBox(d) })),
      { name: "windmill sails (swept)", box: ch0.sails }
    ];
    for (const level of LEVELS) {
      for (const vol of playVolume(level)) {
        for (const t of things) {
          // Clearance around every fortress body as it spawns: 10 cm from a static collider (levels.ts keeps 15 cm),
          // 5 cm from the wider visual bounds (a pine's turf disc, the windmill's axle stub).
          const m = t.name.endsWith("(collider)") ? 0.1 : 0.05;
          const depth = overlap(t.box, { ...vol.box, h: [vol.box.h[0] + m, vol.box.h[1] + m] });
          if (depth > 0) hits.push(`L${level.id} ${vol.name} x ${t.name}: ${depth.toFixed(2)} m`);
        }
      }
    }
    expect(hits).toEqual([]);
  }, 600_000);

  it("the windmill tower, the bastion and the moved pines stay where the play volume test measured them", () => {
    expect(WINDMILL_PLACEMENT.position[2]).toBeLessThanOrEqual(-4.0);
    expect(DECOR_COLLIDERS.find((d) => d.name === "fortress-flag-bastion")!.center[2]).toBeLessThan(-2.5);
  });

  describe("in the sim", () => {
    const level = LEVELS[0]!;
    const run = (decor: readonly DecorCollider[], origin: [number, number, number], velocity: [number, number, number], frames: number): number[] => {
      const sim = new SiegeSim({ level, seed: 7, decor });
      expect(sim.decorBodyIds().size).toBe(decor.length);
      sim.launch("stone", origin, velocity);
      // The last position while the ball is live (past the shoreline it sinks and is retired).
      let last = [...origin];
      for (let i = 0; i < frames; i += 1) {
        sim.update(1 / 60);
        const p = sim.activeProjectile();
        if (p) last = [...p.body.position];
      }
      return last;
    };

    it("decor colliders are static, not game bodies, and leave the level's own body count alone", () => {
      const plain = new SiegeSim({ level, seed: 7 });
      const dressed = new SiegeSim({ level, seed: 7, decor: DECOR_COLLIDERS });
      expect(dressed.totalBodyCount()).toBe(plain.totalBodyCount());
      for (let i = 0; i < 90; i += 1) dressed.update(1 / 60);
      // Nothing of the decor moves: every decor body is static and still where it was built.
      const ids = dressed.decorBodyIds();
      const bodies = (dressed.world as unknown as { bodies?: () => { id: number; type: string; position: number[] }[] }).bodies?.() ?? [];
      for (const b of bodies.filter((b) => ids.has(b.id))) expect(b.type).toBe("static");
    });

    it("a ball thrown at the flag bastion behind the fort stops on it instead of flying through", () => {
      const bastion = DECOR_COLLIDERS.find((d) => d.name === "fortress-flag-bastion")!;
      const origin: [number, number, number] = [bastion.center[0], 0.6, -1.35];
      const front = bastion.center[2] + bastion.half[2] - AMMO.stone.radius;
      const without = run([], origin, [0, 1.2, -9], 40);
      const withDecor = run(DECOR_COLLIDERS, origin, [0, 1.2, -9], 40);
      expect(without[2]!).toBeLessThan(bastion.center[2] - bastion.half[2] - 0.5);
      expect(withDecor[2]!).toBeGreaterThan(front - 0.1);
    });

    it("a ball rolling off the fort into the east pine stops on its trunk", () => {
      const pine = DECOR_COLLIDERS.find((d) => d.name === "island-tree-4")!;
      const origin: [number, number, number] = [pine.center[0], 0.8, 1.2];
      const without = run([], origin, [0, 1.5, 9], 40);
      const withDecor = run(DECOR_COLLIDERS, origin, [0, 1.5, 9], 40);
      expect(without[2]!).toBeGreaterThan(pine.center[2] + 1.5);
      expect(withDecor[2]!).toBeLessThan(pine.center[2]);
    });
  });
});
