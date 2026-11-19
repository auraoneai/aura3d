// Moving-parts pass (artifacts/idol/MOVING-PARTS.md): Idol GLBs are single rigid meshes, so every part that should move is
// its own node the presentation drives — the windmill sail cross spins about the tower's axle, hawks circle, and the
// spring cap / checkpoint pennant / Sun-Gate ring stay procedural movers. Advances a few frames and checks they move.
import { describe, expect, it } from "vitest";
import { buildWorld } from "../../../apps/showcase-pips-big-leap/src/game/world";
import { worldSpec } from "../../../apps/showcase-pips-big-leap/src/game/worlds";
import { createDioramaPresentation, type PresentationFrame, type PresentationNode } from "../../../apps/showcase-pips-big-leap/src/game/presentation";
import { WINDMILL_HUB } from "../../../apps/showcase-pips-big-leap/src/art/idolModels";
import { sharedAssets } from "../../../apps/showcase-pips-big-leap/src/aura-assets.shared";

type Node = { kind?: string; name?: string; position?: readonly number[]; rotation?: readonly number[]; scale?: number | readonly number[]; asset?: { id?: string }; runtime?: { id?: string }; children?: readonly Node[] };
const walk = (nodes: readonly Node[]): Node[] => nodes.flatMap((n) => [n, ...walk(n.children ?? [])]);

const stubApp = {
  setOutput: () => undefined,
  atmosphere: { setFog: () => undefined, setSky: () => undefined },
  post: { setEffect: () => undefined },
  effects: { registerPreset: () => undefined, burst: () => ({ id: "b", alive: true, stop: () => undefined, setPosition: () => undefined }), trail: () => ({ id: "t", alive: true, length: 0, pointCount: 0, clear: () => undefined, stop: () => undefined, setPosition: () => undefined }), liveCount: 0 },
  camera: { play: () => ({ done: new Promise<void>(() => undefined), progress: 0, skip: () => undefined }), fovKick: { set: () => undefined }, shake: { add: () => undefined }, evidence: () => ({ viewProjection: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] }) }
};

function record() {
  const rot = new Map<string, number[]>();
  const pos = new Map<string, number[]>();
  const lookup = (name: string): PresentationNode => ({
    setScale: () => undefined,
    setRotation: (x, y, z) => { rot.set(name, [x, y, z]); },
    setPosition: (x, y, z) => { pos.set(name, [x, y, z]); }
  });
  return { rot, pos, lookup };
}
const frame = (time: number): PresentationFrame => ({ dt: 1 / 60, time, state: "grounded", grounded: true, position: [0, 0.6, 0], aspect: 16 / 9, clearance: 1, gateUnlocked: false });

describe("pips-big-leap moving parts on Idol models", () => {
  it("w2 windmills are a sail-less tower plus a separate sail cross hung on the tower's axle", () => {
    const spec = worldSpec("w2");
    const nodes = walk((buildWorld(spec).scene.toJSON() as unknown as { nodes: Node[] }).nodes);
    const mills = spec.decor.filter((d) => d.kind === "windmill");
    expect(mills.length).toBeGreaterThan(0);
    const towers = nodes.filter((n) => n.asset?.id === "pipWindmillTower");
    const sails = nodes.filter((n) => n.asset?.id === "pipWindmillSails");
    expect(towers).toHaveLength(mills.length);
    expect(sails).toHaveLength(mills.length);
    expect(nodes.some((n) => n.asset?.id === "pipWindmill")).toBe(false);
    for (const tower of towers) {
      const hub = nodes.find((n) => n.name === `${tower.name}:hub`)!;
      const s = typeof tower.scale === "number" ? tower.scale : 1;
      const yaw = tower.rotation?.[1] ?? 0;
      const [tx, ty, tz] = tower.position!;
      const [hx, hy, hz] = hub.position!;
      // The hub is the measured axle point in the tower's frame, scaled with it.
      expect(hy - ty).toBeCloseTo(WINDMILL_HUB[1] * s, 3);
      expect((hx - tx) * Math.sin(yaw) + (hz - tz) * Math.cos(yaw)).toBeCloseTo(WINDMILL_HUB[2] * s, 3);
      // ... above two thirds of the tower and in front of its body (the axle tip sits inside the tower's +Z half-depth).
      const bounds = (sharedAssets as unknown as Record<string, { bounds: readonly number[] }>).pipWindmillTower!.bounds;
      expect(WINDMILL_HUB[1]).toBeGreaterThan(bounds[1]! * 0.55);
      expect(WINDMILL_HUB[2]).toBeLessThan(bounds[2]! / 2);
      expect(nodes.find((n) => n.name === `${tower.name}:sails`)?.runtime?.id).toBe(`${tower.name}:sails`);
    }
  });

  it("the presentation spins the sails about the axle and circles the hawks, frame to frame", () => {
    for (const id of ["w1", "w2"] as const) {
      const built = buildWorld(worldSpec(id));
      const movers = built.presentation.animatedDecor.filter((d) => d.kind === "sails" || d.kind === "hawk" || d.kind === "cloud");
      expect(movers.length, id).toBeGreaterThan(0);
      const p = createDioramaPresentation(stubApp as never, { mode: "diorama", reducedMotion: false, heroNode: "pip", gateRingNode: "sun-gate-ring" });
      p.worldMounted(built);
      const a = record();
      p.frame(frame(1), built, a.lookup);
      const b = record();
      p.frame(frame(1.5), built, b.lookup);
      for (const m of movers) {
        if (m.kind === "sails") {
          const [x0, y0, z0] = a.rot.get(m.name)!;
          const [x1, y1, z1] = b.rot.get(m.name)!;
          expect([x0, y0, x1, y1]).toEqual([0, 0, 0, 0]); // spins only about the axle (local Z)
          expect(Math.abs(z1! - z0!), m.name).toBeGreaterThan(0.2);
        } else {
          const p0 = a.pos.get(m.name)!, p1 = b.pos.get(m.name)!;
          expect(Math.hypot(p1[0]! - p0[0]!, p1[1]! - p0[1]!, p1[2]! - p0[2]!), m.name).toBeGreaterThan(m.kind === "hawk" ? 0.1 : 0.001);
          expect(Math.hypot(p0[0]! - m.base![0]!, p0[2]! - m.base![2]!), m.name).toBeLessThanOrEqual(1.0 * (m.scale ?? 1) + 1e-6);
        }
      }
    }
  });
});
