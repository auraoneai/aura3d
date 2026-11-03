import { afterEach, describe, expect, it, vi } from "vitest";
import { installGameBeacon } from "../../../packages/game/src/evidence/beacon";
import { installEvidenceChannel } from "../../../packages/game/src/evidence/channel";

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

describe("game beacon ownership", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("does not let an older refresh replace the newer game and restores its latest state", () => {
    const win: Record<string, any> = {};
    let state: "playing" | "paused" = "playing";
    const first = installGameBeacon({ route: "/first", getState: () => state, win });
    const second = installGameBeacon({ route: "/second", win });
    const current = win.__AURA3D_GAME__;

    state = "paused";
    first.refresh();
    expect(win.__AURA3D_GAME__).toBe(current);
    expect(win.__AURA3D_GAME__.route).toBe("/second");

    second.dispose();
    expect(win.__AURA3D_GAME__).toMatchObject({ route: "/first", state: "paused" });
    first.dispose();
    expect(Object.hasOwn(win, "__AURA3D_GAME__")).toBe(false);
  });

  it("keeps evidence ownership ordered by installation even when an older game publishes late", () => {
    const win: Record<string, any> = {};
    const first = installGameBeacon({ route: "/first", evidenceGlobals: ["__SHARED__"], win });
    const second = installGameBeacon({ route: "/second", evidenceGlobals: ["__SHARED__"], win });
    expect(Object.hasOwn(win, "__SHARED__")).toBe(false);
    const newerEvidence = { score: 20 };
    const olderEvidence = { score: 10 };
    second.publishEvidence(newerEvidence);
    const current = win.__AURA3D_GAME__;

    first.publishEvidence(olderEvidence);
    expect(win.__AURA3D_GAME__).toBe(current);
    expect(win.__SHARED__).toBe(newerEvidence);

    second.dispose();
    expect(win.__AURA3D_GAME__).toMatchObject({ route: "/first", score: 10 });
    expect(win.__SHARED__).toBe(olderEvidence);
    first.dispose();
    expect(Object.hasOwn(win, "__AURA3D_GAME__")).toBe(false);
    expect(Object.hasOwn(win, "__SHARED__")).toBe(false);
  });

  it("keeps distinct owners separate even when they publish the same evidence object", () => {
    const win: Record<string, any> = {};
    const first = installGameBeacon({ route: "/first", evidenceGlobals: ["__SHARED__"], win });
    const second = installGameBeacon({ route: "/second", evidenceGlobals: ["__SHARED__"], win });
    const sharedEvidence = { score: 1 };
    first.publishEvidence(sharedEvidence);
    second.publishEvidence(sharedEvidence);
    const newer = win.__AURA3D_GAME__;

    first.publishEvidence({ score: 2 });
    expect(win.__AURA3D_GAME__).toBe(newer);
    expect(win.__SHARED__).toBe(sharedEvidence);
    second.dispose();
    expect(win.__AURA3D_GAME__).toMatchObject({ route: "/first", score: 2 });
    expect(win.__SHARED__).toEqual({ score: 2 });
    first.dispose();
  });

  it("isolates separate window objects and does not treat the beacon key as an evidence alias", () => {
    const firstWindow: Record<string, any> = {};
    const secondWindow: Record<string, any> = {};
    const first = installGameBeacon({
      route: "/first", evidenceGlobals: ["__AURA3D_GAME__"], win: firstWindow
    });
    const second = installGameBeacon({ route: "/second", win: secondWindow });
    const other = secondWindow.__AURA3D_GAME__;
    first.publishEvidence({ score: 4 });
    first.refresh();
    expect(firstWindow.__AURA3D_GAME__).toMatchObject({ route: "/first", score: 4 });
    expect(secondWindow.__AURA3D_GAME__).toBe(other);
    first.dispose();
    expect(Object.hasOwn(firstWindow, "__AURA3D_GAME__")).toBe(false);
    expect(secondWindow.__AURA3D_GAME__).toBe(other);
    second.dispose();
    expect(Object.hasOwn(secondWindow, "__AURA3D_GAME__")).toBe(false);
  });

  it("restores only live owners in every disposal order", () => {
    const orders = [
      [0, 1, 2], [0, 2, 1], [1, 0, 2],
      [1, 2, 0], [2, 0, 1], [2, 1, 0]
    ];
    for (const order of orders) {
      const win: Record<string, any> = {};
      const handles = [0, 1, 2].map((index) => {
        const handle = installGameBeacon({ route: `/${index}`, evidenceGlobals: ["__SHARED__"], win });
        handle.publishEvidence({ index });
        return handle;
      });
      const active = new Set([0, 1, 2]);
      for (const index of order) {
        handles[index]!.dispose();
        handles[index]!.dispose();
        active.delete(index);
        const latest = [...active].at(-1);
        if (latest === undefined) {
          expect(Object.hasOwn(win, "__AURA3D_GAME__"), `beacon after ${order}`).toBe(false);
          expect(Object.hasOwn(win, "__SHARED__"), `alias after ${order}`).toBe(false);
        } else {
          expect(win.__AURA3D_GAME__, `beacon after ${order}`).toMatchObject({ route: `/${latest}`, index: latest });
          expect(win.__SHARED__, `alias after ${order}`).toEqual({ index: latest });
        }
      }
    }
  });

  it("keeps timer updates owner-scoped and makes post-disposal methods inert", () => {
    vi.useFakeTimers();
    const win: Record<string, any> = {};
    let frame = 0;
    const readState = vi.fn(() => "playing" as const);
    const readFrame = vi.fn(() => frame);
    const first = installGameBeacon({ route: "/first", getState: readState, getFrame: readFrame, win });
    const second = installGameBeacon({ route: "/second", win });
    const current = win.__AURA3D_GAME__;

    frame = 7;
    vi.advanceTimersByTime(250);
    expect(win.__AURA3D_GAME__).toBe(current);
    second.dispose();
    expect(win.__AURA3D_GAME__).toMatchObject({ route: "/first", frame: 7 });
    first.dispose();
    expect(vi.getTimerCount()).toBe(0);
    const stateReads = readState.mock.calls.length;
    const frameReads = readFrame.mock.calls.length;
    first.refresh();
    first.publishEvidence({ score: 1 });
    vi.advanceTimersByTime(500);
    expect(readState).toHaveBeenCalledTimes(stateReads);
    expect(readFrame).toHaveBeenCalledTimes(frameReads);
    expect(Object.hasOwn(win, "__AURA3D_GAME__")).toBe(false);
  });

  it("does not continue reading game state when a state callback disposes the handle", () => {
    vi.useFakeTimers();
    const win: Record<string, any> = {};
    let armed = false;
    let handle: ReturnType<typeof installGameBeacon>;
    const readState = vi.fn(() => {
      if (armed) handle.dispose();
      return "playing" as const;
    });
    const readFrame = vi.fn(() => 1);
    const readFirstFrameAt = vi.fn(() => null);
    handle = installGameBeacon({ route: "/game", getState: readState, getFrame: readFrame, getFirstFrameAt: readFirstFrameAt, win });
    armed = true;
    handle.publishEvidence({ score: 1 });
    expect(readFrame).not.toHaveBeenCalled();
    expect(readFirstFrameAt).not.toHaveBeenCalled();
    expect(Object.hasOwn(win, "__AURA3D_GAME__")).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cleans up when an external evidence setter disposes and throws during publication", () => {
    vi.useFakeTimers();
    const win: Record<string, any> = {};
    let handle: ReturnType<typeof installGameBeacon>;
    Object.defineProperty(win, "__TRIGGER__", {
      configurable: true,
      set: () => {
        handle.dispose();
        throw new Error("setter failed");
      }
    });
    const descriptor = Object.getOwnPropertyDescriptor(win, "__TRIGGER__");
    handle = installGameBeacon({ route: "/game", evidenceGlobals: ["__TRIGGER__", "__AFTER__"], win });
    expect(() => handle.publishEvidence({ score: 1 })).toThrow("setter failed");
    expect(Object.getOwnPropertyDescriptor(win, "__TRIGGER__")).toEqual(descriptor);
    expect(Object.hasOwn(win, "__AFTER__")).toBe(false);
    expect(Object.hasOwn(win, "__AURA3D_GAME__")).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("restores pre-existing beacon and evidence property descriptors exactly", () => {
    const win: Record<string, any> = {};
    const original = { external: true };
    const getAlias = vi.fn(() => original);
    Object.defineProperty(win, "__AURA3D_GAME__", {
      configurable: true, enumerable: false, writable: false, value: original
    });
    Object.defineProperty(win, "__SHARED__", {
      configurable: true, enumerable: false, get: getAlias
    });
    const beaconDescriptor = Object.getOwnPropertyDescriptor(win, "__AURA3D_GAME__");
    const aliasDescriptor = Object.getOwnPropertyDescriptor(win, "__SHARED__");
    const handle = installGameBeacon({
      route: "/game", evidenceGlobals: ["__SHARED__", "__SHARED__"], win
    });
    const evidence = { score: 1 };
    handle.publishEvidence(evidence);
    expect(win.__SHARED__).toBe(evidence);
    expect(getAlias).not.toHaveBeenCalled();
    handle.dispose();
    expect(Object.getOwnPropertyDescriptor(win, "__AURA3D_GAME__")).toEqual(beaconDescriptor);
    expect(Object.getOwnPropertyDescriptor(win, "__SHARED__")).toEqual(aliasDescriptor);
  });

  it("forwards evidence through a pre-existing channel setter while keeping concurrent owners isolated", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const win: Record<string, any> = { __AURA3D_EVIDENCE_OPT_IN__: true };
    const collect = vi.fn(() => "channel");
    const channel = installEvidenceChannel({
      id: "shared", builtins: { owner: collect }, legacyGlobals: ["__SHARED__"], win
    });
    const descriptor = Object.getOwnPropertyDescriptor(win, "__SHARED__");
    const first = installGameBeacon({ route: "/first", evidenceGlobals: ["__SHARED__"], win });
    const second = installGameBeacon({ route: "/second", evidenceGlobals: ["__SHARED__"], win });
    try {
      first.publishEvidence({ score: 1 });
      second.publishEvidence({ score: 2 });
      first.publishEvidence({ score: 3 });
      expect(collect).not.toHaveBeenCalled();
      const registry = win.__AURA3D_GAME_EVIDENCE__;
      expect(registry.shared).toMatchObject({ id: "shared", score: 2 });
      expect(win.__SHARED__).toBe(registry.shared);
      expect(collect).not.toHaveBeenCalled();
      expect(registry.shared.sections.owner).toBe("channel");
      second.dispose();
      expect(registry.shared).toMatchObject({ id: "shared", score: 3 });
      expect(win.__SHARED__).toBe(registry.shared);
      first.dispose();
      expect(Object.getOwnPropertyDescriptor(win, "__SHARED__")).toEqual(descriptor);
    } finally {
      first.dispose();
      second.dispose();
      channel.dispose();
    }
  });

  it("retains a non-configurable evidence setter and does not evaluate its getter while publishing", () => {
    const win: Record<string, any> = {};
    const get = vi.fn();
    const set = vi.fn();
    Object.defineProperty(win, "__SHARED__", { configurable: false, enumerable: true, get, set });
    const descriptor = Object.getOwnPropertyDescriptor(win, "__SHARED__");
    const handle = installGameBeacon({ route: "/game", evidenceGlobals: ["__SHARED__"], win });
    const evidence = { score: 1 };
    handle.publishEvidence(evidence);
    expect(set).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith(evidence);
    expect(get).not.toHaveBeenCalled();
    handle.dispose();
    expect(Object.getOwnPropertyDescriptor(win, "__SHARED__")).toEqual(descriptor);
  });

  it("restores writable non-configurable data properties without changing their attributes", () => {
    const win: Record<string, any> = {};
    const original = { external: true };
    Object.defineProperty(win, "__AURA3D_GAME__", {
      configurable: false, enumerable: false, writable: true, value: original
    });
    const descriptor = Object.getOwnPropertyDescriptor(win, "__AURA3D_GAME__");
    const handle = installGameBeacon({ route: "/game", win });
    expect(win.__AURA3D_GAME__.route).toBe("/game");
    handle.refresh();
    handle.dispose();
    expect(Object.getOwnPropertyDescriptor(win, "__AURA3D_GAME__")).toEqual(descriptor);
  });

  it("does not reclaim globals replaced externally and restores that external state after a later owner", () => {
    const win: Record<string, any> = {};
    const first = installGameBeacon({ route: "/first", evidenceGlobals: ["__SHARED__"], win });
    first.publishEvidence({ score: 1 });
    const externalBeacon = { route: "/external" };
    const externalEvidence = { external: true };
    win.__AURA3D_GAME__ = externalBeacon;
    Object.defineProperty(win, "__SHARED__", {
      configurable: true, enumerable: false, writable: false, value: externalEvidence
    });
    const beaconDescriptor = Object.getOwnPropertyDescriptor(win, "__AURA3D_GAME__");
    const aliasDescriptor = Object.getOwnPropertyDescriptor(win, "__SHARED__");

    first.refresh();
    first.publishEvidence({ score: 2 });
    expect(Object.getOwnPropertyDescriptor(win, "__AURA3D_GAME__")).toEqual(beaconDescriptor);
    expect(Object.getOwnPropertyDescriptor(win, "__SHARED__")).toEqual(aliasDescriptor);

    const second = installGameBeacon({ route: "/second", evidenceGlobals: ["__SHARED__"], win });
    second.publishEvidence({ score: 3 });
    expect(win.__AURA3D_GAME__.route).toBe("/second");
    second.dispose();
    expect(Object.getOwnPropertyDescriptor(win, "__AURA3D_GAME__")).toEqual(beaconDescriptor);
    expect(Object.getOwnPropertyDescriptor(win, "__SHARED__")).toEqual(aliasDescriptor);
    first.dispose();
    expect(Object.getOwnPropertyDescriptor(win, "__AURA3D_GAME__")).toEqual(beaconDescriptor);
    expect(Object.getOwnPropertyDescriptor(win, "__SHARED__")).toEqual(aliasDescriptor);
  });

  it("does not insert a late older alias behind a newer owner across an external replacement", () => {
    const win: Record<string, any> = {};
    const first = installGameBeacon({ route: "/first", evidenceGlobals: ["__SHARED__"], win });
    const external = { external: true };
    Object.defineProperty(win, "__SHARED__", {
      configurable: true, enumerable: false, writable: false, value: external
    });
    const descriptor = Object.getOwnPropertyDescriptor(win, "__SHARED__");
    const second = installGameBeacon({ route: "/second", evidenceGlobals: ["__SHARED__"], win });
    second.publishEvidence({ score: 2 });
    first.publishEvidence({ score: 1 });
    expect(win.__SHARED__).toEqual({ score: 2 });
    second.dispose();
    expect(Object.getOwnPropertyDescriptor(win, "__SHARED__")).toEqual(descriptor);
    first.dispose();
    expect(Object.getOwnPropertyDescriptor(win, "__SHARED__")).toEqual(descriptor);
  });

  it("rolls back a failed alias publication and does not leave a timer after failed installation", () => {
    vi.useFakeTimers();
    const win: Record<string, any> = {};
    Object.defineProperty(win, "__LOCKED__", { configurable: false, writable: false, value: "locked" });
    const handle = installGameBeacon({ route: "/game", evidenceGlobals: ["__TEMP__", "__LOCKED__"], win });
    const before = win.__AURA3D_GAME__;
    expect(() => handle.publishEvidence({ score: 1 })).toThrow();
    expect(win.__AURA3D_GAME__).toBe(before);
    expect(Object.hasOwn(win, "__TEMP__")).toBe(false);
    handle.dispose();
    expect(vi.getTimerCount()).toBe(0);

    const lockedWin: Record<string, any> = {};
    Object.defineProperty(lockedWin, "__AURA3D_GAME__", {
      configurable: false, writable: false, value: "locked"
    });
    expect(() => installGameBeacon({ route: "/blocked", win: lockedWin })).toThrow();
    expect(lockedWin.__AURA3D_GAME__).toBe("locked");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("restores the original descriptor when starting the refresh timer fails", () => {
    vi.useFakeTimers();
    const win: Record<string, any> = {};
    Object.defineProperty(win, "__AURA3D_GAME__", {
      configurable: true, enumerable: false, writable: true, value: { external: true }
    });
    const descriptor = Object.getOwnPropertyDescriptor(win, "__AURA3D_GAME__");
    vi.spyOn(globalThis, "setInterval").mockImplementation(() => {
      throw new Error("timer unavailable");
    });
    expect(() => installGameBeacon({ route: "/blocked", win })).toThrow("timer unavailable");
    expect(Object.getOwnPropertyDescriptor(win, "__AURA3D_GAME__")).toEqual(descriptor);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not create a timer or read game state without a window", () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", undefined);
    const readState = vi.fn(() => "playing" as const);
    const readFrame = vi.fn(() => 1);
    const handle = installGameBeacon({ route: "/server", getState: readState, getFrame: readFrame });
    handle.refresh();
    handle.publishEvidence({ score: 1 });
    handle.dispose();
    expect(readState).not.toHaveBeenCalled();
    expect(readFrame).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
