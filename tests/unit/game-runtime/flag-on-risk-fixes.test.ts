/**
 * Flag-on risk-fix regressions (PRD-09 finish brief §"Flag-on code risks").
 * Each test names the risk it locks down. Unit-level only — no DOM/browser.
 */
import { describe, expect, it } from "vitest";

import { stubSetInstanceTransforms, instanceTransformsExtension } from "../../../packages/engine/src/agent-api/nodes/game/instanceTransforms";
import { runTransition, type TransitionDriver } from "../../../packages/game/src/shell/transition";
import { createOverlayDriver } from "../../../packages/game/src/juice/overlay";

// ---------- Risk 1+2: instanceTransforms ----------
function instancedHarness(capacity: number) {
  const instances = Array.from({ length: capacity }, () => ({
    position: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 }
  }));
  const node = { kind: "primitive", runtime: { id: "n1" }, instances, instanceColors: [] as string[] };
  const app = { scene: { nodes: [node] } } as never;
  const handle = { id: "n1", kind: "primitive" } as never;
  return { app, handle, node };
}

describe("stubSetInstanceTransforms capacity (risk 2)", () => {
  it("keeps capacity after a small count — a later larger count does not throw", () => {
    const { app, handle, node } = instancedHarness(3);
    const m = new Float32Array(48).fill(0).map((_, i) => (i % 16 < 12 && i % 16 % 4 === 0 ? 1 : 0));
    expect(() => stubSetInstanceTransforms(handle, app, m, 1)).not.toThrow();
    expect(node.instances.length).toBe(3); // capacity preserved
    expect(() => stubSetInstanceTransforms(handle, app, m, 3)).not.toThrow();
  });
  it("zero-scales hidden slots so they render nothing", () => {
    const { app, handle, node } = instancedHarness(2);
    const m = new Float32Array(32).fill(0).map((_, i) => (i % 16 < 12 && i % 16 % 4 === 0 ? 1 : 0));
    stubSetInstanceTransforms(handle, app, m, 1);
    const hidden = node.instances[1] as { scale: { x: number } };
    expect(hidden.scale.x).toBe(0);
  });
});

describe("qrFlagsOf guard (risk 1)", () => {
  it("extension create() does not throw when app is undefined (pre-configure)", () => {
    const handle = { id: "n1", kind: "primitive" } as never;
    expect(() => instanceTransformsExtension.create(handle, undefined as never)).not.toThrow();
  });
});

// ---------- Risk 3: GameSession double advance ----------
describe("GameSession.tick (risk 3)", () => {
  it("scales dt without calling controller.advance — the driver advances once", { timeout: 20000 }, async () => {
    const { GameSessionImpl } = await import("../../../packages/game/src/session/GameSession");
    let advanceCalls = 0;
    const controller = { scale: 0.5, advance: () => ((advanceCalls += 1), 0) } as never;
    const session = new GameSessionImpl({ seed: 1, time: controller } as never);
    expect(session.tick(0.4)).toBeCloseTo(0.2);
    expect(advanceCalls).toBe(0);
  });
});

// ---------- Risk 4: transition firstPresentedFrame timeout ----------
describe("runTransition presented-frame timeout (risk 4)", () => {
  it("rejects loudly and releases the overlay when no frame presents", async () => {
    const overlays: Array<[number, number]> = [];
    const driver: TransitionDriver = {
      setOverlay: (o, ms) => overlays.push([o, ms]),
      firstPresentedFrame: () => new Promise(() => {}), // never resolves
      sleep: (ms) => new Promise((r) => setTimeout(r, Math.min(ms, 30)))
    };
    await expect(runTransition(driver, () => "done")).rejects.toThrow(/A3D_TRANSITION_NO_PRESENTED_FRAME/);
    expect(overlays.at(-1)?.[0]).toBe(0); // overlay released, not left opaque
  });
});

// ---------- Risk 5: overlay fade auto-release ----------
describe("overlay fade auto-release (risk 5)", () => {
  it("held fade releases to an empty {} overlay after the ramp deadline", async () => {
    let t = 0;
    const overlays: unknown[] = [];
    const queue: Array<() => void> = [];
    const drv = createOverlayDriver({
      now: () => t,
      schedule: (cb) => (queue.push(cb), () => {}),
      app: { setOutputOverlay: (o: unknown) => (overlays.push(o), { applied: true }) } as never
    });
    const p = drv.fade(0.5, 100, "#000000");
    expect(overlays.at(-1)).toMatchObject({ fade: expect.any(Array) });
    // The pump re-schedules itself while active; drain a bounded count per
    // tick — once the deadline write fires, decayed stops it and the queue
    // drains to empty.
    for (t = 0.02; t <= 0.5; t += 0.02) {
      for (let i = 0; i < 20 && queue.length; i++) queue.shift()!();
      drv.tick();
    }
    await p;
    expect(overlays.at(-1)).toEqual({}); // fade channel empty
  });
});

// ---------- Risk 6: GameAudio degrade on synth cue ----------
describe("GameAudio cue validation (risk 6)", () => {
  it("does not throw on an asset-less play-less cue under A3D_QR_GAME", async () => {
    const { createGameAudio } = await import("../../../packages/engine/src/game/GameAudio");
    expect(() =>
      createGameAudio({
        cues: { pot: { /* synth: neither asset nor play */ } as never },
        qualityRebuild: { flags: ["A3D_QR_GAME"] },
        browserContext: false
      })
    ).not.toThrow();
  });
});

// ---------- Risk 7: legacyGlobals setter ----------
describe("legacyGlobals setter (risk 7)", () => {
  it("assignment to a legacy global does not throw in strict mode", async () => {
    const { installEvidenceChannel } = await import("../../../packages/game/src/evidence/channel");
    const win = {} as Record<string, unknown>;
    installEvidenceChannel({ win, id: "route", builtins: {}, legacyGlobals: ["__ROUTE_EVIDENCE__"] } as never);
    expect(() => { "use strict"; win.__ROUTE_EVIDENCE__ = { x: 1 }; }).not.toThrow();
  });
});
