import { describe, expect, it } from "vitest";
import { installEvidenceChannel, createPerfRing } from "../../../packages/game/src/evidence/channel";

type FakeWin = Record<string, unknown> & {
  __AURA3D_GAME_EVIDENCE__?: Record<string, unknown>;
  __AURA3D_EVIDENCE_OPT_IN__?: boolean;
};

describe("evidence channel (PRD-09 §6.5)", () => {
  it("no section function runs in 600 simulated frames without a read", () => {
    let calls = 0;
    let loads = 0;
    const win: FakeWin = { __AURA3D_EVIDENCE_OPT_IN__: true };
    const ch = installEvidenceChannel({
      id: "a3g-test",
      builtins: {},
      loader: async () => {
        loads += 1;
        return { route: () => { calls += 1; return 42; } };
      },
      win
    });
    for (let i = 0; i < 600; i += 1) {
      // Frames pass; nobody reads the channel.
    }
    expect(calls).toBe(0);
    expect(loads).toBe(0);
    const snap = (win.__AURA3D_GAME_EVIDENCE__?.["a3g-test"]) as { optIn: boolean; sections: { route: number } };
    expect(snap.optIn).toBe(true);
    ch.dispose();
  });

  it("without opt-in the sections object is empty; opt-in exposes lazy getters", async () => {
    const win: FakeWin = {};
    installEvidenceChannel({
      id: "a3g-test",
      builtins: { perf: () => ({ frames: 1 }) },
      win
    });
    const cold = win.__AURA3D_GAME_EVIDENCE__?.["a3g-test"] as { optIn: boolean; sections: object };
    expect(cold.optIn).toBe(false);
    expect(Object.keys(cold.sections)).toHaveLength(0);

    const win2: FakeWin = { __AURA3D_EVIDENCE_OPT_IN__: true };
    installEvidenceChannel({ id: "a3g-test", builtins: { perf: () => ({ frames: 2 }) }, win: win2 });
    const hot = win2.__AURA3D_GAME_EVIDENCE__?.["a3g-test"] as { sections: { perf: { frames: number } } };
    expect(hot.sections.perf.frames).toBe(2);
  });

  it("legacyGlobals aliases resolve to the same object", () => {
    const win: FakeWin = {};
    installEvidenceChannel({ id: "a3g-test", builtins: {}, legacyGlobals: ["__BS_EVIDENCE__"], win });
    expect(win.__BS_EVIDENCE__).toBe(win.__AURA3D_GAME_EVIDENCE__?.["a3g-test"]);
  });

  it("memo serves repeat reads inside 250 ms", () => {
    let built = 0;
    const win: FakeWin = { __AURA3D_EVIDENCE_OPT_IN__: true };
    installEvidenceChannel({
      id: "a3g-test",
      builtins: { tick: () => { built += 1; return built; } },
      win
    });
    const a = win.__AURA3D_GAME_EVIDENCE__?.["a3g-test"] as { sections: { tick: number } };
    const b = win.__AURA3D_GAME_EVIDENCE__?.["a3g-test"] as { sections: { tick: number } };
    expect(a).toBe(b);
    expect(a.sections.tick).toBe(1);
    expect(b.sections.tick).toBe(2); // section getters run per read — memo covers the object only
  });

  it("perf ring reports p50/p95 from recorded frames", () => {
    const ring = createPerfRing(240);
    for (let i = 1; i <= 200; i += 1) ring.record(i);
    const s = ring.summary();
    expect(s.frames).toBe(200);
    expect(s.p50).toBe(101);
    expect(s.p95).toBe(191);
  });
});
