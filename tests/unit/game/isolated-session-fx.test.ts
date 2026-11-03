import { describe, expect, it, vi } from "vitest";

describe("provider-neutral session and FX pool cores", () => {
  it("preserves the established exports and behavior without loading legacy physics", async () => {
    const legacyRoot = vi.fn();
    const physicsWorld = vi.fn();
    const optionalBackend = vi.fn();
    vi.resetModules();
    vi.doMock("@aura3d/engine", () => { legacyRoot(); throw new Error("legacy root evaluated"); });
    vi.doMock("@aura3d/physics/world", () => { physicsWorld(); throw new Error("physics world evaluated"); });
    vi.doMock("@aura3d/physics", () => { physicsWorld(); throw new Error("physics package evaluated"); });
    vi.doMock("@aura3d/physics-rapier", () => { optionalBackend(); throw new Error("optional physics evaluated"); });
    vi.doMock("@dimforge/rapier3d-compat", () => { optionalBackend(); throw new Error("optional backend evaluated"); });
    try {
      const sessionCore = await import("../../../packages/game/src/session/GameSessionCore.js");
      const sessionEntry = await import("../../../packages/game/src/session/GameSession.js");
      const fxCore = await import("../../../packages/game/src/juice/fxPoolLayerCore.js");
      const fxEntry = await import("../../../packages/game/src/juice/fxPoolLayer.js");
      const bridge = await import("@aura3d/engine/v5/internal");

      expect(sessionEntry.GameSessionImpl).toBe(sessionCore.GameSessionImpl);
      expect(fxEntry.createPoolFxLayer).toBe(fxCore.createPoolFxLayer);
      expect(fxEntry.withFxPool).toBe(fxCore.withFxPool);

      const session = new sessionCore.GameSessionImpl({ seed: 19 });
      session.transition("loading");
      session.transition("playing");
      session.hitStop(0.05, { actors: ["player"] });
      expect(session.scaledDt(0.02, "player")).toBe(0);
      expect(session.scaledDt(0.02, "other")).toBe(0.02);
      session.tick(0.06);
      expect(session.isFrozen("player")).toBe(false);
      expect(session.simTime).toBeCloseTo(0.06);

      const scene = bridge.normalizeSceneSnapshot(bridge.scene());
      const decorated = fxCore.withFxPool(scene);
      expect(decorated.nodes).toHaveLength(scene.nodes.length + 10);
      expect(fxCore.withFxPool(decorated)).toBe(decorated);
      const writes: number[] = [];
      const visibility: boolean[] = [];
      const fx = fxCore.createPoolFxLayer({
        node: () => ({
          setInstanceTransforms: (_matrices, count) => { writes.push(count); },
          setVisible: (visible) => { visibility.push(visible); }
        }),
        seed: 1
      });
      fx.burst("spark", [0, 0, 0], { count: 2, seed: 4 });
      fx.tick(0);
      expect(fx.liveCount).toBe(2);
      fx.tick(0.01);
      expect(writes.at(-1)).toBe(2);
      fx.tick(1);
      expect(fx.liveCount).toBe(0);
      expect(writes.at(-1)).toBe(0);
      expect(visibility.at(-1)).toBe(false);

      expect(legacyRoot).not.toHaveBeenCalled();
      expect(physicsWorld).not.toHaveBeenCalled();
      expect(optionalBackend).not.toHaveBeenCalled();
    } finally {
      vi.doUnmock("@aura3d/engine");
      vi.doUnmock("@aura3d/physics/world");
      vi.doUnmock("@aura3d/physics");
      vi.doUnmock("@aura3d/physics-rapier");
      vi.doUnmock("@dimforge/rapier3d-compat");
      vi.resetModules();
    }
  });
});
