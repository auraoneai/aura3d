/** Measures solid-scenery impacts in Strange Orbit's zero-G flight and writes evidence/strange-orbit-port/rework/impacts.json. */
import { mkdirSync, writeFileSync } from "node:fs";
import { GATES } from "../../examples/strange-orbit-port/course";
import { dressingPlan, staticColliders, type Collider } from "../../examples/strange-orbit-port/obstacles";
import { STEP, createRace, startCountdown, stepRace, type RaceEvent } from "../../examples/strange-orbit-port/race";
import { mainFrame, routeFrame } from "../../examples/strange-orbit-port/track";
import { Vec3 } from "../../examples/strange-orbit-port/vec3";

const RIDER = 0.8;
const drifting = () => {
  const e = createRace();
  startCountdown(e);
  while (e.phase === "countdown") stepRace(e, {}, STEP);
  e.lane = 40;
  stepRace(e, { pedal: true }, STEP);
  return e;
};
const gap = (p: Vec3, c: Collider): number => {
  const ab = c.b.clone().sub(c.a);
  const len2 = ab.lengthSq();
  const t = len2 < 1e-12 ? 0 : Math.max(0, Math.min(1, p.clone().sub(c.a).dot(ab) / len2));
  return p.distanceTo(c.a.clone().addScaledVector(ab, t)) - (c.radius + RIDER);
};
const mid = (c: Collider) => c.a.clone().add(c.b).multiplyScalar(0.5);

function fly(c: Collider, dir: Vec3, speed: number) {
  const e = drifting();
  const f = e.flight!;
  f.position.copy(mid(c)).addScaledVector(dir, -(c.radius + 8));
  f.velocity.copy(dir).multiplyScalar(speed);
  f.forward.copy(dir);
  f.age = 1;
  e.hitCooldown = 0;
  let minGap = Infinity, events = 0, outSpeed = 0;
  let first: RaceEvent | undefined;
  for (let i = 0; i < 80 && e.flight; i++) {
    stepRace(e, {}, STEP);
    if (!e.flight) break;
    minGap = Math.min(minGap, gap(e.flight.position, c));
    const hit = e.events.filter((x) => x.impact !== undefined);
    events += hit.length;
    first ??= hit[0];
    outSpeed = e.flight.velocity.length();
  }
  return { speed, impacts: e.impacts, events, hits: e.hits, minGap: +minGap.toFixed(3), reboundSpeed: +outSpeed.toFixed(2), approachSpeedReported: first?.impact ? +first.impact.toFixed(2) : null, energy: e.energy };
}

const colliders = staticColliders();
const plan = dressingPlan();
const f1 = mainFrame(GATES[1]!.s);
const dressDir = (kind: string) => {
  const d = plan.find((x) => x.kind === kind)!;
  return mainFrame(d.s).side.clone().multiplyScalar(-Math.sign(d.lateral)).normalize();
};
const targets: Array<[string, Collider, Vec3]> = [
  ["gate pillar", colliders.find((c) => c.id === "gate-1-pillar-1")!, f1.side.clone().negate()],
  ["gate lintel", colliders.find((c) => c.id === "gate-1-lintel")!, f1.up.clone().negate()],
  ["rock spire", colliders.find((c) => c.label === "rock spire")!, dressDir("spire")],
  ["boulder", colliders.find((c) => c.label === "moon boulder")!, dressDir("boulder")],
  ["lander", colliders.find((c) => c.label === "lander")!, dressDir("lander")],
  ["observatory", colliders.find((c) => c.label === "observatory")!, dressDir("observatory")]
];
const rows = targets.flatMap(([name, c, dir]) => [15, 35, 60].map((speed) => ({ surface: name, ...fly(c, dir.clone().normalize(), speed) })));

const underside = [15, 35, 60].map((speed) => {
  const e = drifting();
  const f = e.flight!;
  const frame = routeFrame(300, "main");
  f.position.copy(frame.p).addScaledVector(frame.up, -6);
  f.velocity.copy(frame.up).multiplyScalar(speed);
  f.age = 1;
  e.hitCooldown = 0;
  let maxAbove = -Infinity;
  for (let i = 0; i < 60 && e.flight; i++) {
    stepRace(e, {}, STEP);
    if (!e.flight) break;
    const here = routeFrame(300, "main");
    maxAbove = Math.max(maxAbove, e.flight.position.clone().sub(here.p).dot(here.up));
  }
  return { surface: "track underside", speed, impacts: e.impacts, maxHeightAboveStrip: +maxAbove.toFixed(3), passedThrough: maxAbove >= 0 };
});

mkdirSync("evidence/strange-orbit-port/rework", { recursive: true });
writeFileSync("evidence/strange-orbit-port/rework/impacts.json", JSON.stringify({ rows, underside, colliders: colliders.length }, null, 2) + "\n");
console.log(JSON.stringify({ rows: rows.length, allOneImpact: rows.every((r) => r.impacts === 1 && r.events === 1), noPassThrough: rows.every((r) => r.minGap > -0.03 * 5), underside }, null, 1));
