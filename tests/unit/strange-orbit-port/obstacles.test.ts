import { describe, expect, it } from "vitest";
import { GATES, COURSE_LENGTH } from "../../../examples/strange-orbit-port/course";
import { dressingPlan, lehmer, staticColliders, type Collider } from "../../../examples/strange-orbit-port/obstacles";
import { STEP, createRace, startCountdown, stepRace, type RaceEvent, type RaceState } from "../../../examples/strange-orbit-port/race";
import { mainFrame, routeFrame } from "../../../examples/strange-orbit-port/track";
import { Vec3 } from "../../../examples/strange-orbit-port/vec3";

const RIDER = 0.8;
const SPEEDS = [15, 35, 60];

function racing(): RaceState {
  const e = createRace();
  startCountdown(e);
  while (e.phase === "countdown") stepRace(e, {}, STEP);
  return e;
}

/** Push a racing rider off the edge so the sim creates a real drift flight, then return it. */
function drifting(): RaceState {
  const e = racing();
  e.lane = 40;
  stepRace(e, { pedal: true }, STEP);
  expect(e.flight?.mode).toBe("drift");
  return e;
}

function distanceToSegment(p: Vec3, c: Collider): number {
  const ab = c.b.clone().sub(c.a);
  const len2 = ab.lengthSq();
  const t = len2 < 1e-12 ? 0 : Math.max(0, Math.min(1, p.clone().sub(c.a).dot(ab) / len2));
  return p.distanceTo(c.a.clone().addScaledVector(ab, t));
}

function midpoint(c: Collider): Vec3 {
  return c.a.clone().add(c.b).multiplyScalar(0.5);
}

/** Fly a drifting rider straight at `target` along `dirIn` from 8 m away; return what happened. */
function flyAt(c: Collider, target: Vec3, dirIn: Vec3, speed: number) {
  const e = drifting();
  const f = e.flight!;
  f.position.copy(target).addScaledVector(dirIn, -(c.radius + 8));
  f.velocity.copy(dirIn).multiplyScalar(speed);
  f.forward.copy(dirIn);
  f.age = 1;
  e.hitCooldown = 0;
  const hitsBefore = e.hits;
  const impactsBefore = e.impacts;
  let minGap = Infinity;
  let events = 0;
  let first: RaceEvent | undefined;
  for (let i = 0; i < 80 && e.flight; i++) {
    stepRace(e, {}, STEP);
    if (!e.flight) break;
    minGap = Math.min(minGap, distanceToSegment(e.flight.position, c) - (c.radius + RIDER));
    const hitEvents = e.events.filter((ev) => ev.type === "hit" && ev.impact !== undefined);
    events += hitEvents.length;
    first ??= hitEvents[0];
  }
  return { e, f: e.flight, minGap, events, first, hits: e.hits - hitsBefore, impacts: e.impacts - impactsBefore, dirIn };
}

describe("dressing plan", () => {
  it("keeps the placement the meshes always had (same random sequence)", () => {
    const rand = lehmer(48271);
    const plan = dressingPlan();
    for (let k = 0; k < 14; k++) {
      const s = 40 + k * (COURSE_LENGTH - 80) / 14 + rand() * 40;
      const lateral = (k % 2 === 0 ? 1 : -1) * (13.5 + rand() * 9);
      const size = k % 3 === 1 ? 6 + rand() * 4 : 2.6 + rand() * 2.4;
      const spin = rand() * 6.28;
      const tilt = (rand() - 0.5) * 0.5;
      const d = plan[k]!;
      expect([d.s, d.lateral, d.size, d.spin, d.tilt]).toEqual([s, lateral, size, spin, tilt]);
      expect(d.kind).toBe(k % 3 === 1 ? "spire" : "boulder");
    }
    expect(plan.slice(14).map((d) => d.kind)).toEqual(["lander", "observatory", "observatory"]);
  });
});

describe("static colliders", () => {
  it("covers every gate pillar and lintel and every dressing piece with sane capsules", () => {
    const colliders = staticColliders();
    expect(colliders).toHaveLength(GATES.length * 3 + dressingPlan().length);
    for (const c of colliders) {
      expect(c.radius).toBeGreaterThan(0.3);
      for (const v of [c.a, c.b]) expect(Number.isFinite(v.x + v.y + v.z)).toBe(true);
    }
    expect(colliders.filter((c) => c.label === "gate pillar")).toHaveLength(GATES.length * 2);
    expect(colliders.filter((c) => c.label === "gate lintel")).toHaveLength(GATES.length);
  });

  it("puts each gate pillar where the rendered pylon stands (11.1 m either side of the centreline)", () => {
    const f = mainFrame(GATES[0]!.s);
    const pillars = staticColliders().filter((c) => c.id.startsWith("gate-0-pillar"));
    expect(pillars).toHaveLength(2);
    for (const c of pillars) {
      const lateral = Math.abs(c.a.clone().sub(f.p).dot(f.side));
      expect(lateral).toBeCloseTo(11.1, 5);
    }
  });
});

describe("flying into solid scenery", () => {
  const pillar = staticColliders().find((c) => c.id === "gate-1-pillar-1")!;
  const f1 = mainFrame(GATES[1]!.s);
  const lintel = staticColliders().find((c) => c.id === "gate-1-lintel")!;
  const spire = staticColliders().find((c) => c.label === "rock spire")!;
  const observatory = staticColliders().find((c) => c.label === "observatory")!;

  const cases: Array<[string, Collider, Vec3, Vec3]> = [
    ["gate pillar", pillar, midpoint(pillar), f1.side.clone().negate()],
    ["gate lintel", lintel, midpoint(lintel), f1.up.clone().negate()],
    ["rock spire", spire, midpoint(spire), mainFrame(dressingPlan().find((d) => d.kind === "spire")!.s).side.clone().multiplyScalar(-Math.sign(dressingPlan().find((d) => d.kind === "spire")!.lateral))],
    ["observatory", observatory, midpoint(observatory), mainFrame(dressingPlan().find((d) => d.kind === "observatory")!.s).side.clone().multiplyScalar(-Math.sign(dressingPlan().find((d) => d.kind === "observatory")!.lateral))]
  ];

  for (const [name, collider, target, dir] of cases) {
    for (const speed of SPEEDS) {
      it(`${name} at ${speed} m/s: stops the rider, bounces back, one impact, no pass-through`, () => {
        const r = flyAt(collider, target, dir.clone().normalize(), speed);
        expect(r.impacts).toBe(1);
        expect(r.events).toBe(1);
        expect(r.hits).toBe(1);
        // the sphere chain stands in for the capsule; its surface dips under 0.021 radius between spheres
        expect(r.minGap).toBeGreaterThan(-(0.025 * collider.radius + 0.03));
        expect(r.f!.velocity.dot(dir)).toBeLessThan(0);
        expect(r.f!.velocity.length()).toBeLessThan(speed);
      });
    }
  }

  it("a grazing touch below the impact threshold bounces without a penalty", () => {
    const e = drifting();
    const f = e.flight!;
    const dir = f1.side.clone().negate();
    f.position.copy(midpoint(pillar)).addScaledVector(dir, -(pillar.radius + RIDER + 0.4));
    f.velocity.copy(dir).multiplyScalar(1.5);
    f.age = 1;
    e.hitCooldown = 0;
    const hits = e.hits;
    for (let i = 0; i < 40; i++) stepRace(e, {}, STEP);
    expect(e.hits).toBe(hits);
    expect(e.impacts).toBe(0);
  });

  it("reports the surface, point, normal and approach speed so the game can shake the camera and play the hit", () => {
    const dir = f1.side.clone().negate().normalize();
    const r = flyAt(pillar, midpoint(pillar), dir, 35);
    const ev = r.first!;
    expect(ev.colliderId).toMatch(/^gate-1-pillar-1#\d+$/);
    expect(ev.text).toContain("gate pillar");
    expect(ev.impact).toBeGreaterThan(30);
    expect(ev.impact).toBeLessThanOrEqual(35.001);
    const n = new Vec3(...ev.normal!);
    expect(n.length()).toBeCloseTo(1, 6);
    expect(n.dot(dir)).toBeLessThan(0);
    expect(ev.point!.every(Number.isFinite)).toBe(true);
  });

  it("is deterministic: the same flight twice gives the same trace", () => {
    const run = () => {
      const r = flyAt(pillar, midpoint(pillar), f1.side.clone().negate().normalize(), 35);
      return [r.f!.position.x, r.f!.position.y, r.f!.position.z, r.f!.velocity.x, r.f!.velocity.y, r.f!.velocity.z, r.e.hits, r.e.impacts, r.e.energy].map((n) => n.toFixed(9)).join(",");
    };
    expect(run()).toBe(run());
  });
});

describe("flying up into the underside of the track", () => {
  for (const speed of SPEEDS) {
    it(`bounces off the main strip from below at ${speed} m/s instead of passing through`, () => {
      const e = drifting();
      const f = e.flight!;
      const frame = routeFrame(300, "main");
      f.position.copy(frame.p).addScaledVector(frame.up, -6);
      f.velocity.copy(frame.up).multiplyScalar(speed);
      f.forward.copy(frame.tangent);
      f.age = 1;
      e.hitCooldown = 0;
      const impacts = e.impacts;
      let maxAbove = -Infinity;
      for (let i = 0; i < 60 && e.flight; i++) {
        stepRace(e, {}, STEP);
        if (!e.flight) break;
        const here = routeFrame(300, "main");
        maxAbove = Math.max(maxAbove, e.flight.position.clone().sub(here.p).dot(here.up));
      }
      expect(e.impacts - impacts).toBeGreaterThanOrEqual(1);
      expect(maxAbove).toBeLessThan(0);
      expect(e.flight?.velocity.dot(frame.up) ?? -1).toBeLessThan(0);
    });
  }

  it("does not block a rider launched from the top of the track", () => {
    const e = drifting();
    const f = e.flight!;
    const frame = routeFrame(300, "main");
    f.position.copy(frame.p).addScaledVector(frame.up, 1.5);
    f.velocity.copy(frame.up).multiplyScalar(20);
    f.age = 1;
    e.hitCooldown = 0;
    const impacts = e.impacts;
    for (let i = 0; i < 20; i++) stepRace(e, {}, STEP);
    expect(e.impacts).toBe(impacts);
  });
});
