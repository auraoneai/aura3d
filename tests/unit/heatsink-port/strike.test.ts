import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CFG } from "../../../examples/heatsink-port/config";
import { Operation, STRIKE, segmentSphere, segmentVerticalCapsule } from "../../../examples/heatsink-port/operation";
import { FRAME, Race } from "../../../examples/heatsink-port/race";
import { Track } from "../../../examples/heatsink-port/track";
import { IDLE, type Input } from "../../../examples/heatsink-port/vehicle";
import { expandSegments, parseInputScript } from "../../../tools/crayon-capture/heatsink-lib";

const reference = JSON.parse(readFileSync("evidence/crayon-capture/heatsink-reference.json", "utf8")) as { script: { text: string } };
const SCRIPT = expandSegments(parseInputScript(reference.script.text));
const SUB = 1 / 120;
const FIRE: Input = { ...IDLE, fire: true };
/*
 * Pinned strike outcome of the reference movement with the gun held. Re-pinned for the audit fixes HP-02 (barrels hit
 * as a capsule up to bolt height: 4 to 9 barrels shot) and HP-11 (distance-aware chain window: best chain 3 to 7).
 * The previous pin was score 2950, barrels 4, hits 33, bestChain 3, hash e1d8bccd.
 */
const SCORE_PIN = 6350, BARRELS_PIN = 9, HITS_PIN = 38, CHAIN_PIN = 7, HASH_PIN = "914c9b7d";

/** put the player `back` metres behind `target` on its lane, heading straight down the track, in the race state */
function aim(race: Race, target: { s: number; x: number; world: { y: number } }, back = 30): void {
  const p = race.player;
  race.state = "race";
  p.crashed = false;
  p.finished = false;
  p.gunCd = 0;
  p.gunHeat = 0;
  p.gunLocked = false;
  p.theta = 0;
  p.s = race.track.wrap(target.s - back);
  p.x = target.x;
  Object.assign(p.position, race.track.toWorld(p.s, p.x, target.world.y));
}

const shoot = (race: Race, substeps: number): void => {
  for (let i = 0; i < substeps; i++) {
    race.player.gunCd -= SUB;
    race.ops.advance(SUB, FIRE, race);
  }
};

describe("target placement", () => {
  const track = new Track();
  const ops = new Operation(track);

  it("lays out the configured number of sentries and heavies, deterministically", () => {
    expect(ops.targets).toHaveLength(STRIKE.perLap);
    expect(ops.targets.filter((t) => t.kind === "heavy")).toHaveLength(STRIKE.perLap / 4);
    const again = new Operation(new Track());
    expect(again.targets.map((t) => [t.s, t.x])).toEqual(ops.targets.map((t) => [t.s, t.x]));
  });

  it("keeps every target over the road and spaced along the whole lap", () => {
    for (const t of ops.targets) expect(Math.abs(t.x)).toBeLessThan((track.frame(t.s).hw as number) * 0.56);
    const sorted = ops.targets.map((t) => t.s).sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) expect(sorted[i]! - sorted[i - 1]!).toBeGreaterThan(track.length / STRIKE.perLap / 3);
  });
});

describe("segmentSphere", () => {
  it("hits a sphere on the segment and misses one off it or beyond its end", () => {
    expect(segmentSphere(0, 0, 0, 10, 0, 0, 5, 0.5, 0, 1)).toBeCloseTo(0.5, 5);
    expect(segmentSphere(0, 0, 0, 10, 0, 0, 5, 3, 0, 1)).toBe(-1);
    expect(segmentSphere(0, 0, 0, 10, 0, 0, 20, 0, 0, 1)).toBe(-1);
  });
});

describe("segmentVerticalCapsule", () => {
  it("hits anywhere along the capsule height and misses above it or to the side", () => {
    expect(segmentVerticalCapsule(0, 5.3, 0, 10, 5.3, 0, 5, 0, 6, 0, 1)).toBeCloseTo(0.5, 5);
    expect(segmentVerticalCapsule(0, 0.5, 0, 10, 0.5, 0, 5, 0, 6, 0, 1)).toBeCloseTo(0.5, 5);
    expect(segmentVerticalCapsule(0, 7.5, 0, 10, 7.5, 0, 5, 0, 6, 0, 1)).toBe(-1);
    expect(segmentVerticalCapsule(0, 3, 0, 10, 3, 0, 5, 0, 6, 2, 1)).toBe(-1);
  });
});

describe("the strike layer never changes the recorded movement", () => {
  it("replays the reference script identically with the gun held down", () => {
    const quiet = new Race();
    const loud = new Race();
    for (let i = 0; i < SCRIPT.length; i++) {
      const input = SCRIPT[i] as Input;
      quiet.frame(FRAME, { ...input, fire: false });
      loud.frame(FRAME, { ...input, fire: true });
      if (i % 250 === 0 || i === SCRIPT.length - 1) {
        for (const k of ["s", "x", "dist", "v", "ab", "heat", "shield", "theta", "phi", "yW", "vyW", "steerVal", "crashT", "burstT"] as const) {
          expect(loud.player[k], `${k} at step ${i}`).toBe(quiet.player[k]);
        }
        expect(loud.raceTime).toBe(quiet.raceTime);
        expect(loud.lapIdx).toBe(quiet.lapIdx);
      }
    }
    expect(loud.ops.shots).toBeGreaterThan(0);
    expect(quiet.ops.shots).toBe(0);
  });
});

describe("strike replay (reference movement, gun held down)", () => {
  const run = (): Race => {
    const race = new Race();
    for (const input of SCRIPT) race.frame(FRAME, { ...(input as Input), fire: true });
    return race;
  };

  it("is deterministic and matches the recorded outcome", () => {
    const a = run();
    const b = run();
    expect(a.ops.hash()).toBe(b.ops.hash());
    expect(a.ops.score).toBe(b.ops.score);
    expect({ score: a.ops.score, kills: a.ops.kills, barrels: a.ops.barrelsShot, shots: a.ops.shots, hits: a.ops.hits, bestChain: a.ops.bestChain, hash: a.ops.hash() }).toEqual({
      score: SCORE_PIN, kills: 6, barrels: BARRELS_PIN, shots: 872, hits: HITS_PIN, bestChain: CHAIN_PIN, hash: HASH_PIN
    });
  });

  it("does not earn a medal by holding the trigger alone", () => {
    const race = run();
    expect(race.ops.medalFor(race.ops.kills)).toBe("none");
  });
});

describe("combat rules", () => {
  it("needs three bolts to down a sentry and scores its base value", () => {
    const race = new Race();
    const t = race.ops.targets.find((x) => x.kind === "sentry")!;
    aim(race, t);
    shoot(race, 240);
    expect(t.alive).toBe(false);
    expect(race.ops.kills).toBe(1);
    expect(race.player.takedowns).toBe(1);
    expect(race.ops.score).toBe(STRIKE.score.sentry);
    expect(race.ops.hits).toBeGreaterThanOrEqual(STRIKE.hp.sentry);
  });

  it("takes twice the damage to down a heavy and pays more", () => {
    const race = new Race();
    for (const b of race.barrels) b.alive = false;
    const t = race.ops.targets.find((x) => x.kind === "heavy")!;
    aim(race, t);
    shoot(race, 40);
    expect(t.alive).toBe(true);
    expect(t.hp).toBeLessThan(t.maxHp);
    aim(race, t);
    shoot(race, 400);
    expect(t.alive).toBe(false);
    expect(race.ops.score).toBe(STRIKE.score.heavy);
  });

  it("raises the multiplier on quick consecutive kills and drops it when the window closes", () => {
    const race = new Race();
    const [a, b] = race.ops.targets.filter((x) => x.kind === "sentry");
    aim(race, a!);
    shoot(race, 240);
    expect(race.ops.multiplier).toBe(1);
    aim(race, b!);
    shoot(race, 240);
    expect(race.ops.chain).toBe(2);
    expect(race.ops.multiplier).toBe(2);
    expect(race.ops.score).toBe(STRIKE.score.sentry + STRIKE.score.sentry * 2);
    expect(race.ops.chainT).toBeGreaterThanOrEqual(STRIKE.comboWindow);
    for (let i = 0; i < STRIKE.comboWindowMax * 120 + 5; i++) race.ops.advance(SUB, IDLE, race);
    expect(race.ops.chain).toBe(0);
    expect(race.ops.multiplier).toBe(1);
  });

  it("a crash resets the chain and spoils the clean-lap bonus", () => {
    const race = new Race();
    const t = race.ops.targets[0]!;
    aim(race, t);
    shoot(race, 240);
    expect(race.ops.chain).toBe(1);
    race.events.push({ step: race.frames, type: "crash", detail: "TEST" });
    race.ops.advance(SUB, IDLE, race);
    expect(race.ops.chain).toBe(0);
    const before = race.ops.score;
    race.events.push({ step: race.frames, type: "lap", detail: 1 });
    race.ops.advance(SUB, IDLE, race);
    expect(race.ops.score).toBe(before);
  });

  it("a clean lap pays its bonus and revives every target for the next lap", () => {
    const race = new Race();
    race.state = "race";
    race.ops.targets[0]!.alive = false;
    race.events.push({ step: race.frames, type: "lap", detail: 1 });
    race.ops.advance(SUB, IDLE, race);
    expect(race.ops.score).toBe(STRIKE.score.cleanLap);
    expect(race.ops.targets.every((x) => x.alive)).toBe(true);
  });

  it("the chain window stretches to reach the next target at the current speed (HP-11)", () => {
    const race = new Race();
    for (const b of race.barrels) b.alive = false;
    const sorted = race.ops.targets.slice().sort((a, b) => a.s - b.s);
    const [a, b] = sorted as [typeof sorted[number], typeof sorted[number]];
    aim(race, a);
    race.player.v = CFG.vehicle.maxSpeed;
    shoot(race, 240);
    expect(a.alive).toBe(false);
    const gap = b.s - race.player.s;
    expect(gap).toBeGreaterThan(300);
    const travel = gap / CFG.vehicle.maxSpeed;
    expect(travel).toBeGreaterThan(STRIKE.comboWindow);
    /* the window covers the trip to the next target at top speed, which the old fixed 3 s window did not */
    expect(race.ops.chainWindow()).toBeGreaterThan(travel);
    expect(race.ops.chainWindow()).toBeLessThanOrEqual(STRIKE.comboWindowMax);
    expect(race.ops.chain).toBe(1);
  });

  it("a bolt fired from the real hover height hits a barrel on the drone's line (HP-02)", () => {
    for (const index of [0, 3, 7]) {
      const race = new Race();
      const barrel = race.barrels[index]!;
      for (const t of race.ops.targets) t.alive = false;
      const p = race.player;
      race.state = "race";
      p.crashed = false;
      p.theta = 0;
      p.s = race.track.wrap(barrel.s - 40);
      p.x = barrel.x;
      const ground = race.track.frame(p.s).y + race.track.latY(p.s, p.x);
      Object.assign(p.position, race.track.toWorld(p.s, p.x, ground + CFG.vehicle.hover));
      p.gunCd = 0;
      shoot(race, 30);
      expect(barrel.alive, `barrel ${index}`).toBe(false);
      expect(race.ops.barrelsShot).toBeGreaterThanOrEqual(1);
    }
  });

  it("a shot barrel explodes, scores, and damages the targets around it", () => {
    const race = new Race();
    const barrel = race.barrels[0]!;
    const w = race.track.toWorld(barrel.s, barrel.x, barrel.y + 1.1);
    const t = race.ops.targets.find((x) => x.kind === "sentry")!;
    t.world.x = w.x;
    t.world.y = w.y + 8;
    t.world.z = w.z;
    const p = race.player;
    race.state = "race";
    p.crashed = false;
    p.theta = 0;
    p.s = race.track.wrap(barrel.s - 15);
    p.x = barrel.x;
    Object.assign(p.position, race.track.toWorld(p.s, p.x, barrel.y + 1.1));
    p.gunCd = 0;
    shoot(race, 12);
    expect(barrel.alive).toBe(false);
    expect(barrel.respawn).toBeGreaterThan(0);
    expect(race.ops.barrelsShot).toBe(1);
    expect(t.alive).toBe(false);
    expect(race.ops.score).toBeGreaterThanOrEqual(STRIKE.score.barrel + STRIKE.score.sentry);
  });

  it("overheats the gun and refuses to fire while it is locked out", () => {
    const race = new Race();
    aim(race, race.ops.targets[0]!, 200);
    let locked = false;
    for (let i = 0; i < 120 * 12 && !locked; i++) {
      race.player.gunCd -= SUB;
      race.ops.advance(SUB, FIRE, race);
      locked = race.player.gunLocked;
    }
    expect(locked).toBe(true);
    expect(race.player.gunHeat).toBe(1);
    const shots = race.ops.shots;
    shoot(race, 60);
    expect(race.ops.shots).toBe(shots);
  });
});

describe("medals", () => {
  it("maps kills to the three thresholds, with gold also inside the gold time", () => {
    const ops = new Operation(new Track());
    expect(ops.medalFor(STRIKE.medals.bronze - 1)).toBe("none");
    expect(ops.medalFor(STRIKE.medals.bronze)).toBe("bronze");
    expect(ops.medalFor(STRIKE.medals.silver)).toBe("silver");
    expect(ops.medalFor(STRIKE.medals.gold)).toBe("gold");
    expect(ops.medalFor(STRIKE.medals.gold, STRIKE.goldTime)).toBe("gold");
    expect(ops.medalFor(STRIKE.perLap * CFG.track.laps, STRIKE.goldTime + 1)).toBe("silver");
    expect(STRIKE.medals.gold).toBeLessThanOrEqual(STRIKE.perLap * CFG.track.laps);
  });

  it("awards the medal once, only when the race is finished", () => {
    const race = new Race();
    race.ops.kills = STRIKE.medals.silver;
    race.ops.advance(SUB, IDLE, race);
    expect(race.ops.medal).toBe("none");
    race.state = "finished";
    race.ops.advance(SUB, IDLE, race);
    expect(race.ops.medal).toBe("silver");
    expect(race.ops.events.filter((e) => e.type === "medal")).toHaveLength(1);
    race.ops.advance(SUB, IDLE, race);
    expect(race.ops.events.filter((e) => e.type === "medal")).toHaveLength(1);
  });

  it("a dnf earns no medal", () => {
    const race = new Race();
    race.ops.kills = STRIKE.medals.gold;
    race.state = "dnf";
    race.ops.advance(SUB, IDLE, race);
    expect(race.ops.medal).toBe("none");
  });
});

describe("restart", () => {
  it("startRace clears score, kills, targets, bolts and events", () => {
    const race = new Race();
    aim(race, race.ops.targets[0]!);
    shoot(race, 240);
    expect(race.ops.kills).toBeGreaterThan(0);
    race.startRace();
    expect(race.ops.score).toBe(0);
    expect(race.ops.kills).toBe(0);
    expect(race.ops.events).toHaveLength(0);
    expect(race.ops.targets.every((x) => x.alive && x.hp === x.maxHp)).toBe(true);
    expect(race.ops.bolts.every((b) => !b.alive)).toBe(true);
  });
});
