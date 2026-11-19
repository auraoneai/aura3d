// AUTOPLAY addendum (owner, 2026-11-18): with `?autoplay=1` the computer plays Pip hands-free. Drives the real sim the
// frame loop runs in autopilot mode (src/game/autopilot.ts -> stepPlayer, boss brain, moving platforms, fall rescue,
// death respawn) and checks every world makes progress, never stands stuck for 5 s, and reaches the Sun-Gate (after
// which main.ts shows the results for AUTOPLAY_RESULTS_SECONDS and loads the next world).
import { describe, expect, it } from "vitest";
import { game } from "@aura3d/engine";
import { AUTOPLAY_RESULTS_SECONDS, autopilotInput, autopilotRescue, createAutopilotMemory } from "../../../apps/showcase-pips-big-leap/src/game/autopilot";
import { createBoss, damageBoss, stepBoss } from "../../../apps/showcase-pips-big-leap/src/game/boss";
import { createPlayer, stepPlayer } from "../../../apps/showcase-pips-big-leap/src/game/player";
import { buildWorld, tickPlatforms } from "../../../apps/showcase-pips-big-leap/src/game/world";
import { worldSpec } from "../../../apps/showcase-pips-big-leap/src/game/worlds";
import { WORLD_IDS } from "../../../apps/showcase-pips-big-leap/src/game/looks";
import type { WorldId } from "../../../apps/showcase-pips-big-leap/src/game/types";

const DT = 1 / 60;

function autoplay(id: WorldId, seconds: number) {
  const built = buildWorld(worldSpec(id));
  const spec = built.spec;
  const p = createPlayer(built);
  const assist = game.jumpAssist({ coyoteMs: built.motion.tuning.coyoteMs, bufferMs: built.motion.tuning.jumpBufferMs });
  const mem = createAutopilotMemory();
  const boss = spec.boss ? createBoss() : null;
  const seeds = new Set<string>();
  let stuckAt = "";
  let clock = 0, deadTimer = 0, minZ = p.z, complete = -1, stuckFor = 0, worstStuck = 0, anchor = [p.x, p.z] as [number, number];
  const doubleJump = !["academy", "w1", "w2"].includes(id);
  for (let f = 0; f < seconds / DT && complete < 0; f += 1) {
    clock += DT;
    let bossAt: [number, number, number] | undefined;
    let bossVulnerable = false;
    if (boss) {
      const frame = stepBoss(boss, [p.x, p.y, p.z], DT);
      bossAt = boss.phase === "down" ? undefined : [frame.pos[0], frame.pos[1], frame.pos[2]];
      bossVulnerable = frame.vulnerable;
    }
    const input = autopilotInput(mem, built, p, { worldClock: clock, seeds, bossAlive: Boolean(boss && boss.hp > 0) }, DT, bossVulnerable, bossAt);
    const events = stepPlayer(p, built, input, DT, { doubleJump, assist, bossVulnerable, bossAt });
    autopilotRescue(built, p);
    for (const e of events) {
      if (e.kind === "seed" && e.id) seeds.add(e.id);
      if (e.kind === "boss-hit" && boss) damageBoss(boss, []);
      if (e.kind === "die") deadTimer = 1.4;
      if (e.kind === "gate" && seeds.size >= spec.gateSeeds && !(boss && boss.hp > 0)) complete = clock;
    }
    if (p.state === "dead" && deadTimer > 0) {
      deadTimer -= DT;
      if (deadTimer <= 0) {
        const cp = p.checkpoint;
        Object.assign(p, { x: cp.x, y: cp.y + 0.05, z: cp.z, vx: 0, vy: 0, vz: 0, hearts: 3, state: "air", grounded: false, invuln: 1.6 });
      }
    }
    tickPlatforms(built, clock, () => null);
    minZ = Math.min(minZ, p.z);
    // Stuck = Pip stays within 0.5 m of one spot (dead time excluded; the boss fight circles so it moves).
    if (Math.hypot(p.x - anchor[0], p.z - anchor[1]) > 0.5 || p.state === "dead") { anchor = [p.x, p.z]; stuckFor = 0; }
    else if (clock > 1.2) { stuckFor += DT; if (stuckFor > worstStuck) { worstStuck = stuckFor; stuckAt = `${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)} ${p.state} g=${p.groundId}`; } }
  }
  return { ids: [...seeds].join(","), stuckAt, complete, seeds: seeds.size, progress: spec.spawn[2] - minZ, worstStuck, gateZ: spec.gate.z };
}

describe("pips-big-leap autoplay", () => {
  it("shows the results card about 3 s before advancing", () => {
    expect(AUTOPLAY_RESULTS_SECONDS).toBeGreaterThanOrEqual(2.5);
    expect(AUTOPLAY_RESULTS_SECONDS).toBeLessThanOrEqual(3.5);
  });

  for (const id of WORLD_IDS) {
    it(`${id}: the autopilot runs, jumps, collects and opens the Sun-Gate without standing stuck`, () => {
      const r = autoplay(id, 150);
      expect(r.seeds, `${id} seeds`).toBeGreaterThan(0);
      expect(r.progress, `${id} progress along the course`).toBeGreaterThan(20);
      expect(r.worstStuck, `${id} longest stall (s) at ${r.stuckAt}`).toBeLessThan(5);
      expect(r.complete, `${id} reached the open Sun-Gate`).toBeGreaterThan(0);
    }, 60_000);
  }
});
