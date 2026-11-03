import { describe, expect, it, vi } from "vitest";
import { createGameNamespaceWithPhysicsWorldAccess } from "../../../packages/engine/src/agent-api/nodes/game/index.js";
import { createGamesWithPhysicsWorldAccess, games as legacyGames } from "../../../packages/engine/src/agent-api/nodes/games.js";
import { scene } from "../../../packages/engine/src/agent-api/nodes/scene.js";
import { createGameAppWithPhysicsWorldAccess } from "../../../packages/engine/src/agent-api/app/createGameApp.js";
import { createPhysicsWorldProvider, type PhysicsWorldModule } from "../../../packages/engine/src/agent-api/physics/PhysicsWorldProvider.js";
import { createGameEntryWithPhysicsWorldAccess, C24_GAME_SLOT } from "../../../packages/game/src/index.js";
import * as legacyGameEntry from "../../../packages/game/src/index.js";
import * as sharedGame from "../../../packages/game/src/shared.js";
import { legacyPhysicsWorldAccess } from "../../../packages/engine/src/public/legacy-physics-access.js";

class BackendWorld {}
const backend = { World: BackendWorld, init: async () => {} };

function trackedWorlds(label: string) {
  const worlds: FakeWorld[] = [];
  let failBody = false;
  class FakeWorld {
    readonly label = label;
    readonly fixedDelta = 1 / 60;
    readonly descriptor: unknown;
    disposed = false;
    nextId = 1;
    steps = 0;
    constructor(descriptor: unknown = {}) {
      this.descriptor = descriptor;
      worlds.push(this);
    }
    createRigidBody(options: { position?: readonly number[] }) {
      if (failBody) { failBody = false; throw new Error(`${label} body failed`); }
      return {
        id: this.nextId++, position: [...(options.position ?? [0, 0, 0])], velocity: [0, 0, 0], sleeping: false,
        setVelocity: vi.fn(), setAngularVelocity: vi.fn(), setPosition: vi.fn(), sleep: vi.fn(), wake: vi.fn(), applyImpulse: vi.fn()
      };
    }
    createCollider() { return { id: this.nextId++ }; }
    step() { this.steps += 1; return []; }
    snapshot() { return { backend: { active: label }, stats: { steps: this.steps }, contacts: [] }; }
    dispose() { this.disposed = true; }
  }
  const module = { PhysicsWorld: FakeWorld, ensurePhysics: async () => backend } as unknown as PhysicsWorldModule;
  const provider = createPhysicsWorldProvider(async () => module);
  return { worlds, provider, failNextBody: () => { failBody = true; } };
}

const gameOptions = () => ({ id: "entry-test", target: null, autoStart: false, scene: () => scene() });

describe("entry-bound game physics", () => {
  it("uses the shared 4.x access only when mini-golf creates a world", () => {
    const unavailable = new Error("shared legacy physics access used");
    const requireWorld = vi.spyOn(legacyPhysicsWorldAccess, "requireReady").mockImplementation(() => { throw unavailable; });
    try {
      legacyGames.miniGolfPointerShot({ x: 0, y: 0 }, { x: 0, y: 0 });
      expect(requireWorld).not.toHaveBeenCalled();
      expect(() => legacyGames.createMiniGolfState()).toThrow(unavailable);
      expect(requireWorld).toHaveBeenCalledOnce();
    } finally {
      requireWorld.mockRestore();
    }
  });

  it("keeps two game and mini-golf namespaces independent through construction, reset, and cleanup", async () => {
    const a = trackedWorlds("a"), b = trackedWorlds("b");
    const gameA = createGameNamespaceWithPhysicsWorldAccess(a.provider);
    const gameB = createGameNamespaceWithPhysicsWorldAccess(b.provider);
    const miniA = createGamesWithPhysicsWorldAccess(a.provider);
    const miniB = createGamesWithPhysicsWorldAccess(b.provider);

    expect(gameA.createRuntime({ rules: { gravity: 12 } })).toMatchObject({
      kind: "aura-game-runtime", rules: { gravity: 12 }, loop: { fixedDt: 1 / 60 }
    });
    expect(gameA.rules.fighting2D({ fps: 30 })).toMatchObject({ kind: "aura-game-fighting-2d-rules", fps: 30 });
    expect(() => miniA.createMiniGolfState()).toThrow(/await preloadPhysics/i);
    expect(() => gameB.collisionWorld()).toThrow(/await preloadPhysics/i);
    expect(a.worlds).toHaveLength(0);
    expect(b.worlds).toHaveLength(0);

    // Constructing a legacy game neither preloads nor changes either provider.
    const legacy = legacyGames.createMiniGolfState();
    try {
      expect(() => miniA.createMiniGolfState()).toThrow(/await preloadPhysics/i);
      expect(() => miniB.createMiniGolfState()).toThrow(/await preloadPhysics/i);
    } finally { legacy.dispose(); }

    await a.provider.preload();
    const first = miniA.createMiniGolfState();
    first.shoot();
    const collision = gameA.collisionWorld({ gravity: [0, -2, 0] });
    expect(() => miniB.createMiniGolfState()).toThrow(/await preloadPhysics/i);
    await b.provider.preload();
    const second = miniB.createMiniGolfState();
    const planar = gameB.planarCollisionWorld();
    try {
      expect(a.worlds).toHaveLength(2);
      expect(b.worlds).toHaveLength(2);
      expect(b.worlds[1]!.descriptor).toMatchObject({ gravity: [0, 0, 0] });
      expect(first.snapshot().shots).toBe(1);
      expect(second.snapshot().shots).toBe(0);
      const previousMini = a.worlds[0]!;
      first.reset();
      expect(previousMini.disposed).toBe(true);
      expect(first.snapshot()).toMatchObject({ shots: 0, resets: 1 });
      expect(second.snapshot()).toMatchObject({ shots: 0, resets: 0 });
      expect(b.worlds.every((world) => !world.disposed)).toBe(true);
      const previousCollision = a.worlds[1]!;
      collision.clear();
      expect(previousCollision.disposed).toBe(true);
      expect(a.worlds).toHaveLength(4);
      expect(b.worlds).toHaveLength(2);
      const previousPlanar = b.worlds[1]!;
      planar.clear();
      expect(previousPlanar.disposed).toBe(true);
      expect(b.worlds[2]!.descriptor).toMatchObject({ gravity: [0, 0, 0] });
    } finally {
      first.dispose();
      first.dispose();
      second.dispose();
    }
    expect(a.worlds[2]!.disposed).toBe(true);
    expect(b.worlds[0]!.disposed).toBe(true);
    expect(() => first.reset()).toThrow(/MINI_GOLF_DISPOSED/);
    expect(() => first.snapshot()).toThrow(/MINI_GOLF_DISPOSED/);
  });

  it("preserves the working mini-golf state on provider and partial construction failures", async () => {
    const tracked = trackedWorlds("a");
    await tracked.provider.preload();
    let available = true;
    const access = {
      preload: () => tracked.provider.preload(),
      requireReady: () => {
        if (!available) throw new Error("entry unavailable");
        return tracked.provider.requireReady();
      }
    };
    const mini = createGamesWithPhysicsWorldAccess(access).createMiniGolfState();
    try {
      mini.shoot();
      available = false;
      expect(() => mini.reset()).toThrow("entry unavailable");
      expect(mini.snapshot().shots).toBe(1);
      expect(tracked.worlds).toHaveLength(1);
      expect(tracked.worlds[0]!.disposed).toBe(false);
      available = true;
      tracked.failNextBody();
      expect(() => mini.reset()).toThrow("a body failed");
      expect(tracked.worlds[1]!.disposed).toBe(true);
      expect(tracked.worlds[0]!.disposed).toBe(false);
      expect(mini.snapshot()).toMatchObject({ shots: 1, resets: 0 });
      mini.reset();
      expect(tracked.worlds[0]!.disposed).toBe(true);
      expect(mini.snapshot()).toMatchObject({ shots: 0, resets: 1 });
    } finally { mini.dispose(); }
  });

  it("keeps a failed provider isolated from a ready peer and retains its failure cause", async () => {
    const ready = trackedWorlds("ready");
    let failedConstructions = 0;
    class NeverConstructed { constructor() { failedConstructions += 1; } }
    const original = new Error("physics backend initialization failed");
    const unavailable = createPhysicsWorldProvider(async () => ({
      PhysicsWorld: NeverConstructed,
      ensurePhysics: async () => { throw original; }
    } as unknown as PhysicsWorldModule));
    const rejected = await unavailable.preload().catch((error: unknown) => error);
    expect((rejected as Error).cause).toBe(original);
    await ready.provider.preload();
    const peer = createGamesWithPhysicsWorldAccess(ready.provider).createMiniGolfState();
    try {
      try {
        createGamesWithPhysicsWorldAccess(unavailable).createMiniGolfState();
        expect.fail("The failed provider must not construct a world.");
      } catch (error) {
        expect((error as Error).cause).toBe(rejected);
      }
      expect(failedConstructions).toBe(0);
      expect(peer.snapshot().resets).toBe(0);
      expect(ready.worlds).toHaveLength(1);
    } finally { peer.dispose(); }
  });

  it("creates independent C-24 slots and sends each game to its own provider", async () => {
    const a = trackedWorlds("a"), b = trackedWorlds("b");
    const mount = vi.fn((access: typeof a.provider, target: Parameters<typeof createGameAppWithPhysicsWorldAccess>[1], options: Parameters<typeof createGameAppWithPhysicsWorldAccess>[2]) => {
      access.requireReady();
      return createGameAppWithPhysicsWorldAccess(access, target, options);
    });
    const entryA = createGameEntryWithPhysicsWorldAccess(a.provider, mount);
    const entryB = createGameEntryWithPhysicsWorldAccess(b.provider, mount);
    expect(entryA.C24_GAME_SLOT).not.toBe(entryB.C24_GAME_SLOT);
    expect(entryA.C24_GAME_SLOT).not.toBe(C24_GAME_SLOT);
    expect(entryA.C24_GAME_SLOT.stub).toBe(C24_GAME_SLOT.stub);
    expect(() => entryA.createGame(gameOptions())).toThrow(/await preloadPhysics/i);
    expect(() => entryB.createGame({ ...gameOptions(), qualityRebuild: { flags: ["-game"] } })).toThrow(/CREATE_GAME_ROOT_UNAVAILABLE/);
    expect(mount).toHaveBeenCalledTimes(1);
    await a.provider.preload();
    const first = entryA.createGame(gameOptions());
    expect(mount.mock.calls.at(-1)?.[0]).toBe(a.provider);
    expect(() => entryB.createGame(gameOptions())).toThrow(/await preloadPhysics/i);
    await b.provider.preload();
    const second = entryB.createGame(gameOptions());
    expect(mount.mock.calls.at(-1)?.[0]).toBe(b.provider);
    try {
      first.fx.burst("spark", [0, 0, 0], { count: 3, seed: 1 });
      second.fx.burst("spark", [0, 0, 0], { count: 2, seed: 1 });
      await first.setScene(scene() as never);
      expect(first.fx.liveCount).toBe(0);
      expect(second.fx.liveCount).toBe(2);
    } finally {
      await first.dispose();
      await second.dispose();
    }
    expect(first.session.state).toBe("disposed");
    expect(second.session.state).toBe("disposed");
  });
});

describe("solver-independent game leaves", () => {
  it("preserves every shared runtime export's legacy identity", () => {
    const legacy = legacyGameEntry as unknown as Record<string, unknown>;
    const shared = sharedGame as unknown as Record<string, unknown>;
    for (const [name, value] of Object.entries(shared)) expect(legacy[name], name).toBe(value);
    expect(Object.keys(shared).length).toBeGreaterThan(0);
  });

  it("imports the mini-golf core without evaluating the legacy physics world", async () => {
    const touched = vi.fn();
    vi.resetModules();
    vi.doMock("@aura3d/physics/world", () => { touched(); throw new Error("legacy world evaluated"); });
    try {
      const core = await import("../../../packages/engine/src/agent-api/nodes/games-core.js");
      const tracked = trackedWorlds("core");
      const bindings = {
        layout: { ballStart: [0, 0, 0], cupCenter: [1, 0, 0], obstacleCenter: [2, 0, 0], aimVector: [1, 0, 0] },
        prefabs: { miniGolfHole: () => [], miniGolfCourse: () => [] },
        scene: () => undefined, camera: {}, lights: {}, timeline: {}, fightingGameKit: {}, createFightingGameKit: () => undefined
      } as never;
      const mini = core.createGamesWithPhysicsWorldAccess(tracked.provider, bindings);
      expect(() => mini.createMiniGolfState()).toThrow(/await preloadPhysics/i);
      await tracked.provider.preload();
      const state = mini.createMiniGolfState();
      state.reset();
      state.dispose();
      expect(tracked.worlds).toHaveLength(2);
      expect(tracked.worlds.every((world) => world.disposed)).toBe(true);
      expect(touched).not.toHaveBeenCalled();
    } finally {
      vi.doUnmock("@aura3d/physics/world");
      vi.resetModules();
    }
  });

  it("imports the game entry core without legacy bootstraps and retains per-entry access", async () => {
    const worldTouched = vi.fn(), rootTouched = vi.fn();
    vi.resetModules();
    vi.doMock("@aura3d/physics/world", () => { worldTouched(); throw new Error("legacy world evaluated"); });
    vi.doMock("@aura3d/engine", () => { rootTouched(); throw new Error("legacy engine evaluated"); });
    try {
      const core = await import("../../../packages/game/src/gameCore.js");
      const shared = await import("../../../packages/game/src/shared.js");
      expect(typeof shared.createJuice).toBe("function");
      expect(typeof shared.runMotionGate).toBe("function");
      const bridge = await import("@aura3d/engine/v5/internal");
      const a = trackedWorlds("a"), b = trackedWorlds("b");
      const mounted = new Error("entry mounted");
      const mount = vi.fn((access: typeof a.provider) => { access.requireReady(); throw mounted; });
      const bindings = { ...bridge, stubCreateGame: bridge.createGame };
      const entryA = core.createGameEntryWithPhysicsWorldAccess(a.provider, mount, bindings);
      const entryB = core.createGameEntryWithPhysicsWorldAccess(b.provider, mount, bindings);
      expect(entryA.C24_GAME_SLOT).not.toBe(entryB.C24_GAME_SLOT);
      expect(() => entryA.createGame(gameOptions())).toThrow(/await preloadPhysics/i);
      await a.provider.preload();
      expect(() => entryA.createGame(gameOptions())).toThrow(mounted);
      expect(mount.mock.calls.at(-1)?.[0]).toBe(a.provider);
      expect(() => entryB.createGame(gameOptions())).toThrow(/await preloadPhysics/i);
      expect(() => entryB.createGame({ ...gameOptions(), qualityRebuild: { flags: ["-game"] } })).toThrow(/CREATE_GAME_ROOT_UNAVAILABLE/);
      expect(worldTouched).not.toHaveBeenCalled();
      expect(rootTouched).not.toHaveBeenCalled();
    } finally {
      vi.doUnmock("@aura3d/engine");
      vi.doUnmock("@aura3d/physics/world");
      vi.resetModules();
    }
  });
});
