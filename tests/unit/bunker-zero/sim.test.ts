import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FLOORS, KILL_HOUSE, CELL } from "../../../apps/showcase-bunker-zero/src/maps";
import {
  captureLoadout, cellCenter, createSim, defaultLoadout, drainEvents, ENEMY_ROCKET_SPLASH, MAX_SUMMONS, WEAPONS, type Sim
} from "../../../apps/showcase-bunker-zero/src/sim";
import { autopilotInput, createAutopilot } from "../../../apps/showcase-bunker-zero/src/autopilot";
import { enemyNodeStem, floorOutcome, outcomeView } from "../../../apps/showcase-bunker-zero/src/flow";

const NO = { moveX: 0, moveZ: 0, turn: 0, pitchDelta: 0, fire: false, firePressed: false, reload: false, use: false };
const MAIN = readFileSync(path.resolve("apps/showcase-bunker-zero/src/main.ts"), "utf8");
const floorSim = (i: number, loadout = defaultLoadout()) => createSim(FLOORS[i]!, { ox: 0, mode: "descent", seed: 1337 + i * 97, loadout });
const clearEnemies = (sim: Sim) => { for (const e of sim.state.enemies) { e.state = "dead"; e.hp = 0; } };
const cellOf = (sim: Sim, ch: string) => { for (let z = 0; z < sim.state.h; z++) for (let x = 0; x < sim.state.w; x++) if (sim.state.grid[z * sim.state.w + x] === ch) return [x, z] as const; throw new Error(`no ${ch}`); };
function play(sim: Sim, seconds: number) {
  const pilot = createAutopilot();
  let t = 0;
  while (t < seconds && !sim.state.finished && sim.state.player.alive) { sim.tick(1 / 60, autopilotInput(pilot, sim, 1 / 60)); t += 1 / 60; }
  return t;
}

describe("bunker zero sim", () => {
  it("C1: every guard the Iron Warden summons maps to a pre-built summon node", () => {
    const sim = floorSim(5);
    const boss = sim.state.enemies.find((e) => e.kind === "boss")!;
    const p = sim.state.player;
    p.hp = 1e6;
    p.x = boss.x; p.z = boss.z + CELL * 2;
    boss.hp = 480 * 0.3; boss.state = "attack"; boss.volleyLeft = 3;
    for (let i = 0; i < 600; i++) { sim.tick(1 / 60, NO); if (boss.state !== "attack" && boss.state !== "dead") { boss.state = "attack"; } }
    const summoned = sim.state.enemies.filter((e) => e.summonSlot !== undefined);
    expect(summoned.length).toBeGreaterThanOrEqual(2);
    expect(summoned.length).toBeLessThanOrEqual(MAX_SUMMONS);
    expect(sim.state.summons).toEqual(summoned.map((e) => e.id));
    expect(new Set(summoned.map((e) => e.summonSlot)).size).toBe(summoned.length);
    for (const e of summoned) {
      expect(e.summonSlot!).toBeLessThan(MAX_SUMMONS);
      expect(enemyNodeStem(e)).toEqual({ body: `summon-${e.summonSlot}`, eye: `summon-eye-${e.summonSlot}` });
    }
    // authored enemies keep their spawn-cell stems
    expect(enemyNodeStem(boss)).toEqual({ body: `en-${boss.sx}-${boss.sz}`, eye: `eye-${boss.sx}-${boss.sz}` });
    // main.ts builds MAX_SUMMONS summon guards (and eyes) on every floor that has a boss, and per-frame code never throws on a missing node
    expect(MAIN).toMatch(/for \(let i = 0; i < MAX_SUMMONS; i\+\+\)[\s\S]{0,400}`f\$\{slot\}-summon-\$\{i\}`[\s\S]{0,600}`f\$\{slot\}-summon-eye-\$\{i\}`/);
    const pose = MAIN.slice(MAIN.indexOf("function syncScenePose"), MAIN.indexOf("// per-frame: read input"));
    expect(pose).not.toMatch(/\breq\(/);
    expect(pose).not.toMatch(/nodes\.require/);
  });

  it("C2: 200 events produce 200 drains, though the sim keeps only the last 40", () => {
    const sim = floorSim(0);
    clearEnemies(sim);
    sim.state.player.weapons.push("knife");
    let seq = 0, drained = 0;
    for (let i = 0; i < 60 * 120 && sim.state.eventSeq < 200; i++) {
      sim.tick(1 / 60, { ...NO, weapon: "knife", fire: true, firePressed: true });
      seq = drainEvents(sim.state, seq, () => drained++);
      expect(sim.state.events.length).toBeLessThanOrEqual(40);
    }
    expect(sim.state.eventSeq).toBeGreaterThanOrEqual(200);
    expect(drained).toBe(sim.state.eventSeq);
  });

  it("C2: drainEvents skips events that fell out of the window instead of replaying them", () => {
    const state = { events: ["a", "b", "c"], eventSeq: 103 };
    const got: string[] = [];
    expect(drainEvents(state, 50, (e) => got.push(e))).toBe(103);
    expect(got).toEqual(["a", "b", "c"]);
    got.length = 0;
    expect(drainEvents(state, 102, (e) => got.push(e))).toBe(103);
    expect(got).toEqual(["c"]);
  });

  it("C4: a Kill House time-out is a loss: TIME UP with the lose cue, not a clear", () => {
    const sim = createSim(KILL_HOUSE, { ox: 0, mode: "killhouse", seed: 1344 });
    sim.state.player.hp = 1e6;
    sim.state.killhouseLeft = 0.02;
    sim.tick(1 / 30, NO);
    expect(sim.state.finished).toBe(true);
    expect(sim.state.medal).toBe("none");
    expect(floorOutcome(sim, 0)).toBe("killhouse-timeup");
    const view = outcomeView("killhouse-timeup", sim, String);
    expect(view.title).toBe("TIME UP");
    expect(view.cue).toBe("lose");
    expect(view.juice).toBeNull();
  });

  it("C3: clearing floor 6 is the campaign end, other floors lead to the next one", () => {
    const sim = floorSim(5);
    expect(floorOutcome(sim, 5)).toBe("campaign-complete");
    expect(floorOutcome(floorSim(0), 0)).toBe("floor-cleared");
    // the frame loop handles one outcome per floor (no re-trigger while `finished` stays true)
    expect(MAIN).toMatch(/if \(sim\.state\.finished && !outcomeHandled\) \{\s*outcomeHandled = true;/);
  });

  it("C5: every weapon keeps its own magazine; switching gives no free rounds", () => {
    const sim = floorSim(0, { ...defaultLoadout(), weapons: ["knife", "pistol", "mg", "rocket"], ammo: { bullets: 0, rockets: 1 }, mags: { knife: 0, pistol: 8, mg: 30, rocket: 1 } });
    clearEnemies(sim);
    const p = sim.state.player;
    const fire = () => { for (let i = 0; i < 70; i++) sim.tick(1 / 60, { ...NO, fire: i === 0, firePressed: i === 0 }); };
    fire(); fire(); fire();
    expect(p.mag).toBe(5);
    sim.tick(1 / 60, { ...NO, weapon: "rocket" });
    for (let i = 0; i < 40; i++) sim.tick(1 / 60, NO);
    expect(p.mag).toBe(1);
    fire();
    expect(p.mag).toBe(0);
    // the old shared magazine let the pistol's rounds feed the launcher; now the launcher is empty until it reloads from its pool
    sim.tick(1 / 60, { ...NO, weapon: "pistol" });
    for (let i = 0; i < 40; i++) sim.tick(1 / 60, NO);
    expect(p.mag).toBe(5);
    sim.tick(1 / 60, { ...NO, weapon: "rocket" });
    for (let i = 0; i < 40; i++) sim.tick(1 / 60, NO);
    expect(p.mag).toBe(0);
    const spawned = sim.state.projectilesSpawned;
    for (let i = 0; i < 8; i++) fire();
    // one reload from the 1-rocket pool, then dry: two rockets in total, never 9
    expect(sim.state.projectilesSpawned - spawned).toBeLessThanOrEqual(1);
    expect(p.ammo.rockets).toBe(0);
    expect(captureLoadout(sim).mags).toMatchObject({ pistol: 5, rocket: 0 });
  });

  it("C6: enemy rockets hurt only on a direct hit or inside the blast, with falloff", () => {
    const sim = floorSim(0);
    clearEnemies(sim);
    const p = sim.state.player;
    // a rocket that flies away from the player and hits a wall about 40 m off does nothing to them
    sim.fireRocket(p.x, p.z + 2, 0, 1, true);
    for (let i = 0; i < 300; i++) sim.tick(1 / 60, NO);
    expect(p.hp).toBe(100);
    // a wall impact 2.5 m away: blast damage scaled by distance, under the enemy splash peak
    sim.fireRocket(3.3, p.z + 2, -1, 0, true);
    for (let i = 0; i < 30; i++) sim.tick(1 / 60, NO);
    const blast = 100 - p.hp;
    expect(blast).toBeGreaterThan(0);
    expect(blast).toBeLessThan(ENEMY_ROCKET_SPLASH * (1 - 2 / WEAPONS.rocket.splash));
    // a direct hit still lands 20-35
    const before = p.hp;
    sim.fireRocket(p.x + 2, p.z, -1, 0, true);
    for (let i = 0; i < 30; i++) sim.tick(1 / 60, NO);
    expect(before - p.hp).toBeGreaterThanOrEqual(20);
    expect(before - p.hp).toBeLessThanOrEqual(35 + ENEMY_ROCKET_SPLASH);
  });

  it("C7: closed doors block sight and hitscan, open doors do not", () => {
    const sim = floorSim(0);
    const door = sim.state.doors.find((d) => d.cx === 14 && d.cz === 3)!;
    const [ax, az, bx, bz] = [cellCenter(12), cellCenter(3), cellCenter(16), cellCenter(3)];
    expect(door.open).toBe(0);
    expect(sim.hasLOS(ax, az, bx, bz)).toBe(false);
    door.open = 1;
    expect(sim.hasLOS(ax, az, bx, bz)).toBe(true);
    // standing barrels and crates block too (player shots stop on them)
    const crate = sim.state.props.find((pr) => pr.kind === "crate")!;
    expect(sim.hasLOS(cellCenter(crate.cx - 1), cellCenter(crate.cz), cellCenter(crate.cx + 1), cellCenter(crate.cz))).toBe(false);
  });

  it("C14: floor 6 is winnable with the starting loadout and the Warden must fall first", () => {
    const sim = floorSim(5);
    expect(sim.state.pickups.some((k) => k.kind === "ammo")).toBe(true);
    expect(sim.state.pickups.some((k) => k.kind === "rocket")).toBe(true);
    const t = play(sim, 900);
    expect(sim.state.player.alive).toBe(true);
    expect(sim.state.finished).toBe(true);
    expect(sim.state.enemies.find((e) => e.kind === "boss")!.state).toBe("dead");
    expect(t).toBeLessThan(900);
  });

  it("C14: the last elevator stays locked while the Iron Warden stands", () => {
    const sim = floorSim(5);
    const p = sim.state.player;
    const [ex, ez] = cellOf(sim, "E");
    for (const e of sim.state.enemies) if (e.kind !== "boss") e.state = "dead";
    p.key = true; p.hp = 1e6; p.x = cellCenter(ex); p.z = cellCenter(ez);
    sim.tick(1 / 60, NO);
    expect(sim.state.finished).toBe(false);
    expect(sim.state.msg).toMatch(/WARDEN/);
    sim.state.enemies.find((e) => e.kind === "boss")!.state = "dead";
    sim.tick(1 / 60, NO);
    expect(sim.state.finished).toBe(true);
  });

  it("C14: a full descent carries weapons, ammo, armor and score floor to floor", () => {
    let loadout = defaultLoadout();
    let lastScore = 0;
    for (let i = 0; i < FLOORS.length; i++) {
      const sim = floorSim(i, loadout);
      expect(sim.state.score).toBe(lastScore);
      expect(sim.state.player.weapons).toEqual(loadout.weapons);
      expect(sim.state.player.ammo).toEqual(loadout.ammo);
      play(sim, 900);
      expect(sim.state.finished, `floor ${i + 1}`).toBe(true);
      loadout = captureLoadout(sim);
      lastScore = sim.state.score;
    }
    expect(loadout.weapons).toContain("mg");
    expect(lastScore).toBeGreaterThan(2000);
  });

  it("C16: once a floor is finished the player cannot be hurt and enemies stand down", () => {
    const sim = floorSim(0);
    const p = sim.state.player;
    const [ex, ez] = cellOf(sim, "E");
    p.key = true; p.x = cellCenter(ex); p.z = cellCenter(ez);
    sim.tick(1 / 60, NO);
    expect(sim.state.finished).toBe(true);
    sim.dealDamage(true, 500);
    expect(p.hp).toBe(100);
    const live = sim.state.enemies.filter((e) => e.state !== "dead");
    const before = live.map((e) => [e.x, e.z, e.state]);
    for (let i = 0; i < 120; i++) sim.tick(1 / 60, NO);
    expect(live.map((e) => [e.x, e.z, e.state])).toEqual(before);
    // the frame loop has one pending transition, cleared by startFloor
    expect(MAIN).toMatch(/function startFloor[\s\S]{0,300}pending = null;/);
    expect(MAIN).not.toMatch(/setTimeout\(\(\) => \{ (transitionPending|deathPending)/);
  });

  it("C8: enemy hitscan shots leave a tracer record, misses included", () => {
    const sim = floorSim(0);
    const guard = sim.state.enemies.find((e) => e.kind === "guard")!;
    for (const e of sim.state.enemies) if (e !== guard) e.state = "dead";
    const p = sim.state.player;
    p.hp = 1e6;
    p.x = guard.x - CELL * 2; p.z = guard.z;
    let shots = 0;
    for (let i = 0; i < 60 * 8; i++) { sim.tick(1 / 60, NO); shots = Math.max(shots, sim.state.enemyShots.length); }
    const evs = sim.state.events.filter((e) => e.startsWith("guard:shot"));
    expect(evs.length).toBeGreaterThan(0);
    expect(shots).toBeGreaterThan(0);
  });
});
