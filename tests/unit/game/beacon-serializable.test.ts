import { describe, expect, it } from "vitest";
import { installGameBeacon } from "../../../packages/game/src/evidence/beacon";

describe("game beacon serialization", () => {
  it("serializes with a circular app and keeps the live handles reachable", () => {
    const app: { scene: unknown; post?: unknown } = { scene: { nodes: 3 } };
    app.post = { app };
    const win: { __AURA3D_GAME__?: any } = {};
    const b = installGameBeacon({
      route: "/x",
      getState: () => "playing" as never,
      getFrame: () => 7,
      getFirstFrameAt: () => 1,
      getApp: () => app as never,
      getSession: () => ({ id: "s" }),
      win
    });
    const beacon = win.__AURA3D_GAME__!;
    expect(() => JSON.stringify(beacon)).not.toThrow();
    expect(Object.keys(JSON.parse(JSON.stringify(beacon))).sort()).toEqual(["firstFrameAt", "frame", "route", "sessionStartedAt", "state"]);
    expect(beacon.app).toBe(app);
    expect(beacon.scene).toBe(app.scene);
    expect(beacon.session).toEqual({ id: "s" });
    expect(Object.isFrozen(beacon)).toBe(true);
    b.dispose();
  });
});

describe("game beacon evidence publishing", () => {
  it("merges route evidence over the beacon fields, keeps getters lazy, and fills the aliases", () => {
    const win: Record<string, any> = {};
    const b = installGameBeacon({ route: "/r", evidenceGlobals: ["__AURA3D_GAME_EVIDENCE__", "__gameEvidence"], win });
    let reads = 0;
    const evidence = { state: "aiming", score: 3, get heavy() { reads += 1; return { n: reads }; } };
    b.publishEvidence(evidence);
    const beacon = win.__AURA3D_GAME__;
    expect(beacon.route).toBe("/r");
    expect(beacon.state).toBe("aiming");
    expect(beacon.score).toBe(3);
    expect(reads).toBe(0);
    expect(beacon.heavy.n).toBe(1);
    expect(win.__AURA3D_GAME_EVIDENCE__).toBe(evidence);
    expect(win.__gameEvidence).toBe(evidence);
    expect(Object.isFrozen(beacon)).toBe(true);
    const next = { score: 4 };
    b.publishEvidence(next);
    expect(win.__AURA3D_GAME__.score).toBe(4);
    expect(win.__AURA3D_GAME__.state).toBe("playing");
    b.dispose();
  });

  it("keeps the app handle hidden unless the evidence owns that key", () => {
    const app = { scene: { nodes: 1 } };
    const win: Record<string, any> = {};
    const b = installGameBeacon({ route: "/r", getApp: () => app as never, win });
    b.publishEvidence({ score: 1 });
    expect(win.__AURA3D_GAME__.app).toBe(app);
    expect(Object.keys(win.__AURA3D_GAME__)).not.toContain("app");
    b.publishEvidence({ app: "mine" });
    expect(win.__AURA3D_GAME__.app).toBe("mine");
    b.dispose();
  });
});
