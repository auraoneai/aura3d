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
