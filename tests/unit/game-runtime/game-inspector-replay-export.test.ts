import { describe, expect, it } from "vitest";
import { game, type GameInputReplayEvent } from "../../../packages/engine/src";

describe("game inspector and replay export", () => {
  it("summarizes hierarchy, input, animation, hitboxes, render stats, assets, and errors", () => {
    const inspector = game.inspector();
    const snapshot = inspector.snapshot({
      runtime: {
        frame: 12,
        lifecycle: "running",
        nodes: [
          { id: "player", kind: "model", tags: ["fighter"] },
          { id: "rival", kind: "model", tags: ["fighter", "ai"] }
        ]
      },
      input: {
        activeBindings: ["KeyD"],
        actions: { moveRight: { held: true }, light: { pressed: false } }
      },
      animation: {
        activeState: "walk",
        graph: ["idle->walk", "walk->light"],
        clips: ["Idle", "Walk", "Punch"]
      },
      combat: {
        hitboxes: [{ id: "light-hitbox" }],
        hurtboxes: [{ id: "player-hurtbox" }],
        events: []
      },
      renderer: { backend: "webgl2", drawCalls: 42, frameTimeMs: 6.8 },
      assets: [{ id: "auraClashPlayerRig", status: "ready", url: "/aura-assets/player.glb" }],
      errors: []
    });

    expect(snapshot.kind).toBe("aura-game-inspector-snapshot");
    expect(snapshot.hierarchy.map((node: { readonly id: string }) => node.id)).toEqual(["player", "rival"]);
    expect(snapshot.components).toEqual(["runtime", "input", "animation", "combat", "renderer", "assets", "errors"]);
    expect(snapshot.inputTrace).toEqual(["KeyD", "moveRight", "light"]);
    expect(snapshot.animationGraph).toEqual(["walk", "idle->walk", "walk->light", "Idle", "Walk", "Punch"]);
    expect(snapshot.hitboxes).toEqual([{ id: "light-hitbox" }, { id: "player-hurtbox" }]);
    expect(snapshot.renderStats).toEqual({ backend: "webgl2", drawCalls: 42, frameTimeMs: 6.8 });
    expect(snapshot.assetLoadStatus).toEqual([{ id: "auraClashPlayerRig", status: "ready", url: "/aura-assets/player.glb" }]);
    expect(snapshot.normalModeArtifactFree).toBe(true);
  });

  it("exports and imports deterministic replay artifacts without changing checksums", () => {
    const events: readonly GameInputReplayEvent[] = [
      { frame: 1, time: 1 / 60, type: "press", binding: "KeyD" },
      { frame: 4, time: 4 / 60, type: "press", binding: "KeyK" },
      { frame: 6, time: 6 / 60, type: "release", binding: "KeyD" }
    ];
    const replay = game.inputReplay(events, { fps: 60, seed: 106, label: "full-round-proof" });
    const exported = game.exportReplay(replay, {
      exportedAt: "2026-06-06T00:00:00.000Z",
      simulation: { label: "full-round-proof", finalHash: "hash-123", frameCount: 60, eventCount: 1 }
    });
    const imported = game.importReplay(JSON.stringify(exported));

    expect(exported).toMatchObject({
      kind: "aura-game-input-replay-export",
      schemaVersion: "aura-game-input-replay/v1",
      exportedAt: "2026-06-06T00:00:00.000Z",
      simulation: { finalHash: "hash-123" }
    });
    expect(imported).toEqual(replay);
    expect(game.inputReplayEventsAt(imported, 4)).toEqual([{ frame: 4, time: 4 / 60, type: "press", binding: "KeyK" }]);
  });
});
