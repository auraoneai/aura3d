// Dev diagnostics: a runtime effect that outlives its design is reported, and a normal one-shot preset never trips them.

import { describe, expect, it } from "vitest";
import { createAuraApp, scene } from "../../../../packages/engine/src";
import { prd07SystemFor } from "../../../../packages/engine/src/agent-api/vfx/effects-api";

function mount() {
  const app = createAuraApp(null, { autoStart: false, scene: scene(), qualityRebuild: { flags: ["vfx"] } });
  return { app, system: prd07SystemFor(app)! };
}
function step(app: ReturnType<typeof createAuraApp>, seconds: number) {
  for (let t = 0; t < seconds; t += 1 / 60) app.step(1 / 60);
}
const codes = (system: NonNullable<ReturnType<typeof prd07SystemFor>>) => system.diagnostics.report().errors.map((e) => e.code);

describe("lingering particle guard", () => {
  it("one-shot presets and game effects never trip the guard", () => {
    const { app, system } = mount();
    for (const kind of ["spark", "dust", "ring", "aura-burst", "streak", "impact-flash"] as const) {
      app.effects!.burst(kind, [0, 1, 0], { count: 40 });
      app.effects!.spawn(kind, [1, 1, 0], { color: "#ffd76a" });
    }
    step(app, 8);
    expect(codes(system)).not.toContain("VFX_LINGERING_PARTICLES");
    expect(codes(system)).not.toContain("VFX_UNSTOPPED_EMITTER");
    app.dispose();
  });

  it("a looping spec nobody stopped is reported once as an unstopped emitter", () => {
    const { app, system } = mount();
    app.effects!.spawn({ name: "spark", layers: [] } as never, [0, 1, 0], {});
    step(app, 4);
    expect(codes(system)).not.toContain("VFX_UNSTOPPED_EMITTER");
    step(app, 3);
    expect(codes(system).filter((c) => c === "VFX_UNSTOPPED_EMITTER")).toHaveLength(1);
    app.dispose();
  });

  it("more than 24 transient particles alive 3 s after the last spawn are reported", () => {
    const { app, system } = mount();
    app.effects!.spawn({ name: "dust", layers: [] } as never, [0, 1, 0], {}); // looping dust: lives past the last spawn
    step(app, 5);
    expect(codes(system)).toContain("VFX_LINGERING_PARTICLES");
    app.dispose();
  });
});
