import { describe, expect, it } from "vitest";
import { createSim } from "../../../apps/showcase-aura-fc-3d/src/game/sim";
const IDLE = { move: [0, 0], sprint: false, passShort: false, passDriven: false, shootHeld: false, shootReleased: false, skillStepover: false, skillChop: false, switchPlayer: false, pause: false } as any;
describe("CPU match: passes are ground passes that reach their target", () => {
  it("median pass apex stays near the grass and most passes reach the intended receiver", () => {
    let total = 0, ok = 0, goals = 0, shots = 0; const maxH: number[] = [];
    for (const seed of [1, 2]) {
      const sim = createSim();
      sim.setAutopilot(true);
      sim.startMatch({ mode: "quick", venue: "favela", homeClub: "aurora", awayClub: "kings", userTeam: null, difficulty: 0.7, goldenGoal: false, shootoutOnTie: false, seed } as any);
      let pending: { id: string; team: number; t: number } | null = null; let apex = 0;
      for (let i = 0; i < 60 * 240; i++) {
        const ev = sim.step(1 / 60, IDLE);
        const b = sim.state.ball;
        apex = Math.max(apex, b.y);
        for (const e of ev) {
          if (e.type === "pass") { pending = { id: (b as any).intendedTargetId ?? "", team: (e as any).team, t: sim.state.simT }; apex = 0; }
          if (e.type === "shot") shots++;
          if (e.type === "goal") goals++;
        }
        if (pending && b.ownerId) {
          total++; if (b.ownerId === pending.id) ok++; maxH.push(apex); pending = null;
        } else if (pending && sim.state.simT - pending.t > 6) { total++; maxH.push(apex); pending = null; }
      }
    }
    maxH.sort((a, b) => a - b);
    const rate = ok / Math.max(1, total);
    console.log("PASS_PROBE", JSON.stringify({ total, completedToTarget: ok, rate: +(ok / Math.max(1, total)).toFixed(2), medianApex: +maxH[maxH.length >> 1].toFixed(2), p90Apex: +maxH[Math.floor(maxH.length * 0.9)].toFixed(2), shots, goals }));
    expect(total).toBeGreaterThanOrEqual(60);
    expect(maxH[maxH.length >> 1]!).toBeLessThan(0.5);   // was 1.28 m: every pass was a 20-28 degree lob
    expect(rate).toBeGreaterThanOrEqual(0.7);
  });
});
