/**
 * Aura3D 5.7.0+ parent-local nested handles: the rigged Idol Bellkeeper (`hero-idol`) nests directly under the moving
 * `hero` group alongside `hero-staff`, taking parent-local `[0, lift, 0]` so body, staff and kite move in lockstep.
 */
import { describe, expect, it } from "vitest";
import { scene } from "@aura3d/engine";
import { applyIdolBellkeeperMotion, applyIdolBellkeeperPose, idolBellkeeperBodyWorld, syncIdolBellkeeperBody } from "../../../examples/where-the-wind-wanders-port/art/idolModels";
import { mountProceduralAnimatedActors, sampleBellkeeperRigPose } from "../../../examples/where-the-wind-wanders-port/art/proceduralModels";
import { createBellkeeperMotion } from "../../../examples/where-the-wind-wanders-port/art/idolMotion";
import { START, createState, stepFrame } from "../../../examples/where-the-wind-wanders-port/sim";
import { terrainHeight } from "../../../examples/where-the-wind-wanders-port/terrain";

interface N { kind?: string; name?: string; children?: N[]; nodes?: N[] }

describe("Bellkeeper body follows the player", () => {
  it("the rigged hero-idol is nested under the moving hero group using 5.7.0 parent-local coordinates", () => {
    const b = scene();
    mountProceduralAnimatedActors(b as never, { letter: false, wisp: false, boat: false, hero: true }, 0, false, false);
    const root = b.toJSON() as unknown as N;
    const top = root.nodes ?? root.children ?? [];
    expect(top.map((n) => n.name)).not.toContain("hero-idol");
    expect(top.map((n) => n.name)).toContain("hero");
    const heroGroup = top.find((n) => n.name === "hero")!;
    const names: string[] = [];
    const walk = (n: N): void => { names.push(n.name ?? ""); for (const c of n.children ?? n.nodes ?? []) walk(c); };
    walk(heroGroup);
    expect(names).toContain("hero-idol");
    expect(names).toContain("hero-staff");
  });

  it("every frame of a walk hero-idol stays parent-local under hero while resolved world coordinates track the player", () => {
    const pos = new Map<string, [number, number, number]>();
    const handle = (id: string) => ({
      setPosition: (x: number, y: number, z: number) => { pos.set(id, [x, y, z]); return undefined; },
      setRotation: () => undefined,
      setAnimationPose: () => undefined
    });
    const handles = new Map(["hero-idol", "hero-staff", "hero-staff-chime", "hero-staff-ribbon"].map((id) => [id, handle(id)]));
    const get = (id: string) => handles.get(id);
    const s = createState();
    const motion = createBellkeeperMotion();
    const idle = sampleBellkeeperRigPose({ gait: "Idle", phaseSeconds: 0 });
    let metres = 0;
    for (let f = 0; f < 240; f++) {
      const before = { ...s.pos };
      stepFrame(s, { keys: f < 120 ? "A" : "AS", act: null });
      metres += Math.hypot(s.pos.x - before.x, s.pos.z - before.z);
      const y = terrainHeight(s.pos.x, s.pos.z);
      syncIdolBellkeeperBody(get, [s.pos.x, y, s.pos.z], [0, 0.3, 0]);
      if (f % 2) applyIdolBellkeeperPose(get, sampleBellkeeperRigPose({ gait: "Walk", phaseSeconds: f / 60 }));
      else applyIdolBellkeeperMotion(get, motion.frame({ gait: "Walk", metres, dt: 1 / 60, hopPhase: "idle", ring: 0, lookYaw: 0, lookPitch: 0, onBoat: false }), idle, idle);
      const local = pos.get("hero-idol")!;
      expect(local[0], `frame ${f} local x`).toBe(0);
      expect(local[2], `frame ${f} local z`).toBe(0);
      expect(Math.abs(local[1]), `frame ${f} local lift`).toBeLessThan(0.3);
      const world = idolBellkeeperBodyWorld();
      expect(Math.hypot(world.position[0] - s.pos.x, world.position[2] - s.pos.z), `frame ${f}`).toBeLessThan(1e-6);
      expect(Math.abs(world.position[1] - y), `frame ${f}`).toBeLessThan(0.3);
      expect(Math.hypot(world.position[0], world.position[2]), "not at the world origin").toBeGreaterThan(1);
      expect(world.placed).toBe(true);
    }
    expect(Math.hypot(s.pos.x - START.x, s.pos.z - START.z)).toBeGreaterThan(3);
  });
});
