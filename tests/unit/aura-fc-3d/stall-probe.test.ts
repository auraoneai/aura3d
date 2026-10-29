import { describe, expect, it } from "vitest";
import { createSim } from "../../../apps/showcase-aura-fc-3d/src/game/sim";
import type { MatchConfig, UserInputFrame } from "../../../apps/showcase-aura-fc-3d/src/game/types";

const IDLE: UserInputFrame = {
  move: [0, 0], sprint: false, passShort: false, passDriven: false, shootHeld: false, shootReleased: false,
  skillStepover: false, skillChop: false, switchPlayer: false, pause: false
};
const DT = 1 / 60;
const DEMO: MatchConfig = { mode: "quick", venue: "munich", homeClub: "aurora", awayClub: "iron", userTeam: null, difficulty: 0.65, goldenGoal: false, shootoutOnTie: false };

/** Longest stretch of live play (sim clock seconds) in which the ball moves less than 1 m from where it started. */
function longestStall(seed: number | undefined, venue: MatchConfig["venue"] = "munich") {
  const sim = createSim();
  sim.setAutopilot(true);
  sim.startMatch({ ...DEMO, venue, ...(seed === undefined ? {} : { seed }) } as MatchConfig);
  const s = sim.state;
  let anchor = { x: s.ball.x, z: s.ball.z, t: s.clock };
  let worst = { secs: 0, at: 0, x: 0, z: 0, owner: null as string | null, mode: "" };
  for (let i = 0; i < 60 * 200 && s.phase !== "ended"; i++) {
    sim.step(DT, IDLE);
    if (s.phase !== "live") { anchor = { x: s.ball.x, z: s.ball.z, t: s.clock }; continue; }
    if (Math.hypot(s.ball.x - anchor.x, s.ball.z - anchor.z) > 1) { anchor = { x: s.ball.x, z: s.ball.z, t: s.clock }; continue; }
    const secs = s.clock - anchor.t;
    if (secs > worst.secs) worst = { secs: +secs.toFixed(1), at: +anchor.t.toFixed(1), x: +s.ball.x.toFixed(2), z: +s.ball.z.toFixed(2), owner: s.ball.ownerId, mode: s.ball.mode };
  }
  return worst;
}

describe("aura-fc-3d live play never stalls", () => {
  it("over 24 CPU matches the ball never sits still for 12 s of live clock", () => {
    const rows = [];
    for (let i = 0; i < 24; i++) rows.push({ seed: i, ...longestStall(i === 0 ? undefined : (i * 2654435761) >>> 0, i % 6 === 5 ? "favela" : "munich") });
    console.log("FC_STALL", JSON.stringify(rows.filter((r) => r.secs > 6)));
    expect(rows.filter((r) => r.secs > 12)).toEqual([]);
  });
});
