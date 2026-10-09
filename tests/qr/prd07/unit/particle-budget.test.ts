// PRD-07 P1-T3 acceptance — collectParticleBudgetDiagnostics returns the
// pre-existing fields plus { declared, observedLive: null, observedDraws: null };
// the effects diagnostics section fills the observed slots.

import { describe, expect, it } from "vitest";
import { createAuraApp, effects, primitives, scene } from "../../../../packages/engine/src";
import { collectParticleBudgetDiagnostics } from "../../../../packages/engine/src/agent-api/nodes/particles";
import { collectEffectsSection } from "../../../../packages/engine/src/agent-api/vfx/diagnostics";

const particleScene = () =>
  scene().add(
    effects.particles({ name: "fx-fountain", emitter: "fountain", particleCount: 64, emissionRate: 200 })
  );

describe("P1-T3 particle budget diagnostics", () => {
  it("static function returns declared/observed + heuristic/measured fields", () => {
    const nodes = [
      { kind: "effect", effect: "particles", particleCount: 64 },
      { kind: "effect", effect: "particles", particleCount: 2000, texturedBillboard: true }
    ] as never[];
    const d = collectParticleBudgetDiagnostics(nodes);
    expect(d.kind).toBe("aura-particle-budget");
    expect(d.effectCount).toBe(2);
    expect(d.declared).toBe(d.totalParticles);
    expect(d.observedLive).toBeNull();
    expect(d.observedDraws).toBeNull();
    // #101: heuristic estimate renamed; measured field is null without a live frame.
    expect(d.heuristicUpdateCostMs).toBeGreaterThan(0);
    expect(d.measuredUpdateMs).toBeNull();
    expect("gpuReady" in d).toBe(false);
    expect("estimatedUpdateCostMs" in d).toBe(false);
  });

  it("effects section fills observedLive/observedDraws from the live system", () => {
    const app = createAuraApp(null, { autoStart: false, scene: particleScene() });
    for (let i = 0; i < 10; i++) app.step(1 / 60);
    const report = collectEffectsSection(app);
    expect(report.budget.declared).toBeGreaterThanOrEqual(120);
    expect(typeof report.budget.observedLive).toBe("number");
    expect(report.budget.observedLive).toBe(report.liveParticles);
    expect(typeof report.budget.observedDraws).toBe("number");
    app.dispose();
  });

  it("effects section with no system still reports declared", () => {
    const app = createAuraApp(null, { autoStart: false, scene: scene().add(primitives.sphere({ name: "s" })) });
    const report = collectEffectsSection(app);
    expect(report.budget.declared).toBe(0);
    expect(report.budget.observedLive).toBe(0);
    expect(report.budget.observedDraws).toBe(0);
    app.dispose();
  });
});
