// GU47 WP-16 (G06) PBL-AN1 prop motion: banners sway, updraft fans spin and leaf pads bob in the diorama,
// visual only (the collision world is unchanged), scaled to 30% under reduced motion (PRD 6.3).
import { describe, expect, it } from "vitest";
import { ANIMATED_DECOR_KINDS, buildWorld } from "../../../apps/showcase-pips-big-leap/src/game/world";
import { worldSpec } from "../../../apps/showcase-pips-big-leap/src/game/worlds";
import { WORLD_IDS } from "../../../apps/showcase-pips-big-leap/src/game/looks";
import {
  PROP_MOTION,
  bannerTilt,
  createDioramaPresentation,
  fanYaw,
  padBob,
  type PresentationFrame,
  type PresentationNode
} from "../../../apps/showcase-pips-big-leap/src/game/presentation";

type Node = { readonly kind: string; readonly name?: string; readonly runtime?: unknown; readonly targetHeight?: number; readonly castShadow?: boolean; readonly children?: readonly Node[] };
const flat = (nodes: readonly Node[]): Node[] => nodes.flatMap((n) => [n, ...(n.kind === "group" ? flat(n.children ?? []) : [])]);
const sceneOf = (id: (typeof WORLD_IDS)[number], look?: "original") =>
  flat((buildWorld(worldSpec(id), look ? { look } : {}).scene.toJSON() as unknown as { nodes: Node[] }).nodes);

function recorder() {
  const writes = new Map<string, { rot?: number[]; pos?: number[] }>();
  const lookup = (name: string): PresentationNode => ({
    setScale: () => undefined,
    setRotation: (x, y, z) => { writes.set(name, { ...writes.get(name), rot: [x, y, z] }); },
    setPosition: (x, y, z) => { writes.set(name, { ...writes.get(name), pos: [x, y, z] }); }
  });
  return { writes, lookup };
}

const frame = (time: number): PresentationFrame => ({ dt: 1 / 60, time, state: "grounded", grounded: true, position: [0, 0, 0], aspect: 16 / 9, clearance: 1, gateUnlocked: false });

describe("pips-big-leap prop motion (PBL-AN1)", () => {
  it("gives every banner and fan its own runtime node at today's fitted size, and only in the diorama", () => {
    let banners = 0, fans = 0;
    for (const id of WORLD_IDS) {
      const built = buildWorld(worldSpec(id));
      const nodes = sceneOf(id);
      const animated = worldSpec(id).decor.filter((d) => ANIMATED_DECOR_KINDS.has(d.kind));
      expect(built.presentation.animatedDecor.map((d) => d.name)).toEqual(animated.map((d) => `${d.id}:${d.kind}`));
      for (const d of animated) {
        const n = nodes.find((x) => x.name === `${d.id}:${d.kind}`)!;
        expect(n.runtime, n.name).toBeDefined();
        expect(n.targetHeight).toBeCloseTo(2.2 * (d.s ?? 1), 9);
        if (d.kind === "banner") { banners += 1; expect(n.castShadow).toBe(false); } else fans += 1;
      }
      expect(buildWorld(worldSpec(id), { look: "original" }).presentation.animatedDecor).toEqual([]);
    }
    expect(banners).toBeGreaterThan(0);
    expect(fans).toBeGreaterThan(0);
  });

  it("makes the leaf-pad draws runtime nodes in the worlds that have static leaf pads", () => {
    const withPads = WORLD_IDS.filter((id) => worldSpec(id).platforms.some((p) => p.kind === "leaf" && !p.mover && !p.timed));
    expect(withPads.length).toBeGreaterThan(0);
    for (const id of WORLD_IDS) {
      const bob = buildWorld(worldSpec(id)).presentation.bobNodes;
      expect(bob, id).toEqual(withPads.includes(id) ? ["plats:leaf", "plat-tops:leaf"] : []);
      for (const name of bob) expect(sceneOf(id).find((n) => n.name === name)?.runtime, name).toBeDefined();
    }
  });

  it("keeps the collision world identical to the original look", () => {
    for (const id of WORLD_IDS) {
      const a = buildWorld(worldSpec(id));
      const b = buildWorld(worldSpec(id), { look: "original" });
      expect(JSON.stringify(a.solids)).toBe(JSON.stringify(b.solids));
      expect(JSON.stringify(a.cameraObstacles)).toBe(JSON.stringify(b.cameraObstacles));
    }
  });

  it("sways, spins and bobs within the authored amplitudes, at 30% under reduced motion", () => {
    for (let t = 0; t < 10; t += 0.137) {
      expect(Math.abs(bannerTilt(t, 1.3, 1))).toBeLessThanOrEqual(PROP_MOTION.bannerSway + 1e-12);
      expect(Math.abs(padBob(t, 1))).toBeLessThanOrEqual(PROP_MOTION.bobMetres + 1e-12);
      expect(Math.abs(padBob(t, 0.3))).toBeLessThanOrEqual(0.3 * PROP_MOTION.bobMetres + 1e-12);
    }
    expect(fanYaw(0.5, 2, 1) - 0.5).toBeCloseTo(2 * PROP_MOTION.fanSpin, 9);
    expect(fanYaw(0.5, 2, 0.3) - 0.5).toBeCloseTo(0.6 * PROP_MOTION.fanSpin, 9);
  });

  it("writes the motion through the node handles each frame", () => {
    const id = WORLD_IDS.find((w) => buildWorld(worldSpec(w)).presentation.animatedDecor.some((d) => d.kind === "banner"))!;
    const built = buildWorld(worldSpec(id));
    for (const reducedMotion of [false, true]) {
      const rec = recorder();
      const p = createDioramaPresentation({}, { mode: "diorama", reducedMotion, heroNode: "hero", gateRingNode: "ring" });
      p.frame(frame(1.1), built, rec.lookup);
      const motion = reducedMotion ? 0.3 : 1;
      for (const d of built.presentation.animatedDecor) {
        const rot = rec.writes.get(d.name)?.rot;
        expect(rot, d.name).toBeDefined();
        if (d.kind === "banner") expect(rot![2]).toBeCloseTo(bannerTilt(1.1, d.phase, motion), 9);
        else expect(rot![1]).toBeCloseTo(fanYaw(d.yaw, 1.1, motion), 9);
      }
      for (const name of built.presentation.bobNodes) expect(rec.writes.get(name)?.pos?.[1]).toBeCloseTo(padBob(1.1, motion), 9);
    }
  });
});
