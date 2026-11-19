// Creature motion pass (owner: "they're just sliding"): Pip's hawks flap and bank on split wing pivots, and the rigged
// Idol villagers (hedgehog helper, forest-beetle sidekick) idle and pace with their walk clip, legs stepping.
import { readFileSync } from "node:fs";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { describe, expect, it, vi } from "vitest";
import { createTypedGLBActor } from "../../../packages/engine/src/production-runtime/TypedGLBActor.js";
import { buildWorld } from "../../../apps/showcase-pips-big-leap/src/game/world";
import { worldSpec } from "../../../apps/showcase-pips-big-leap/src/game/worlds";
import { createDioramaPresentation, hawkWings, villagerPace, type PresentationFrame, type PresentationNode } from "../../../apps/showcase-pips-big-leap/src/game/presentation";
import { hawkPartNames } from "../../../apps/showcase-pips-big-leap/src/art/idolModels";

type Node = { kind?: string; name?: string; asset?: { id?: string }; runtime?: { id?: string }; animation?: { clip?: string }; scaleMode?: string; children?: readonly Node[] };
const walk = (nodes: readonly Node[]): Node[] => nodes.flatMap((n) => [n, ...walk(n.children ?? [])]);
const frame = (time: number): PresentationFrame => ({ dt: 1 / 60, time, state: "grounded", grounded: true, position: [0, 0.6, 0], aspect: 16 / 9, clearance: 1, gateUnlocked: false });

function record() {
  const rot = new Map<string, number[]>(), pos = new Map<string, number[]>(), clip = new Map<string, string>();
  const lookup = (name: string): PresentationNode => ({
    setScale: () => undefined,
    setRotation: (x, y, z) => { rot.set(name, [x, y, z]); },
    setPosition: (x, y, z) => { pos.set(name, [x, y, z]); },
    setAnimation: (a) => { if (a) clip.set(name, a.clip); }
  });
  return { rot, pos, clip, lookup };
}

describe("pips-big-leap creatures animate their bodies", () => {
  it("hawks are a wingless body plus two runtime wing pivots that flap and a bank group that rolls", () => {
    const built = buildWorld(worldSpec("w1"));
    const nodes = walk((built.scene.toJSON() as unknown as { nodes: Node[] }).nodes);
    const hawks = built.presentation.animatedDecor.filter((d) => d.kind === "hawk");
    expect(hawks.length).toBeGreaterThan(0);
    expect(nodes.some((n) => n.asset?.id === "pipHawk")).toBe(false);
    for (const h of hawks) {
      const parts = hawkPartNames(h.name);
      for (const id of [parts.bank, parts.wingL, parts.wingR]) expect(nodes.find((n) => n.name === id)?.runtime?.id, id).toBe(id);
      const wings = walk([nodes.find((n) => n.name === parts.wingR)!, nodes.find((n) => n.name === parts.wingL)!]).filter((n) => n.kind === "model");
      expect(wings.map((w) => w.asset?.id)).toEqual(["pipHawkWing", "pipHawkWing"]);
      expect(wings.every((w) => w.scaleMode === "world")).toBe(true);
    }
    const p = createDioramaPresentation({} as never, { mode: "diorama", reducedMotion: false, heroNode: "pip", gateRingNode: "ring" });
    const angles: number[] = [];
    for (const t of [0.05, 0.15, 0.25, 0.35]) {
      const r = record();
      p.frame(frame(t), built, r.lookup);
      const parts = hawkPartNames(hawks[0]!.name);
      const right = r.rot.get(parts.wingR)![2]!, left = r.rot.get(parts.wingL)![2]!;
      expect(left).toBeCloseTo(-right, 9); // the wings beat together (mirrored pivots)
      expect(Math.abs(r.rot.get(parts.bank)![2]!)).toBeGreaterThan(0.1); // banked into the circle
      angles.push(right);
    }
    expect(Math.max(...angles) - Math.min(...angles)).toBeGreaterThan(0.3);
    // ... and glide (held, slight dihedral) between flap bursts
    expect(hawkWings(2.5, 0, 1).flap).toBeCloseTo(hawkWings(3.1, 0, 1).flap, 9);
  });

  it("villagers are rigged Idol creatures that idle, then walk out and back with the walk clip", () => {
    for (const id of ["academy", "w1"] as const) {
      const built = buildWorld(worldSpec(id));
      const nodes = walk((built.scene.toJSON() as unknown as { nodes: Node[] }).nodes);
      const v = built.presentation.animatedDecor.find((d) => d.kind === "villager")!;
      const n = nodes.find((x) => x.name === v.name)!;
      expect(n.asset?.id, id).toMatch(/^pip(HedgehogRigged|BeetleRigged)$/);
      expect(n.animation?.clip).toBe("idle");
      const p = createDioramaPresentation({} as never, { mode: "diorama", reducedMotion: false, heroNode: "pip", gateRingNode: "ring" });
      const seen = new Set<string>();
      const positions: number[][] = [];
      for (let t = 0; t < 9; t += 0.25) {
        const r = record();
        p.frame(frame(t), built, r.lookup);
        if (r.clip.has(v.name)) seen.add(r.clip.get(v.name)!);
        positions.push(r.pos.get(v.name)!);
      }
      expect([...seen].sort(), id).toEqual(["idle", "walk"]);
      const travel = Math.max(...positions.map((q) => Math.hypot(q[0]! - v.base![0]!, q[2]! - v.base![2]!)));
      expect(travel).toBeGreaterThan(1.1);
      expect(travel).toBeLessThan(1.21);
      // the far end of the walk is still over the start platform
      const far = villagerPace(v.base!, v.yaw, 1.5 + 2.5, 0, 1).position;
      expect(built.solids.some((b) => Math.abs(far[0] - b.x) <= b.hx && Math.abs(far[2] - b.z) <= b.hz && Math.abs(b.y + b.hy - v.base![1]!) < 0.05), id).toBe(true);
    }
    expect(villagerPace([0, 0, 0], 0, 5, 0, 0.3).clip).toBe("idle"); // reduced motion idles in place
  });

  for (const key of ["pipHedgehogRigged", "pipBeetleRigged"]) {
    it(`${key}: the idle and walk clips the presentation plays move the legs over time`, async () => {
      const file = `apps/showcase-pips-big-leap/assets/idol/${key}.glb`;
      const bytes = readFileSync(file);
      vi.stubGlobal("fetch", async () => new Response(new Uint8Array(bytes), { status: 200 }));
      const actor = await createTypedGLBActor({
        asset: { type: "model", format: "glb", url: `https://offline-idol.invalid/${key}.glb` } as never, id: key, name: key, width: 64, height: 64, shareTextures: false,
        imageDecoder: async () => ({ width: 1, height: 1, data: new Uint8Array([128, 128, 128, 255]) })
      } as never);
      vi.unstubAllGlobals();
      expect(actor.animation.clipNames()).toEqual(expect.arrayContaining(["idle", "walk"]));
      const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).readBinary(new Uint8Array(bytes));
      const joints = doc.getRoot().listSkins()[0]!.listJoints();
      // lowest joints = feet / leg tips
      const lowest = joints.map((j, k) => [k, j.getWorldTranslation()[1]] as const).sort((a, b) => a[1] - b[1]).slice(0, 4).map(([k]) => k);
      const palette = (clip: string, t: number) => {
        actor.playClip(clip, t);
        return Float32Array.from(actor.collectRenderItems().find((i) => i.skinning)!.skinning!.matrices as Float32Array);
      };
      const moved = (a: Float32Array, b: Float32Array) => Math.max(...lowest.map((k) => Math.max(...[12, 13, 14].map((c) => Math.abs(a[k * 16 + c]! - b[k * 16 + c]!)))));
      expect(moved(palette("walk", 0.1), palette("walk", 0.45))).toBeGreaterThan(0.005);
      const idleA = palette("idle", 0.2), idleB = palette("idle", 1.1);
      expect(Math.max(...Array.from(idleA, (v, i) => Math.abs(v - idleB[i]!)))).toBeGreaterThan(1e-4);
    }, 60_000);
  }
});
