import { describe, expect, it, vi } from "vitest";
import { createGameImpl } from "../../../packages/game/src/createGame";
import { installGameBeacon } from "../../../packages/game/src/evidence/beacon";
import { installEvidenceChannel } from "../../../packages/game/src/evidence/channel";
import { awaitFirstPresentedDraw, drawCallsOf } from "../../../packages/game/src/session/presented";
import { lights, primitives, scene } from "../../../packages/engine/src";

const testScene = () =>
  scene()
    .add(primitives.box({ name: "ready-beacon probe" }))
    .add(lights.studio());

/** Settle microtasks (firstPresentedFrame waiters resolve via queueMicrotask). */
const settle = async (rounds = 4) => {
  for (let i = 0; i < rounds; i += 1) await Promise.resolve();
};

describe("awaitFirstPresentedDraw (T0-30, #54)", () => {
  it("re-arms until a presented frame reports drawCalls > 0", async () => {
    const resolutions: Array<() => void> = [];
    const source = {
      calls: 0,
      firstPresentedFrame(): Promise<number> {
        this.calls += 1;
        return new Promise<number>((resolve) => resolutions.push(() => resolve(this.calls)));
      }
    };
    let drawCalls = 0;
    const gate = awaitFirstPresentedDraw(source, () => drawCalls);
    await settle();
    expect(source.calls).toBe(1);
    // First presented frame drew nothing → the gate re-arms instead of passing.
    resolutions.shift()!();
    await settle();
    expect(source.calls).toBe(2);
    drawCalls = 4;
    resolutions.shift()!();
    await expect(gate).resolves.toBe(2);
  });

  it("passes immediately when drawCalls is already > 0", async () => {
    let calls = 0;
    const source = {
      firstPresentedFrame(): Promise<number> {
        calls += 1;
        return Promise.resolve(9);
      }
    };
    await expect(awaitFirstPresentedDraw(source, () => 7)).resolves.toBe(-1);
    expect(calls).toBe(0);
  });

  it("drawCallsOf tolerates missing/throwing diagnostics", () => {
    expect(drawCallsOf({})).toBe(0);
    expect(drawCallsOf({ diagnostics: () => ({ drawCalls: Number.NaN }) })).toBe(0);
    expect(drawCallsOf({ diagnostics: () => { throw new Error("gone"); } })).toBe(0);
    expect(drawCallsOf({ diagnostics: () => ({ drawCalls: 3 }) })).toBe(3);
  });
});

describe("game.ready() beacon gating (T0-30, #54)", () => {
  it("reaches playing only after a presented frame with drawCalls > 0", async () => {
    const game = createGameImpl({
      id: "ready-beacon",
      target: null,
      autoStart: false,
      scene: () => testScene()
    });
    try {
      game.start();
      const ready = game.ready();
      await settle();
      // app.ready() resolved but nothing presented yet → still pre-playing.
      expect(game.session.state).toBe("loading");

      // A presented frame that drew nothing must not flip the session.
      game.runtime.step(1 / 60);
      await settle();
      expect(game.session.state).toBe("loading");

      // Simulate a submitted draw (node/headless reports drawCalls 0), then a
      // presented frame — only now may the session reach `playing`.
      const app = game.app as { diagnostics: () => { drawCalls: number } };
      const realDiagnostics = app.diagnostics.bind(app);
      app.diagnostics = () => ({ ...realDiagnostics(), drawCalls: 5 });
      game.runtime.step(1 / 60);
      await ready;
      expect(game.session.state).toBe("playing");
    } finally {
      await game.dispose();
    }
  });

  it("already-drawn app: ready() resolves without another presented frame", async () => {
    const game = createGameImpl({
      id: "ready-beacon-2",
      target: null,
      autoStart: false,
      scene: () => testScene()
    });
    try {
      const app = game.app as { diagnostics: () => { drawCalls: number } };
      app.diagnostics = () => ({ drawCalls: 2 });
      game.start();
      await game.ready();
      expect(game.session.state).toBe("playing");
    } finally {
      await game.dispose();
    }
  });
});

describe("concurrent game beacon integration", () => {
  it.each(["older-first", "newer-first"])(
    "keeps each game session isolated and restores the external beacon with %s disposal",
    async (order) => {
      const win: Record<string, any> = {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        location: new URL("https://example.test/")
      };
      const original = { external: true };
      Object.defineProperty(win, "__AURA3D_GAME__", {
        configurable: true, enumerable: false, writable: true, value: original
      });
      const descriptor = Object.getOwnPropertyDescriptor(win, "__AURA3D_GAME__");
      vi.stubGlobal("window", win);
      vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
      vi.stubGlobal("cancelAnimationFrame", vi.fn());
      let first: ReturnType<typeof createGameImpl> | undefined;
      let second: ReturnType<typeof createGameImpl> | undefined;
      try {
        first = createGameImpl({
          id: "first-concurrent-beacon", target: null, autoStart: false, scene: testScene
        });
        second = createGameImpl({
          id: "second-concurrent-beacon", target: null, autoStart: false, scene: testScene
        });
        const newer = win.__AURA3D_GAME__;
        expect(newer.session).toBe(second.session);

        first.start();
        expect(first.session.state).toBe("loading");
        expect(win.__AURA3D_GAME__).toBe(newer);

        if (order === "older-first") {
          await first.dispose();
          expect(win.__AURA3D_GAME__.session).toBe(second.session);
          await second.dispose();
        } else {
          await second.dispose();
          expect(win.__AURA3D_GAME__.session).toBe(first.session);
          expect(win.__AURA3D_GAME__.state).toBe("loading");
          await first.dispose();
        }
        expect(Object.getOwnPropertyDescriptor(win, "__AURA3D_GAME__")).toEqual(descriptor);
      } finally {
        try {
          await first?.dispose();
          await second?.dispose();
        } finally {
          vi.unstubAllGlobals();
        }
      }
    }
  );
});

describe("game beacon disposal ownership", () => {
  const makeWindow = () => ({
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    location: new URL("https://example.test/")
  }) as Record<string, any>;

  const installWindow = (win: Record<string, any>) => {
    vi.stubGlobal("window", win);
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  };

  it("rejects a game evidence alias that would replace the primary beacon", async () => {
    const win = makeWindow();
    const original = { external: true };
    Object.defineProperty(win, "__AURA3D_GAME__", {
      configurable: true, enumerable: false, writable: true, value: original
    });
    const descriptor = Object.getOwnPropertyDescriptor(win, "__AURA3D_GAME__");
    const makeScene = vi.fn(testScene);
    installWindow(win);
    let game: ReturnType<typeof createGameImpl> | undefined;
    try {
      expect(() => {
        game = createGameImpl({
          id: "beacon-alias-collision", target: null, autoStart: false, scene: makeScene,
          evidence: { schema: 1, legacyGlobals: ["__AURA3D_GAME__"] }
        });
      }).toThrow(/EVIDENCE_CHANNEL_RESERVED_ALIAS_V1.*__AURA3D_GAME__/);
      expect(makeScene).not.toHaveBeenCalled();
      expect(win.addEventListener).not.toHaveBeenCalled();
      expect(Object.getOwnPropertyDescriptor(win, "__AURA3D_GAME__")).toEqual(descriptor);
      expect(Object.hasOwn(win, "__AURA3D_GAME_EVIDENCE__")).toBe(false);
    } finally {
      try { await game?.dispose(); } finally { vi.unstubAllGlobals(); }
    }
  });

  it("keeps an inert evidence alias usable without a window", async () => {
    vi.stubGlobal("window", undefined);
    let game: ReturnType<typeof createGameImpl> | undefined;
    try {
      game = createGameImpl({
        id: "headless-beacon-alias", target: null, autoStart: false, scene: testScene,
        evidence: { schema: 1, legacyGlobals: ["__AURA3D_GAME__"] }
      });
      await expect(game.dispose()).resolves.toBeUndefined();
    } finally {
      try { await game?.dispose(); } finally { vi.unstubAllGlobals(); }
    }
  });

  it.each([
    ["game-first", "explicit window"],
    ["channel-first", "explicit window"],
    ["game-first", "global window"],
    ["channel-first", "global window"]
  ] as const)(
    "rejects a standalone beacon alias and preserves the surviving owner with %s disposal (%s)",
    async (order, transport) => {
      const win = makeWindow();
      win.__AURA3D_EVIDENCE_OPT_IN__ = true;
      const externalBeaconGet = vi.fn(() => { throw new Error("external beacon getter must not run"); });
      const externalBeaconSet = vi.fn();
      Object.defineProperty(win, "__AURA3D_GAME__", {
        configurable: true, enumerable: false, get: externalBeaconGet, set: externalBeaconSet
      });
      const originalBeacon = Object.getOwnPropertyDescriptor(win, "__AURA3D_GAME__");
      const externalAliasGet = vi.fn(() => { throw new Error("external alias getter must not run"); });
      Object.defineProperty(win, "__INDEPENDENT_EVIDENCE__", {
        configurable: true, enumerable: true, get: externalAliasGet
      });
      const originalAlias = Object.getOwnPropertyDescriptor(win, "__INDEPENDENT_EVIDENCE__");
      const untouched = { owner: "external" };
      Object.defineProperty(win, "__OTHER_OWNER__", {
        configurable: true, enumerable: false, writable: false, value: untouched
      });
      const otherDescriptor = Object.getOwnPropertyDescriptor(win, "__OTHER_OWNER__");
      const registry: Record<string, unknown> = {};
      Object.defineProperty(registry, "real-game", {
        configurable: true, enumerable: false, writable: false, value: { owner: "external game slot" }
      });
      const originalGameSlot = Object.getOwnPropertyDescriptor(registry, "real-game");
      const externalSlotGet = vi.fn(() => { throw new Error("external slot getter must not run"); });
      Object.defineProperty(registry, "standalone", {
        configurable: true, enumerable: false, get: externalSlotGet
      });
      const originalStandaloneSlot = Object.getOwnPropertyDescriptor(registry, "standalone");
      win.__AURA3D_GAME_EVIDENCE__ = registry;
      const originalRegistry = Object.getOwnPropertyDescriptor(win, "__AURA3D_GAME_EVIDENCE__");
      installWindow(win);

      let game: ReturnType<typeof createGameImpl> | undefined;
      let standalone: ReturnType<typeof installEvidenceChannel> | undefined;
      let collision: ReturnType<typeof installEvidenceChannel> | undefined;
      try {
        game = createGameImpl({
          id: "real-game", target: null, autoStart: false, scene: testScene,
          evidence: { schema: 1, legacyGlobals: ["__REAL_GAME_EVIDENCE__"] }
        });
        game.start();
        expect(game.session.state).toBe("loading");
        const liveBeacon = Object.getOwnPropertyDescriptor(win, "__AURA3D_GAME__");
        expect(liveBeacon?.value.session).toBe(game.session);
        const target = transport === "explicit window" ? { win } : {};
        standalone = installEvidenceChannel({
          ...target, id: "standalone", builtins: { owner: () => "standalone" },
          legacyGlobals: ["__INDEPENDENT_EVIDENCE__"]
        });
        const liveSlot = Object.getOwnPropertyDescriptor(registry, "standalone");
        const liveAlias = Object.getOwnPropertyDescriptor(win, "__INDEPENDENT_EVIDENCE__");
        const collect = vi.fn(() => "invalid");
        const loader = vi.fn(async () => ({}));
        let rejection: unknown;
        try {
          collision = installEvidenceChannel({
            ...target, id: "standalone", builtins: { owner: collect }, loader,
            legacyGlobals: ["__PARTIAL_ALIAS__", "__AURA3D_GAME__"]
          });
        } catch (error) {
          rejection = error;
        }
        const afterAttempt = {
          beacon: Object.getOwnPropertyDescriptor(win, "__AURA3D_GAME__"),
          slot: Object.getOwnPropertyDescriptor(registry, "standalone"),
          alias: Object.getOwnPropertyDescriptor(win, "__INDEPENDENT_EVIDENCE__"),
          partial: Object.getOwnPropertyDescriptor(win, "__PARTIAL_ALIAS__")
        };

        let survivingStandalone: unknown;
        let survivingAlias: unknown;
        let survivingBeacon: unknown;
        let survivingSession: unknown;
        let survivingSessionState: string | undefined;
        if (order === "game-first") {
          await game.dispose();
          collision?.dispose();
          survivingStandalone = registry.standalone;
          survivingAlias = win.__INDEPENDENT_EVIDENCE__;
          standalone.dispose();
        } else {
          collision?.dispose();
          standalone.dispose();
          survivingBeacon = win.__AURA3D_GAME__;
          survivingSession = (survivingBeacon as { session?: unknown }).session;
          survivingSessionState = game.session.state;
          await game.dispose();
        }

        expect(game.session.state).toBe("disposed");
        const restoredBeacon = Object.getOwnPropertyDescriptor(win, "__AURA3D_GAME__");
        expect(restoredBeacon?.value?.session, "a disposed game beacon must not be resurrected").not.toBe(game.session);
        expect(restoredBeacon).toEqual(originalBeacon);
        expect(rejection).toBeInstanceOf(Error);
        expect((rejection as Error).message).toBe(
          'EVIDENCE_CHANNEL_RESERVED_ALIAS_V1: "__AURA3D_GAME__" is reserved for the game beacon.'
        );
        expect(afterAttempt.beacon).toEqual(liveBeacon);
        expect(afterAttempt.slot).toEqual(liveSlot);
        expect(afterAttempt.alias).toEqual(liveAlias);
        expect(afterAttempt.partial).toBeUndefined();
        if (order === "game-first") {
          expect(survivingStandalone).toMatchObject({ id: "standalone", sections: { owner: "standalone" } });
          expect(survivingAlias).toBe(survivingStandalone);
        } else {
          expect(survivingBeacon).toBe(liveBeacon?.value);
          expect(survivingSession).toBe(game.session);
          expect(survivingSessionState).not.toBe("disposed");
        }
        expect(Object.getOwnPropertyDescriptor(win, "__AURA3D_GAME_EVIDENCE__")).toEqual(originalRegistry);
        expect(Object.getOwnPropertyDescriptor(registry, "real-game")).toEqual(originalGameSlot);
        expect(Object.getOwnPropertyDescriptor(registry, "standalone")).toEqual(originalStandaloneSlot);
        expect(Object.getOwnPropertyDescriptor(win, "__INDEPENDENT_EVIDENCE__")).toEqual(originalAlias);
        expect(Object.getOwnPropertyDescriptor(win, "__OTHER_OWNER__")).toEqual(otherDescriptor);
        expect(Object.hasOwn(win, "__REAL_GAME_EVIDENCE__")).toBe(false);
        expect(externalBeaconGet).not.toHaveBeenCalled();
        expect(externalBeaconSet).not.toHaveBeenCalled();
        expect(externalAliasGet).not.toHaveBeenCalled();
        expect(externalSlotGet).not.toHaveBeenCalled();
        expect(collect).not.toHaveBeenCalled();
        expect(loader).not.toHaveBeenCalled();
      } finally {
        try {
          collision?.dispose();
          standalone?.dispose();
          await game?.dispose();
        } finally { vi.unstubAllGlobals(); }
      }
    }
  );

  it.each([
    ["game-first", "explicit window"],
    ["channel-first", "explicit window"],
    ["game-first", "global window"],
    ["channel-first", "global window"]
  ] as const)(
    "preserves a real game and standalone channel sharing an allowed id and alias with %s disposal (%s)",
    async (order, transport) => {
      const win = makeWindow();
      win.__AURA3D_EVIDENCE_OPT_IN__ = true;
      const readBeacon = vi.fn(() => { throw new Error("external beacon getter must not run"); });
      const readSlot = vi.fn(() => { throw new Error("external registry getter must not run"); });
      const readAlias = vi.fn(() => { throw new Error("external alias getter must not run"); });
      Object.defineProperty(win, "__AURA3D_GAME__", { configurable: true, enumerable: false, get: readBeacon });
      Object.defineProperty(win, "__SHARED_EVIDENCE__", { configurable: true, enumerable: true, get: readAlias });
      const registry: Record<string, unknown> = {};
      Object.defineProperty(registry, "shared-id", { configurable: true, enumerable: false, get: readSlot });
      win.__AURA3D_GAME_EVIDENCE__ = registry;
      const originalBeacon = Object.getOwnPropertyDescriptor(win, "__AURA3D_GAME__");
      const originalRegistry = Object.getOwnPropertyDescriptor(win, "__AURA3D_GAME_EVIDENCE__");
      const originalSlot = Object.getOwnPropertyDescriptor(registry, "shared-id");
      const originalAlias = Object.getOwnPropertyDescriptor(win, "__SHARED_EVIDENCE__");
      const collect = vi.fn(() => "standalone");
      installWindow(win);

      let game: ReturnType<typeof createGameImpl> | undefined;
      let standalone: ReturnType<typeof installEvidenceChannel> | undefined;
      try {
        game = createGameImpl({
          id: "shared-id", target: null, autoStart: false, scene: testScene,
          evidence: { schema: 1, legacyGlobals: ["__SHARED_EVIDENCE__"] }
        });
        game.start();
        const gameSlot = Object.getOwnPropertyDescriptor(registry, "shared-id");
        const gameAlias = Object.getOwnPropertyDescriptor(win, "__SHARED_EVIDENCE__");
        const gameSnapshot = registry["shared-id"] as { sections: { session: { state: string } } };
        expect(gameSnapshot.sections.session.state).toBe("loading");
        expect(win.__SHARED_EVIDENCE__).toBe(gameSnapshot);

        standalone = installEvidenceChannel({
          ...(transport === "explicit window" ? { win } : {}),
          id: "shared-id", builtins: { owner: collect }, legacyGlobals: ["__SHARED_EVIDENCE__"]
        });
        const standaloneSnapshot = registry["shared-id"] as { sections: { owner: string } };
        expect(collect).not.toHaveBeenCalled();
        expect(standaloneSnapshot.sections.owner).toBe("standalone");
        expect(win.__SHARED_EVIDENCE__).toBe(standaloneSnapshot);
        expect(win.__AURA3D_GAME__.session).toBe(game.session);

        if (order === "game-first") {
          await game.dispose();
          expect(Object.getOwnPropertyDescriptor(win, "__AURA3D_GAME__")).toEqual(originalBeacon);
          const surviving = registry["shared-id"] as { sections: { owner: string } };
          expect(surviving.sections.owner).toBe("standalone");
          expect(win.__SHARED_EVIDENCE__).toBe(surviving);
          standalone.dispose();
        } else {
          standalone.dispose();
          expect(Object.getOwnPropertyDescriptor(registry, "shared-id")).toEqual(gameSlot);
          expect(Object.getOwnPropertyDescriptor(win, "__SHARED_EVIDENCE__")).toEqual(gameAlias);
          const restored = registry["shared-id"] as { sections: { session: { state: string } } };
          expect(restored.sections.session.state).toBe("loading");
          expect(win.__SHARED_EVIDENCE__).toBe(restored);
          expect(win.__AURA3D_GAME__.session).toBe(game.session);
          await game.dispose();
        }

        expect(game.session.state).toBe("disposed");
        expect(Object.getOwnPropertyDescriptor(win, "__AURA3D_GAME__")).toEqual(originalBeacon);
        expect(Object.getOwnPropertyDescriptor(win, "__AURA3D_GAME_EVIDENCE__")).toEqual(originalRegistry);
        expect(Object.getOwnPropertyDescriptor(registry, "shared-id")).toEqual(originalSlot);
        expect(Object.getOwnPropertyDescriptor(win, "__SHARED_EVIDENCE__")).toEqual(originalAlias);
        expect(readBeacon).not.toHaveBeenCalled();
        expect(readSlot).not.toHaveBeenCalled();
        expect(readAlias).not.toHaveBeenCalled();
      } finally {
        try {
          standalone?.dispose();
          await game?.dispose();
        } finally { vi.unstubAllGlobals(); }
      }
    }
  );

  it("restores an external beacon even if its session is the game being disposed", async () => {
    const win = makeWindow();
    const original: { session?: unknown } = {};
    Object.defineProperty(win, "__AURA3D_GAME__", {
      configurable: true, enumerable: false, writable: false, value: original
    });
    const descriptor = Object.getOwnPropertyDescriptor(win, "__AURA3D_GAME__");
    installWindow(win);
    let game: ReturnType<typeof createGameImpl> | undefined;
    try {
      game = createGameImpl({ id: "restored-session", target: null, autoStart: false, scene: testScene });
      original.session = game.session;
      await game.dispose();
      expect(Object.getOwnPropertyDescriptor(win, "__AURA3D_GAME__")).toEqual(descriptor);
      expect(win.__AURA3D_GAME__).toBe(original);
      expect(game.session.state).toBe("disposed");
    } finally {
      try { await game?.dispose(); } finally { vi.unstubAllGlobals(); }
    }
  });

  it("does not remove a direct replacement owned by another party with the same session", async () => {
    const win = makeWindow();
    installWindow(win);
    let game: ReturnType<typeof createGameImpl> | undefined;
    try {
      game = createGameImpl({ id: "replaced-session", target: null, autoStart: false, scene: testScene });
      const replacement = { session: game.session };
      Object.defineProperty(win, "__AURA3D_GAME__", {
        configurable: true, enumerable: false, writable: false, value: replacement
      });
      const descriptor = Object.getOwnPropertyDescriptor(win, "__AURA3D_GAME__");
      await game.dispose();
      expect(Object.getOwnPropertyDescriptor(win, "__AURA3D_GAME__")).toEqual(descriptor);
      expect(win.__AURA3D_GAME__).toBe(replacement);
    } finally {
      try { await game?.dispose(); } finally { vi.unstubAllGlobals(); }
    }
  });

  it("leaves a newer beacon owner intact even when it exposes the disposed session", async () => {
    const win = makeWindow();
    const original = { external: true };
    Object.defineProperty(win, "__AURA3D_GAME__", {
      configurable: true, enumerable: false, writable: true, value: original
    });
    const descriptor = Object.getOwnPropertyDescriptor(win, "__AURA3D_GAME__");
    installWindow(win);
    let game: ReturnType<typeof createGameImpl> | undefined;
    let other: ReturnType<typeof installGameBeacon> | undefined;
    try {
      game = createGameImpl({ id: "older-game", target: null, autoStart: false, scene: testScene });
      const session = game.session;
      other = installGameBeacon({ route: "/other-owner", win, getSession: () => session });
      const otherBeacon = win.__AURA3D_GAME__;
      await game.dispose();
      expect(win.__AURA3D_GAME__).toBe(otherBeacon);
      expect(win.__AURA3D_GAME__.session).toBe(session);
      other.dispose();
      expect(Object.getOwnPropertyDescriptor(win, "__AURA3D_GAME__")).toEqual(descriptor);
    } finally {
      try {
        other?.dispose();
        await game?.dispose();
      } finally { vi.unstubAllGlobals(); }
    }
  });

  it.each(["global getter", "beacon session getter"] as const)(
    "does not evaluate a restored external %s while disposing",
    async (kind) => {
      const win = makeWindow();
      const getter = vi.fn(() => { throw new Error("external getter must not run"); });
      const original = Object.defineProperty({}, "session", { get: getter });
      Object.defineProperty(win, "__AURA3D_GAME__", kind === "global getter"
        ? { configurable: true, enumerable: false, get: getter }
        : { configurable: true, enumerable: false, writable: false, value: original });
      const descriptor = Object.getOwnPropertyDescriptor(win, "__AURA3D_GAME__");
      const soundGetter = vi.fn(() => { throw new Error("external sound getter must not run"); });
      Object.defineProperty(win, "__AURA3D_GAME_SOUND__", { configurable: true, get: soundGetter });
      const soundDescriptor = Object.getOwnPropertyDescriptor(win, "__AURA3D_GAME_SOUND__");
      const sound = { suspend: vi.fn(), dispose: vi.fn(async () => {}) };
      installWindow(win);
      let game: ReturnType<typeof createGameImpl> | undefined;
      try {
        game = createGameImpl({
          id: "throwing-external-beacon", target: null, autoStart: false,
          scene: testScene, soundAdapter: sound
        });
        await expect(game.dispose()).resolves.toBeUndefined();
        expect(getter).not.toHaveBeenCalled();
        expect(soundGetter).not.toHaveBeenCalled();
        expect(Object.getOwnPropertyDescriptor(win, "__AURA3D_GAME__")).toEqual(descriptor);
        expect(Object.getOwnPropertyDescriptor(win, "__AURA3D_GAME_SOUND__")).toEqual(soundDescriptor);
        expect(game.session.state).toBe("disposed");
        expect(sound.dispose).toHaveBeenCalledOnce();
        await game.dispose();
        expect(sound.dispose).toHaveBeenCalledOnce();
      } finally {
        try { await game?.dispose(); } catch {} finally { vi.unstubAllGlobals(); }
      }
    }
  );

  it("finishes the other cleanup and rejects once if beacon restoration fails", async () => {
    const target = makeWindow();
    const original = { external: true };
    Object.defineProperty(target, "__AURA3D_GAME__", {
      configurable: true, enumerable: false, writable: true, value: original
    });
    const restoreError = new Error("external beacon restoration failed");
    let failRestore = false;
    const win = new Proxy(target, {
      defineProperty(object, name, descriptor) {
        if (failRestore && name === "__AURA3D_GAME__" && descriptor.value === original) throw restoreError;
        return Reflect.defineProperty(object, name, descriptor);
      }
    });
    const sound = { suspend: vi.fn(), dispose: vi.fn(async () => {}) };
    installWindow(win);
    let game: ReturnType<typeof createGameImpl> | undefined;
    try {
      game = createGameImpl({
        id: "failed-beacon-restore", target: null, autoStart: false, scene: testScene,
        soundAdapter: sound, evidence: { schema: 1, legacyGlobals: ["__TEST_GAME_ALIAS__"] }
      });
      const registry = win.__AURA3D_GAME_EVIDENCE__;
      const disposeApp = vi.spyOn(game.app, "disposeAsync");
      const disposeRuntime = vi.spyOn(game.runtime, "dispose");
      game.hud.set("score", 1);
      game.start();
      expect(game.runtime.running).toBe(true);
      failRestore = true;

      const disposal = game.dispose();
      expect(game.dispose()).toBe(disposal);
      await expect(disposal).rejects.toBe(restoreError);
      expect(game.session.state).toBe("disposed");
      expect(game.runtime.running).toBe(false);
      expect(disposeApp).toHaveBeenCalledOnce();
      expect(disposeRuntime).toHaveBeenCalledOnce();
      expect(sound.dispose).toHaveBeenCalledOnce();
      expect(game.hud.snapshot().widgets).toEqual([]);
      expect(Object.hasOwn(registry, "failed-beacon-restore")).toBe(false);
      expect(Object.hasOwn(win, "__TEST_GAME_ALIAS__")).toBe(false);
      expect(win.removeEventListener).toHaveBeenCalled();
      await expect(game.dispose()).rejects.toBe(restoreError);
      expect(sound.dispose).toHaveBeenCalledOnce();
    } finally {
      failRestore = false;
      try { await game?.dispose(); } catch {} finally { vi.unstubAllGlobals(); }
    }
  });

  it("waits for asynchronous cleanup and preserves every failure", async () => {
    const target = makeWindow();
    const original = { external: true };
    Object.defineProperty(target, "__AURA3D_GAME__", { configurable: true, value: original });
    const beaconError = new Error("beacon cleanup failed");
    const listenerError = new Error("session cleanup listener failed");
    const appError = new Error("app cleanup failed");
    const soundError = new Error("sound cleanup failed");
    let failRestore = false;
    const win = new Proxy(target, {
      defineProperty(object, name, descriptor) {
        if (failRestore && name === "__AURA3D_GAME__" && descriptor.value === original) throw beaconError;
        return Reflect.defineProperty(object, name, descriptor);
      }
    });
    let rejectSound!: (error: Error) => void;
    const soundResult = new Promise<void>((_resolve, reject) => { rejectSound = reject; });
    void soundResult.catch(() => undefined);
    const sound = { suspend: vi.fn(), dispose: vi.fn(() => soundResult) };
    installWindow(win);
    let game: ReturnType<typeof createGameImpl> | undefined;
    try {
      game = createGameImpl({
        id: "multiple-cleanup-failures", target: null, autoStart: false, scene: testScene, soundAdapter: sound
      });
      game.hud.set("score", 1);
      game.session.on("state", (session) => {
        if (session.state === "disposed") throw listenerError;
      });
      let markAppFailed!: () => void;
      const appFailed = new Promise<void>((resolve) => { markAppFailed = resolve; });
      const disposeApp = game.app.disposeAsync.bind(game.app);
      vi.spyOn(game.app, "disposeAsync").mockImplementation(async () => {
        await disposeApp();
        markAppFailed();
        throw appError;
      });
      failRestore = true;
      const disposal = game.dispose();
      let settled = false;
      const result = disposal.then(
        () => { settled = true; return undefined; },
        (error: unknown) => { settled = true; return error; }
      );
      await appFailed;
      await settle();
      expect(settled).toBe(false);
      expect(sound.dispose).toHaveBeenCalledOnce();
      rejectSound(soundError);
      const error = await result;
      expect(error).toBeInstanceOf(AggregateError);
      expect((error as AggregateError).errors).toEqual([beaconError, listenerError, appError, soundError]);
      expect(game.session.state).toBe("disposed");
      expect(game.runtime.running).toBe(false);
      expect(game.hud.snapshot().widgets).toEqual([]);
      await expect(game.dispose()).rejects.toBe(error);
    } finally {
      failRestore = false;
      rejectSound(soundError);
      try { await game?.dispose(); } catch {} finally { vi.unstubAllGlobals(); }
    }
  });

  it("shares one disposal promise with a reentrant session listener", async () => {
    const win = makeWindow();
    installWindow(win);
    const sound = { suspend: vi.fn(), dispose: vi.fn(async () => {}) };
    let game: ReturnType<typeof createGameImpl> | undefined;
    try {
      game = createGameImpl({
        id: "reentrant-disposal", target: null, autoStart: false, scene: testScene, soundAdapter: sound
      });
      const disposeRuntime = vi.spyOn(game.runtime, "dispose");
      let reentrant: Promise<void> | undefined;
      game.session.on("state", (session) => {
        if (session.state === "disposed") reentrant = game!.dispose();
      });
      const disposal = game.dispose();
      expect(reentrant).toBe(disposal);
      await disposal;
      expect(disposeRuntime).toHaveBeenCalledOnce();
      expect(sound.dispose).toHaveBeenCalledOnce();
    } finally {
      try { await game?.dispose(); } finally { vi.unstubAllGlobals(); }
    }
  });
});
