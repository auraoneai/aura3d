import { describe, expect, it } from "vitest";
import { Collider, RigidBody, Shape } from "@aura3d/physics/solverless";
import {
  CAMERA_PROBE_TIER_BUDGETS,
  createCameraProbe,
  type ProbeBoundsEntry,
  type ProbePhysicsEntry
} from "../../../packages/engine/src/agent-api/camera/Probe.js";
import { probeForSubject } from "../../../packages/engine/src/agent-api/camera/rigs/rigUtils.js";

const from = [0, 0, 0] as const;
const to = [0, 0, 10] as const;

function sphere(id: number, z: number, owner?: object, node?: string): ProbePhysicsEntry {
  const body = new RigidBody(id, { type: "static", position: [0, 0, z] });
  return { collider: new Collider(id, body.id, { shape: Shape.sphere(0.5) }), body, owner, id: node };
}

function fixture(tier: keyof typeof CAMERA_PROBE_TIER_BUDGETS = "high") {
  const subject = {};
  const other = {};
  let colliders: ProbePhysicsEntry[] = [
    sphere(1, 2, subject, "hero"),
    sphere(2, 5, other, "physics-wall")
  ];
  let bounds: Array<ProbeBoundsEntry & { readonly owner?: object }> = [
    { id: "hero", min: [-0.5, -0.5, 1.5], max: [0.5, 0.5, 2.5], owner: subject },
    { id: "static-wall", min: [-2, -2, 2.9], max: [2, 2, 3.1] }
  ];
  const probe = createCameraProbe({
    budget: () => CAMERA_PROBE_TIER_BUDGETS[tier],
    colliders: () => colliders,
    bounds: () => bounds,
    targetFilter: (ref) => ref === "hero" ? {
      bounds: (entry) => (entry as { readonly owner?: object }).owner === subject,
      colliders: (entry) => entry.owner !== undefined ? entry.owner === subject : entry.id === "hero"
    } : undefined
  });
  return {
    probe,
    scoped: probeForSubject(probe, "hero"),
    subject,
    other,
    setColliders: (next: ProbePhysicsEntry[]) => { colliders = next; },
    setBounds: (next: typeof bounds) => { bounds = next; }
  };
}

describe("subject-scoped camera probes", () => {
  it("selects the closest external static or physics hit after excluding only the subject", () => {
    const f = fixture();
    f.probe.beginFrame();
    expect(f.probe.sphereCast(from, to, 0.2)).toMatchObject({ hit: true, node: "hero", distance: 1.3 });
    const hit = f.scoped.sphereCast(from, to, 0.2);
    expect(hit).toMatchObject({ hit: true, node: "static-wall" });
    expect(hit.distance).toBeCloseTo(2.7, 8); // static wall is nearer than the physics wall

    f.setBounds([]);
    f.probe.beginFrame();
    const physics = f.scoped.sphereCast(from, to, 0.2);
    expect(physics).toMatchObject({ hit: true, node: "physics-wall" });
    expect(physics.distance).toBeCloseTo(4.3, 8);
  });

  it("does not guess that anonymous or differently owned colliders are the subject", () => {
    const f = fixture();
    f.setBounds([]);
    f.setColliders([sphere(1, 2, f.subject, "hero"), sphere(2, 3), sphere(3, 5, f.other, "hero")]);
    f.probe.beginFrame();
    const anonymous = f.scoped.sphereCast(from, to, 0.2);
    expect(anonymous).toMatchObject({ hit: true, distance: 2.3 });
    expect(anonymous.node).toBeUndefined();

    f.setColliders([sphere(1, 2, f.subject, "hero"), sphere(3, 5, f.other, "hero")]);
    f.probe.beginFrame();
    const differentOwner = f.scoped.sphereCast(from, to, 0.2);
    expect(differentOwner).toMatchObject({ hit: true, node: "hero" });
    expect(differentOwner.distance).toBeCloseTo(4.3, 8);

    f.setColliders([sphere(4, 0, f.other, "enclosing-physics-wall")]);
    f.probe.beginFrame();
    expect(f.scoped.sphereCast(from, to, 0.2)).toMatchObject({ hit: true, node: "enclosing-physics-wall", distance: 0 });
  });

  it("fails rather than silently excluding geometry when a target cannot be mapped", () => {
    const f = fixture();
    f.probe.beginFrame();
    expect(() => probeForSubject(f.probe, "not-mapped").sphereCast(from, to, 0.2))
      .toThrow(/target could not be mapped/);
  });

  it.each(["low", "medium", "high", "ultra"] as const)(
    "shares the %s tier budget between target-scoped and ordinary queries",
    (tier) => {
      const f = fixture(tier);
      const budget = CAMERA_PROBE_TIER_BUDGETS[tier];
      f.probe.beginFrame();
      expect(f.scoped.sphereCast(from, to, 0.2).node).toBe("static-wall");
      const occluders = f.scoped.occluders(from, to);
      expect(occluders).toEqual(budget.fade ? ["static-wall"] : []);
      for (let i = 0; i < 5; i += 1) f.probe.sphereCast(from, to, 0.2);
      const stats = f.probe.stats();
      expect(stats.sphereCasts).toBe(budget.sphereCasts);
      expect(stats.occluderQueries).toBe(tier === "ultra" ? 1 : 0);
      expect(stats.deniedOccluderQueries).toBe(tier === "low" ? 1 : 0);
      expect(stats.deniedCasts).toBeGreaterThan(0);
      f.probe.beginFrame();
      expect(f.probe.stats()).toEqual({ sphereCasts: 0, occluderQueries: 0, deniedCasts: 0, deniedOccluderQueries: 0 });
      expect(f.scoped.sphereCast(from, to, 0.2).node).toBe("static-wall");
    }
  );
});
