import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createAuraApp, createGameApp, defineAuraAssets, game, lights, model, scene, solvePlatformerMotion } from "../../../packages/engine/src";

type PackageJson = {
  readonly scripts?: Record<string, string>;
};

const assets = defineAuraAssets({
  fighter: {
    type: "model",
    format: "glb",
    url: "/aura-assets/fighter.12345678.glb",
    bounds: [1, 2, 1],
    hash: "sha256-fighter"
  }
} as const);


/**
 * Motion for a fixture level, derived from its own platforms.
 *
 * Fixtures previously inherited the kit's default gravity and jump velocity, which the
 * motion validator now rejects for real reasons: on these layouts the default jump
 * overshoots the tallest step by up to 7.7x *and* cannot clear the widest gap. Both were
 * true before; nothing compared the numbers. Deriving them makes each fixture a level that
 * could actually be played.
 */
function fixtureMotion(platforms: readonly { readonly id: string; readonly x: number; readonly y: number; readonly width: number; readonly height: number }[]) {
  const motion = solvePlatformerMotion(platforms, { riseSeconds: 0.28, targetSessionSeconds: 120 });
  return { gravity: motion.gravity, jumpVelocity: motion.jumpVelocity, moveSpeed: motion.moveSpeed };
}

describe("game runtime source gates", () => {
  it("moves a typed model runtime node through the frame loop without scene recreation", () => {
    const app = createAuraApp(null, {
      autoStart: false,
      scene: scene()
        .add(
          model(assets.fighter, { name: "typed fighter" })
            .position(0, 1, 0)
            .runtime(game.runtimeNode("player", { tags: ["fighter", "typed-glb"] }))
        )
        .add(lights.studio())
    });
    const player = app.nodes.require("player");
    const frames: number[] = [];

    app.onFrame(({ dt, frame }) => {
      frames.push(frame);
      player.translate(dt * 2, 0, 0);
    });

    app.step(0.25);
    app.step(0.25);

    expect(frames).toEqual([1, 2]);
    expect(app.nodes.ids()).toEqual(["player"]);
    expect(app.nodes.require("player").snapshot()).toMatchObject({
      id: "player",
      kind: "model",
      tags: ["fighter", "typed-glb"],
      position: [1, 1, 0]
    });

    app.dispose();
  });

  it("replays recorded attack input into combat hit resolution", () => {
    const createInput = () =>
      game.input({
        actions: {
          light: ["KeyJ"],
          guard: ["KeyK"]
        },
        autoListen: false
      });
    const recorder = createInput();

    recorder.press("KeyJ");
    const recorded = recorder.update(1 / 60);

    expect(recorded.actions.light).toMatchObject({ pressed: true, held: true });

    const replay = createInput();
    const replayed = replay.replay(recorder.recorded());
    const combat = game.combatWorld();

    combat.addActor({ id: "player", team: "p1", position: [0, 0, 0], facing: 1 });
    combat.addActor({ id: "rival", team: "p2", position: [0.8, 0, 0], facing: -1, health: 100 });

    if (replayed.actions.light.pressed) {
      combat.beginAttack("player", {
        id: "replayed-light",
        damage: 12,
        hitStun: 8,
        activeFrames: [1, 1],
        durationFrames: 4,
        hitboxes: [{ id: "replay-jab", offset: [0.7, 0.85, 0], size: [0.42, 0.42, 0.42] }]
      });
    }

    const resolved = combat.update(1 / 60);
    const rival = resolved.actors.find((actor) => actor.id === "rival");

    expect(replayed.actions.light).toMatchObject({ pressed: true, held: true });
    expect(resolved.events).toEqual([
      expect.objectContaining({ type: "hit", attackerId: "player", targetId: "rival", moveId: "replayed-light", damage: 12 })
    ]);
    expect(rival?.health).toBe(88);

    recorder.dispose();
    replay.dispose();
  });

  it("exposes a generic collision world with sensor events, tags, and layer filters", () => {
    const collision = game.collisionWorld({ backend: "rapier", gravity: [0, 0, 0] });

    collision.addBox("player", [0.5, 0.5, 0.5], {
      position: [0, 0, 0],
      tags: ["player"],
      layer: 0b001,
      mask: 0b010
    });
    collision.addSphere("coin", 0.35, {
      position: [0.75, 0, 0],
      sensor: true,
      tags: ["coin", "collectible"],
      layer: 0b010,
      mask: 0b001
    });

    const begin = collision.step(1 / 60);
    expect(begin).toEqual([
      expect.objectContaining({
        kind: "aura-game-collision-contact",
        type: "begin",
        sensor: true,
        a: expect.objectContaining({ id: "player", tags: ["player"], layer: 0b001 }),
        b: expect.objectContaining({ id: "coin", tags: ["coin", "collectible"], layer: 0b010 })
      })
    ]);
    expect(collision.overlaps({ tags: ["coin"] })).toHaveLength(1);
    expect(collision.overlaps({ layerMask: 0b010 })).toHaveLength(1);
    expect(collision.overlaps({ layerMask: 0b100 })).toHaveLength(0);
    expect(collision.events({ includeSensors: false })).toHaveLength(0);

    expect(collision.step(1 / 60).map((event) => event.type)).toEqual(["stay"]);

    collision.require("coin").setPosition([4, 0, 0]);
    expect(collision.step(1 / 60).map((event) => event.type)).toEqual(["end"]);
  });

  it("supports collision sweeps and explicit solid resolution through the public game facade", () => {
    const collision = game.collisionWorld({ backend: "rapier", gravity: [0, 0, 0] });

    collision.addBox("player", [0.5, 0.5, 0.5], {
      position: [0, 0, 0],
      tags: ["player"],
      layer: 0b001,
      mask: 0b010
    });
    collision.addBox("wall", [0.5, 0.5, 0.5], {
      type: "static",
      position: [2, 0, 0],
      tags: ["wall", "solid"],
      layer: 0b010,
      mask: 0b001
    });

    expect(collision.sweep("player", [1, 0, 0], 4, { radius: 0.45, tags: ["solid"] })).toEqual([
      expect.objectContaining({
        kind: "aura-game-collision-sweep-hit",
        source: expect.objectContaining({ id: "player" }),
        target: expect.objectContaining({ id: "wall", tags: ["wall", "solid"] }),
        distance: expect.any(Number)
      })
    ]);
    expect(collision.sweep("player", [1, 0, 0], 4, { radius: 0.45, mask: 0b100 })).toHaveLength(0);

    collision.require("wall").setPosition([0.75, 0, 0]);
    collision.step(1 / 60);
    expect(collision.overlaps({ includeSensors: false })).toHaveLength(1);

    const before = collision.require("player").position;
    const resolved = collision.resolve("player", { tags: ["solid"] });
    expect(resolved.position[0]).toBeLessThan(before[0]);
  });

  it("publishes generic game HUD, event-log, and collision evidence without fighting-only warnings", () => {
    const app = createAuraApp(null, {
      autoStart: false,
      scene: scene().add(
        model(assets.fighter, { name: "generic player" })
          .runtime(game.runtimeNode("player", { tags: ["player"] }))
      )
    });
    const collision = game.collisionWorld({ backend: "rapier", gravity: [0, 0, 0] });
    const events = game.eventLog({ label: "platformer events" });
    const player = collision.addBox("player", [0.5, 0.5, 0.5], { tags: ["player"], layer: 0b001, mask: 0b010 });
    collision.addSphere("coin", 0.35, { position: [0.7, 0, 0], sensor: true, tags: ["coin"], layer: 0b010, mask: 0b001 });

    collision.step(1 / 60);
    events.push({ type: "coin", label: "Coin collected", targetId: "coin", value: 100, tags: ["score"], severity: "success", frame: 1, time: 1 / 60 });
    player.translate([0.1, 0, 0]);
    app.step(1 / 60);

    const hud = game.hud.bindings([
      game.hud.score(),
      game.hud.objective(),
      game.hud.eventLog()
    ]);

    const evidence = app.evidence({
      collisionWorld: collision,
      events,
      hud,
      appState: {
        score: 100,
        objective: "Collect all coins",
        events: "Coin collected"
      },
      source: { expectsGame: true }
    });

    expect(evidence.systems.collisionPlan).toBe(true);
    expect(evidence.collision).toMatchObject({
      collisionWorld: true,
      combatWorld: false,
      bodies: 2,
      contacts: 1,
      sensorContacts: 1
    });
    expect(evidence.events).toMatchObject({
      configured: true,
      count: 1,
      types: ["coin"],
      last: expect.objectContaining({ type: "coin", label: "Coin collected", severity: "success" })
    });
    expect(evidence.hud).toMatchObject({
      bindings: 3,
      kinds: ["event-log", "objective", "score"],
      warnings: []
    });

    app.dispose();
  });

  it("provides reusable platformer mechanics for jump, collect, checkpoint, hazard, and finish state", () => {
    const platformer = game.platformer({
      id: "unit-platformer",
      start: { x: 0, y: 0.35 },
      finish: { x: 1.25, y: 0.35 },
      platforms: [{ id: "ground", x: -0.5, y: 0, width: 2.5, height: 0.35 }],
      movingPlatforms: [{ id: "lift", x: 0.65, y: 0.75, width: 0.5, height: 0.16, axis: "y", amplitude: 0.08, period: 1.2 }],
      collectibles: [{ id: "coin", x: 0.55, y: 0.9, value: 50, radius: 0.75 }],
      checkpoints: [{ id: "mid", x: 0.75, y: 0.8, radius: 1.1 }],
      moveSpeed: 4.6,
      jumpVelocity: 7.2
    });

    expect(platformer.step(1 / 60).player.grounded).toBe(true);
    expect(platformer.step(1 / 60, { jumpPressed: true }).events.map((event) => event.type)).toContain("jump");

    let snapshot = platformer.snapshot();
    for (let frame = 0; frame < 80 && snapshot.status !== "completed"; frame += 1) {
      snapshot = platformer.step(1 / 60, { moveX: 1, jumpHeld: true });
    }

    expect(snapshot.collected).toContain("coin");
    expect(snapshot.activatedCheckpoints).toContain("mid");
    expect(snapshot.status).toBe("completed");
    expect(snapshot.score).toBeGreaterThanOrEqual(50);

    const hazard = game.platformer({
      id: "unit-platformer-hazard",
      start: { x: 0, y: 0.35 },
      platforms: [{ id: "ground", x: -1, y: 0, width: 2, height: 0.35 }],
      hazards: [{ id: "spikes", x: -0.3, y: 0.35, width: 0.6, height: 0.25 }]
    }).step(1 / 60);

    expect(hazard.deaths).toBe(1);
    expect(hazard.events.map((event) => event.type)).toEqual(expect.arrayContaining(["hazard", "respawn"]));
  });

  it("requires public platformer examples to bind playable surfaces to typed world assets", () => {
    const level = game.assetBoundPlatformerLevel({
      characterAsset: "showcaseWalkAnimatedGirl",
      worldAssetBindings: [
        { worldAsset: "showcaseSideScrollerWorld", surfaceIds: ["start", "bridge", "mid", "upper", "far"] }
      ],
      minPlayableSeconds: 30,
      // Stated because derived motion makes raw traversal shorter than the floor; a real
      // session including jumps, retries and collection lasts far longer.
      authoredPlayableSeconds: 120,
      minCheckpoints: 3,
      minSurfaceCount: 5,
      level: {
        id: "asset-bound-platformer",
        start: { x: 0, y: 0.35 },
        finish: { x: 36, y: 0.35 },
        // Motion comes from fixtureMotion below, derived from these platforms. A literal
        // here was silently overridden by the spread and is removed rather than kept.
        ...fixtureMotion([
          { id: "start", x: 0, y: 0, width: 8, height: 0.35 },
          { id: "bridge", x: 8, y: 0.2, width: 8, height: 0.35 },
          { id: "mid", x: 16, y: 0.35, width: 8, height: 0.35 },
          { id: "upper", x: 24, y: 0.55, width: 5.5, height: 0.32 },
          { id: "far", x: 31, y: 0.15, width: 7, height: 0.35 }
        ]),
        platforms: [
          { id: "start", x: 0, y: 0, width: 8, height: 0.35 },
          { id: "bridge", x: 8, y: 0.2, width: 8, height: 0.35 },
          { id: "mid", x: 16, y: 0.35, width: 8, height: 0.35 },
          { id: "upper", x: 24, y: 0.55, width: 5.5, height: 0.32 },
          { id: "far", x: 31, y: 0.15, width: 7, height: 0.35 }
        ],
        checkpoints: [
          { id: "first", x: 8, y: 0.7 },
          { id: "second", x: 18, y: 0.85 },
          { id: "finish", x: 34, y: 0.5 }
        ]
      }
    });

    expect(level.assetBinding).toMatchObject({
      kind: "aura-game-asset-bound-platformer-level",
      layoutContractVersion: "1.0",
      characterAsset: "showcaseWalkAnimatedGirl",
      worldAssets: ["showcaseSideScrollerWorld"],
      // Stated by the fixture rather than derived from traversal, because derived motion
      // makes raw traversal shorter than the 30s floor.
      authoredPlayableSeconds: 120,
      surfaceCount: 5,
      checkpointCount: 3
    });
    expect(() => game.assetBoundPlatformerLevel({
      characterAsset: "showcaseWalkAnimatedGirl",
      worldAssetBindings: [
        { worldAsset: "showcaseSideScrollerWorld", surfaceIds: ["start"] }
      ],
      // Carried through so the negative case isolates the world-binding failure. Without
      // it the level fails the duration floor first and the assertion measures the wrong
      // check.
      authoredPlayableSeconds: 120,
      level
    })).toThrow(/surface bridge is not bound to a world asset/);
  });

  it("rejects public platformer world offsets that detach playable surfaces from retained overlay evidence", () => {
    const playableSurfaceMap = {
      assetId: "showcaseSideScrollerWorld",
      assetHash: "sha256-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      source: "manifest-authored-overlay-validated",
      surfaces: [
        { id: "start", x: 3, y: 0, width: 6, height: 0.35, kind: "ground" },
        { id: "bridge", x: 10, y: 0.2, width: 6, height: 0.35, kind: "platform" },
        { id: "mid", x: 17, y: 0.35, width: 6, height: 0.35, kind: "platform" },
        { id: "upper", x: 23, y: 0.55, width: 5.5, height: 0.32, kind: "platform" },
        { id: "far", x: 29, y: 0.15, width: 7, height: 0.35, kind: "platform" },
        { id: "finish", x: 28, y: 0.15, width: 10, height: 0.35, kind: "finish" }
      ],
      levelLength: 34,
      estimatedCompletionSeconds: 34,
      characterScaleRatio: 0.52,
      confidence: 0.9,
      modelAlignment: {
        source: "manifest-authored-overlay-validated",
        modelBounds: {
          min: [-10, -1, -1],
          max: [10, 3, 1]
        },
        modelPoint: [0, -1, 0],
        gamePoint: { x: 17, y: 0 },
        evidence: {
          routeOverlay: "tests/reports/showcase-route-primary-probes/showcase-skyline-runner.png",
          notes: "Unit-test anchor binds the retained world model to the playable surface coordinate space."
        }
      },
      evidence: {
        sourceAsset: "assets.showcaseSideScrollerWorld",
        routeOverlay: "tests/reports/showcase-route-primary-probes/showcase-skyline-runner.png",
        notes: "unit test overlay"
      }
    } as const;
    const level = game.assetBoundPlatformerLevel({
      characterAsset: "showcaseWalkAnimatedGirl",
      worldAssetBindings: [
        {
          worldAsset: "showcaseSideScrollerWorld",
          worldAssetHash: playableSurfaceMap.assetHash,
          surfaceIds: ["start", "bridge", "mid", "upper", "far"]
        }
      ],
      playableSurfaceMap,
      minPlayableSeconds: 30,
      // Stated because derived motion makes raw traversal shorter than the floor; a real
      // session including jumps, retries and collection lasts far longer.
      authoredPlayableSeconds: 120,
      minCheckpoints: 3,
      minSurfaceCount: 5,
      level: {
        id: "asset-bound-platformer-offset",
        start: { x: 0, y: 0.35 },
        finish: { x: 34, y: 0.35 },
        // Motion comes from fixtureMotion below, derived from these platforms. A literal
        // here was silently overridden by the spread and is removed rather than kept.
        ...fixtureMotion([
          { id: "start", x: 0, y: 0, width: 6, height: 0.35 },
          { id: "bridge", x: 7, y: 0.2, width: 6, height: 0.35 },
          { id: "mid", x: 14, y: 0.35, width: 6, height: 0.35 },
          { id: "upper", x: 20.25, y: 0.55, width: 5.5, height: 0.32 },
          { id: "far", x: 25.5, y: 0.15, width: 7, height: 0.35 }
        ]),
        ...fixtureMotion([
          { id: "start", x: 0, y: 0, width: 6, height: 0.35 },
          { id: "bridge", x: 7, y: 0.2, width: 6, height: 0.35 },
          { id: "mid", x: 14, y: 0.35, width: 6, height: 0.35 },
          { id: "upper", x: 20.25, y: 0.55, width: 5.5, height: 0.32 },
          { id: "far", x: 25.5, y: 0.15, width: 7, height: 0.35 }
        ]),
        platforms: [
          { id: "start", x: 0, y: 0, width: 6, height: 0.35 },
          { id: "bridge", x: 7, y: 0.2, width: 6, height: 0.35 },
          { id: "mid", x: 14, y: 0.35, width: 6, height: 0.35 },
          { id: "upper", x: 20.25, y: 0.55, width: 5.5, height: 0.32 },
          { id: "far", x: 25.5, y: 0.15, width: 7, height: 0.35 }
        ],
        checkpoints: [
          { id: "first", x: 8, y: 0.7 },
          { id: "second", x: 18, y: 0.85 },
          { id: "finish", x: 32, y: 0.5 }
        ]
      }
    });
    const base = game.platformerSceneBinding({
      surfaceMap: playableSurfaceMap,
      level,
      worldAsset: "showcaseSideScrollerWorld",
      targetSceneWidth: 4,
      worldY: -0.8,
      worldZ: -0.3,
      playerZ: 0.4,
      playerYOffset: 0.08
    });

    expect(base.evidence.modelSceneOffset).toEqual({ x: 0, y: 0, z: 0 });
    expect(base.evidence.playerTargetHeight).toBeGreaterThan(0);
    expect(base.worldModel.anchorFit).toMatchObject({
      mode: "single-anchor",
      anchorCount: 1,
      averageError: null,
      maxError: null
    });
    expect(() =>
      game.platformerSceneBinding({
        surfaceMap: playableSurfaceMap,
        level,
        worldAsset: "showcaseSideScrollerWorld",
        targetSceneWidth: 4,
        worldModelSceneOffset: { x: -0.35, y: 0.16, z: 0.5 },
        worldY: -0.8,
        worldZ: -0.3,
        playerZ: 0.4,
        playerYOffset: 0.08
      })
    ).toThrow(/worldModelSceneOffset/);
    expect(() =>
      game.platformerSceneBinding({
        surfaceMap: playableSurfaceMap,
        level,
        worldAsset: "showcaseSideScrollerWorld",
        targetSceneWidth: 4,
        worldModelPresentationOffset: { x: 0.22, y: 0, z: -0.18 },
        worldY: -0.8,
        worldZ: -0.3,
        playerZ: 0.4,
        playerYOffset: 0.08
      })
    ).toThrow(/presentation offsets decouple/);
  });

  it("records multi-anchor platformer world fit evidence instead of relying on one surface anchor", () => {
    const playableSurfaceMap = {
      assetId: "showcaseSideScrollerWorld",
      assetHash: "sha256-cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      source: "manifest-authored-overlay-validated",
      surfaces: [
        { id: "start", x: 3, y: 0, width: 6, height: 0.35, kind: "ground" },
        { id: "bridge", x: 11, y: 0.2, width: 6, height: 0.35, kind: "platform" },
        { id: "mid", x: 19, y: 0.3, width: 6, height: 0.35, kind: "platform" },
        { id: "upper", x: 25, y: 0.5, width: 5, height: 0.32, kind: "platform" },
        { id: "far", x: 31, y: 0.1, width: 6, height: 0.35, kind: "platform" },
        { id: "finish", x: 29, y: 0.1, width: 8, height: 0.35, kind: "finish" },
        { id: "checkpoint-01", x: 16, y: 0.8, width: 1, height: 1, kind: "checkpoint" }
      ],
      levelLength: 34,
      estimatedCompletionSeconds: 36,
      characterScaleRatio: 0.52,
      confidence: 0.9,
      modelAlignment: {
        source: "manifest-authored-overlay-validated",
        modelBounds: { min: [-20, -1, -1], max: [20, 5, 1] },
        modelPoint: [0, -1, 0],
        gamePoint: { x: 16, y: 0 },
        anchorPairs: [
          { id: "start-left", modelPoint: [-20, -1, 0], gamePoint: { x: 0, y: 0 } },
          { id: "finish-right", modelPoint: [20, -1, 0], gamePoint: { x: 33, y: 0 } }
        ],
        evidence: {
          routeOverlay: "tests/reports/showcase-route-primary-probes/showcase-skyline-runner.png",
          notes: "Unit-test anchor pair binds both ends of the retained world model to the platformer route."
        }
      },
      evidence: {
        sourceAsset: "assets.showcaseSideScrollerWorld",
        routeOverlay: "tests/reports/showcase-route-primary-probes/showcase-skyline-runner.png",
        notes: "unit test overlay"
      }
    } as const;
    const level = game.assetBoundPlatformerLevel({
      characterAsset: "showcaseWalkAnimatedGirl",
      worldAssetBindings: [
        {
          worldAsset: "showcaseSideScrollerWorld",
          worldAssetHash: playableSurfaceMap.assetHash,
          surfaceIds: ["start", "bridge", "mid", "upper", "far"]
        }
      ],
      playableSurfaceMap,
      minPlayableSeconds: 30,
      minCheckpoints: 1,
      // Stated because derived motion shortens raw traversal below the floor.
      authoredPlayableSeconds: 120,
      minSurfaceCount: 5,
      level: {
        id: "asset-bound-platformer-multi-anchor",
        start: { x: 0, y: 0.35 },
        finish: { x: 34, y: 0.35 },
        // Motion comes from fixtureMotion below, derived from these platforms. A literal
        // here was silently overridden by the spread and is removed rather than kept.
        ...fixtureMotion([
          { id: "start", x: 0, y: 0, width: 6, height: 0.35 },
          { id: "bridge", x: 8, y: 0.2, width: 6, height: 0.35 },
          { id: "mid", x: 16, y: 0.3, width: 6, height: 0.35 },
          { id: "upper", x: 22.5, y: 0.5, width: 5, height: 0.32 },
          { id: "far", x: 28, y: 0.1, width: 6, height: 0.35 }
        ]),
        platforms: [
          { id: "start", x: 0, y: 0, width: 6, height: 0.35 },
          { id: "bridge", x: 8, y: 0.2, width: 6, height: 0.35 },
          { id: "mid", x: 16, y: 0.3, width: 6, height: 0.35 },
          { id: "upper", x: 22.5, y: 0.5, width: 5, height: 0.32 },
          { id: "far", x: 28, y: 0.1, width: 6, height: 0.35 }
        ],
        checkpoints: [{ id: "checkpoint-01", x: 16, y: 0.8 }]
      }
    });

    const binding = game.platformerSceneBinding({ surfaceMap: playableSurfaceMap, level, worldAsset: "showcaseSideScrollerWorld", targetSceneWidth: 4 });

    expect(binding.worldModel.anchorFit.mode).toBe("multi-anchor-plane-fit");
    expect(binding.worldModel.anchorFit.anchorCount).toBe(2);
    expect(binding.worldModel.anchorFit.averageError).toBeLessThan(0.1);
    expect(binding.evidence.modelAlignment.rotation).toEqual(binding.worldModel.rotation);

    const misalignedSurfaceMap = {
      ...playableSurfaceMap,
      modelAlignment: {
        ...playableSurfaceMap.modelAlignment,
        anchorPairs: [
          ...playableSurfaceMap.modelAlignment.anchorPairs,
          { id: "misaligned-far-roof", modelPoint: [0, 5, 0], gamePoint: { x: 120, y: 8 } }
        ]
      }
    } as const;

    expect(() =>
      game.platformerSceneBinding({
        surfaceMap: misalignedSurfaceMap,
        level,
        worldAsset: "showcaseSideScrollerWorld",
        targetSceneWidth: 4
      })
    ).toThrow(/asset geometry is not scene-bound to game geometry/);
  });

  it("rejects synthetic platformer markers as public playable surfaces", () => {
    const playableSurfaceMap = {
      assetId: "showcaseSideScrollerWorld",
      assetHash: "sha256-dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
      source: "manifest-authored-overlay-validated",
      surfaces: [
        { id: "start", x: 3, y: 0, width: 6, height: 0.35, kind: "ground" },
        { id: "bridge", x: 11, y: 0.2, width: 6, height: 0.35, kind: "platform" },
        { id: "mid", x: 19, y: 0.3, width: 6, height: 0.35, kind: "platform" },
        { id: "finish", x: 29, y: 0.1, width: 8, height: 0.35, kind: "finish" },
        { id: "checkpoint-01", x: 16, y: 0.8, width: 1, height: 1, kind: "checkpoint" },
        { id: "hazard-01", x: 21, y: 0.12, width: 1, height: 0.3, kind: "hazard" }
      ],
      levelLength: 34,
      estimatedCompletionSeconds: 36,
      characterScaleRatio: 0.52,
      confidence: 0.9,
      modelAlignment: {
        source: "manifest-authored-overlay-validated",
        modelBounds: { min: [-20, -1, -1], max: [20, 5, 1] },
        modelPoint: [0, -1, 0],
        gamePoint: { x: 16, y: 0 },
        evidence: {
          routeOverlay: "tests/reports/showcase-route-primary-probes/showcase-skyline-runner.png",
          notes: "Unit-test map has only three actual platform/ground surfaces; markers do not count."
        }
      },
      evidence: {
        sourceAsset: "assets.showcaseSideScrollerWorld",
        routeOverlay: "tests/reports/showcase-route-primary-probes/showcase-skyline-runner.png",
        notes: "unit test overlay"
      }
    } as const;

    expect(() =>
      game.assetBoundPlatformerLevel({
        characterAsset: "showcaseWalkAnimatedGirl",
        worldAssetBindings: [
          {
            worldAsset: "showcaseSideScrollerWorld",
            worldAssetHash: playableSurfaceMap.assetHash,
            surfaceIds: ["start", "bridge", "mid", "finish", "checkpoint-01"]
          }
        ],
        playableSurfaceMap,
        minPlayableSeconds: 30,
        minCheckpoints: 1,
        // Stated because derived motion shortens raw traversal below the floor.
        authoredPlayableSeconds: 120,
        minSurfaceCount: 5,
        level: {
          id: "asset-bound-platformer-synthetic-markers",
          start: { x: 0, y: 0.35 },
          finish: { x: 34, y: 0.35 },
          // Motion comes from fixtureMotion below, derived from these platforms. A literal
          // here was silently overridden by the spread and is removed rather than kept.
          ...fixtureMotion([
            { id: "start", x: 0, y: 0, width: 6, height: 0.35 },
            { id: "bridge", x: 8, y: 0.2, width: 6, height: 0.35 },
            { id: "mid", x: 16, y: 0.3, width: 6, height: 0.35 },
            { id: "finish", x: 25, y: 0.1, width: 8, height: 0.35 },
            { id: "checkpoint-01", x: 16, y: 0.8, width: 1, height: 1 }
          ]),
          platforms: [
            { id: "start", x: 0, y: 0, width: 6, height: 0.35 },
            { id: "bridge", x: 8, y: 0.2, width: 6, height: 0.35 },
            { id: "mid", x: 16, y: 0.3, width: 6, height: 0.35 },
            { id: "finish", x: 25, y: 0.1, width: 8, height: 0.35 },
            { id: "checkpoint-01", x: 16, y: 0.8, width: 1, height: 1 }
          ],
          checkpoints: [{ id: "checkpoint-01", x: 16, y: 0.8 }]
        }
      })
    ).toThrow(/requires at least five ground\/platform\/moving surfaces/);
  });

  it("provides reusable racing mechanics for throttle, steering, checkpoint order, lap validation, and camera follow", () => {
    const racing = game.racing({
      route: {
        id: "unit-race",
        width: 2,
        points: [
          { x: 0, y: 0 },
          { x: 4, y: 0 },
          { x: 4, y: 4 },
          { x: 0, y: 4 }
        ],
        checkpoints: [0.01]
      },
      startProgress: 0.98,
      checkpointRadius: 0.08,
      lapsToWin: 1
    });

    const initialHeading = racing.snapshot().heading;
    const accelerated = racing.step(1 / 10, { throttle: true, steer: 1, drift: true });
    expect(accelerated.speed).toBeGreaterThan(0);
    expect(accelerated.heading).not.toBe(initialHeading);
    expect(racing.camera()).toMatchObject({ kind: "aura-game-racing-camera", fov: 48 });

    let snapshot = accelerated;
    for (let frame = 0; frame < 180 && snapshot.status !== "finished"; frame += 1) {
      snapshot = racing.step(1 / 30, { throttle: true });
    }

    expect(snapshot.events.map((event) => event.type)).toEqual(expect.arrayContaining(["checkpoint", "lap", "finish"]));
    expect(snapshot.bestTime).toBeGreaterThan(0);
    expect(snapshot.status).toBe("finished");

    const wrongOrder = game.racing({
      route: {
        points: [
          { x: 0, y: 0 },
          { x: 4, y: 0 },
          { x: 4, y: 4 },
          { x: 0, y: 4 }
        ],
        checkpoints: [0.5, 0.75]
      },
      checkpointRadius: 0.04
    });
    wrongOrder.placeAtProgress(0.75);
    expect(wrongOrder.step(1 / 60).checkpoint).toBe(0);
  });

  it("requires public racing examples to bind a meaningful route to typed vehicle and track assets", () => {
    const route = game.assetBoundRacingRoute({
      vehicleAsset: "showcaseTexturedSportsCar",
      trackAsset: "showcaseTsukubaCircuit",
      authoredLapSeconds: 34,
      minLapSeconds: 30,
      minCheckpoints: 4,
      minRouteLength: 6,
      route: {
        id: "asset-bound-race",
        width: 1.2,
        points: [
          { x: -3, y: 0 },
          { x: -2, y: 1.6 },
          { x: -0.4, y: 2.2 },
          { x: 1.8, y: 1.6 },
          { x: 3, y: 0 },
          { x: 1.8, y: -1.6 },
          { x: -0.4, y: -2.2 },
          { x: -2, y: -1.6 },
          { x: -3, y: 0 }
        ],
        checkpoints: [0.16, 0.33, 0.5, 0.67, 0.84, 1]
      }
    });

    expect(route.assetBinding).toMatchObject({
      kind: "aura-game-asset-bound-racing-route",
      layoutContractVersion: "1.0",
      vehicleAsset: "showcaseTexturedSportsCar",
      trackAsset: "showcaseTsukubaCircuit",
      authoredLapSeconds: 34,
      pointCount: 9,
      checkpointCount: 6
    });
    expect(route.assetBinding.routeLength).toBeGreaterThan(6);
    expect(() => game.assetBoundRacingRoute({
      vehicleAsset: "showcaseTexturedSportsCar",
      trackAsset: "showcaseTsukubaCircuit",
      authoredLapSeconds: 5,
      minLapSeconds: 5,
      route
    })).toThrow(/at least 30s authored lap duration/);
  });

  it("rejects public racing scene offsets that detach route topology from retained overlay evidence", () => {
    const topology = {
      assetId: "showcaseTsukubaCircuit",
      assetHash: "sha256-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      source: "manifest-authored-overlay-validated",
      roadCenterline: [
        { x: -3, z: 0, width: 1 },
        { x: -2, z: 1.6, width: 1 },
        { x: -0.4, z: 2.2, width: 1 },
        { x: 1.8, z: 1.6, width: 1 },
        { x: 3, z: 0, width: 1 },
        { x: 1.8, z: -1.6, width: 1 },
        { x: -0.4, z: -2.2, width: 1 },
        { x: -2, z: -1.6, width: 1 },
        { x: -3, z: 0, width: 1 }
      ],
      checkpoints: [
        { id: "cp-01", progress: 0.16, width: 1 },
        { id: "cp-02", progress: 0.33, width: 1 },
        { id: "cp-03", progress: 0.5, width: 1 },
        { id: "cp-04", progress: 0.67, width: 1 },
        { id: "cp-05", progress: 0.84, width: 1 },
        { id: "cp-06", progress: 1, width: 1 }
      ],
      lapLengthMeters: 14,
      estimatedLapSeconds: 36,
      confidence: 0.9,
      modelAlignment: {
        source: "manifest-authored-overlay-validated",
        modelBounds: {
          min: [-4, -1, -3],
          max: [4, 1, 3]
        },
        modelPoint: [0, -1, 0],
        gamePoint: { x: 0, z: 0 },
        evidence: {
          routeOverlay: "tests/reports/showcase-route-primary-probes/showcase-turbo-drift-circuit.png",
          notes: "Unit-test anchor binds the retained track model to the racing route coordinate space."
        }
      },
      evidence: {
        sourceAsset: "assets.showcaseTsukubaCircuit",
        routeOverlay: "tests/reports/showcase-route-primary-probes/showcase-turbo-drift-circuit.png",
        notes: "unit test overlay"
      }
    } as const;
    const route = game.assetBoundRacingRoute({
      vehicleAsset: "showcaseTexturedSportsCar",
      trackAsset: "showcaseTsukubaCircuit",
      authoredLapSeconds: 36,
      minLapSeconds: 30,
      minCheckpoints: 6,
      minRouteLength: 6,
      topology,
      route: {
        id: "asset-bound-race-offset",
        width: 1,
        points: topology.roadCenterline.map((point) => ({ x: point.x, y: point.z })),
        checkpoints: topology.checkpoints.map((checkpoint) => checkpoint.progress)
      }
    });
    const base = game.racingSceneBinding({
      topology,
      route,
      trackAsset: "showcaseTsukubaCircuit",
      targetSceneSize: 3,
      trackY: -0.2,
      carY: 0.35
    });

    expect(base.evidence.modelSceneOffset).toEqual({ x: 0, y: 0, z: 0 });
    expect(base.trackModel.anchorFit).toMatchObject({
      mode: "single-anchor",
      anchorCount: 1,
      averageError: null,
      maxError: null
    });
    expect(() =>
      game.racingSceneBinding({
        topology,
        route,
        trackAsset: "showcaseTsukubaCircuit",
        targetSceneSize: 3,
        trackModelSceneOffset: { x: 0.7, y: 0.12, z: -0.4 },
        trackY: -0.2,
        carY: 0.35
      })
    ).toThrow(/trackModelSceneOffset/);
    expect(() =>
      game.racingSceneBinding({
        topology,
        route,
        trackAsset: "showcaseTsukubaCircuit",
        targetSceneSize: 3,
        trackModelPresentationOffset: { x: 0.32, y: 0, z: 0.48 },
        trackY: -0.2,
        carY: 0.35
      })
    ).toThrow(/presentation offsets decouple/);
  });

  it("records multi-anchor racing model fit evidence instead of relying on one topology anchor", () => {
    const topology = {
      assetId: "showcaseTsukubaCircuit",
      assetHash: "sha256-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      source: "manifest-authored-overlay-validated",
      roadCenterline: [
        { x: -3, z: 0, width: 1 },
        { x: -1.5, z: 1.5, width: 1 },
        { x: 0, z: 1.8, width: 1 },
        { x: 1.5, z: 1.5, width: 1 },
        { x: 3, z: 0, width: 1 },
        { x: 1.5, z: -1.5, width: 1 },
        { x: 0, z: -1.8, width: 1 },
        { x: -1.5, z: -1.5, width: 1 },
        { x: -3, z: 0, width: 1 }
      ],
      checkpoints: [
        { progress: 0.16, width: 1 },
        { progress: 0.33, width: 1 },
        { progress: 0.5, width: 1 },
        { progress: 0.67, width: 1 },
        { progress: 0.84, width: 1 },
        { progress: 1, width: 1 }
      ],
      lapLengthMeters: 14,
      estimatedLapSeconds: 36,
      confidence: 0.9,
      modelAlignment: {
        source: "manifest-authored-overlay-validated",
        modelBounds: { min: [-4, -1, -3], max: [4, 1, 3] },
        modelPoint: [0, -1, 0],
        gamePoint: { x: 0, z: 0 },
        anchorPairs: [
          { id: "left-apex", modelPoint: [-4, -1, 0], gamePoint: { x: -3, z: 0 } },
          { id: "right-apex", modelPoint: [4, -1, 0], gamePoint: { x: 3, z: 0 } }
        ],
        evidence: {
          routeOverlay: "tests/reports/showcase-route-primary-probes/showcase-turbo-drift-circuit.png",
          notes: "Unit-test anchor pair binds the retained track model to both sides of the racing route."
        }
      },
      evidence: {
        sourceAsset: "assets.showcaseTsukubaCircuit",
        routeOverlay: "tests/reports/showcase-route-primary-probes/showcase-turbo-drift-circuit.png",
        notes: "unit test overlay"
      }
    } as const;
    const route = game.assetBoundRacingRoute({
      vehicleAsset: "showcaseTexturedSportsCar",
      trackAsset: "showcaseTsukubaCircuit",
      authoredLapSeconds: 36,
      minLapSeconds: 30,
      minCheckpoints: 6,
      minRouteLength: 6,
      topology,
      route: {
        id: "asset-bound-race-multi-anchor",
        width: 1,
        points: topology.roadCenterline.map((point) => ({ x: point.x, y: point.z })),
        checkpoints: topology.checkpoints.map((checkpoint) => checkpoint.progress)
      }
    });

    const binding = game.racingSceneBinding({ topology, route, trackAsset: "showcaseTsukubaCircuit", targetSceneSize: 3 });

    expect(binding.trackModel.anchorFit.mode).toBe("multi-anchor-yaw-fit");
    expect(binding.trackModel.anchorFit.anchorCount).toBe(2);
    expect(binding.trackModel.anchorFit.averageError).toBeLessThanOrEqual(0.001);
    expect(binding.evidence.modelAlignment.rotation).toEqual(binding.trackModel.rotation);

    const misalignedTopology = {
      ...topology,
      modelAlignment: {
        ...topology.modelAlignment,
        anchorPairs: [
          ...topology.modelAlignment.anchorPairs,
          { id: "misaligned-track-edge", modelPoint: [0, -1, 3], gamePoint: { x: 80, z: 80 } }
        ]
      }
    } as const;

    expect(() =>
      game.racingSceneBinding({
        topology: misalignedTopology,
        route,
        trackAsset: "showcaseTsukubaCircuit",
        targetSceneSize: 3
      })
    ).toThrow(/asset geometry is not scene-bound to game geometry/);
  });

  it("provides reusable falling-block mechanics for movement, rotation, hold, line clears, and replay checksums", () => {
    const falling = game.fallingBlocks({ seed: 7 });
    const start = falling.snapshot();
    const moved = falling.move(1);
    expect(moved.active?.x).toBe((start.active?.x ?? 0) + 1);

    const rotated = falling.rotate(1);
    expect(rotated.active?.rotation).not.toBe(start.active?.rotation);

    const held = falling.hold();
    expect(held.hold).toBe(start.active?.kind);

    const width = held.width;
    const height = held.height;
    const board = Array.from({ length: height }, () => Array.from({ length: width }, () => null as "O" | null));
    board[height - 1] = board[height - 1].map((_, x) => (x >= 3 && x <= 6 ? null : "O"));
    falling.setBoard(board);
    falling.setActive({ kind: "I", x: 3, y: height - 2, rotation: 0 });
    const cleared = falling.hardDrop();

    expect(cleared.lines).toBe(1);
    expect(cleared.events.map((event) => event.type)).toContain("line-clear");

    const first = game.fallingBlocks({ seed: 11 });
    const second = game.fallingBlocks({ seed: 11 });
    const sequence = [
      { type: "move", dx: 1 },
      { type: "rotate", direction: 1 },
      { type: "softDrop" },
      { type: "hardDrop" }
    ] as const;
    for (const action of sequence) {
      first.step(action);
      second.step(action);
    }
    expect(first.checksum()).toBe(second.checksum());
    expect(first.replay()).toHaveLength(sequence.length);
  });

  it("keeps hitbox debug overlay source coverage in the fighting-game template", () => {
    const templateMain = readSource("packages/create-aura3d/templates/fighting-game/src/main.ts");
    const templateMoves = readSource("packages/create-aura3d/templates/fighting-game/src/game/moves.ts");

    expect(templateMain).toContain("diagnostics: { overlay: true");
    expect(templateMain).toContain("const combat = game.combatWorld()");
    expect(templateMain).toContain("__AURA3D_GAME_EVIDENCE__");
    expect(templateMain).toContain("__AURA3D_GAME_RUNTIME__");
    expect(templateMain).toContain("app.evidence({");
    expect(templateMoves.match(/hitboxes:\s*\[/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(templateMain.match(/createGameApp\(/g)?.length ?? 0).toBe(1);
    expect(templateMain).not.toContain("createAuraApp(");
    expect(templateMain).not.toContain("app.setScene(");
    expect(templateMain).not.toMatch(/\bfrom\s+["']three["']|GLTFLoader|three\/examples/);
  });

  it("keeps fighting-kit hitbox debug overlays opt-in at the engine level", () => {
    const kit = game.fighting({ opponentAi: false });

    kit.combat.beginAttack("player", kit.moves.light);
    const normal = kit.debugHitboxOverlay();
    const debug = kit.debugHitboxOverlay({ enabled: true });

    expect(normal).toMatchObject({
      kind: "aura-fighting-debug-hitbox-overlay",
      enabled: false,
      normalPassVisible: false,
      volumes: []
    });
    expect(debug).toMatchObject({
      enabled: true,
      normalPassVisible: false,
      volumes: [
        expect.objectContaining({
          id: "light-palm",
          ownerId: "player",
          moveId: "light",
          active: false,
          color: "#f97316"
        })
      ]
    });
  });

  it("proves public GameAppRuntime lifecycle methods and evidence from the public createGameApp API", () => {
    const runtime = createGameApp(null, {
      autoStart: false,
      loop: { fixedDt: 1 / 20 },
      scene: scene()
        .add(
          model(assets.fighter, { name: "typed runtime fighter" })
            .position(0, 1, 0)
            .runtime(game.runtimeNode("player", { tags: ["fighter", "typed-glb"] }))
        )
        .add(lights.studio()),
      input: {
        actions: {
          light: ["KeyJ"]
        },
        autoListen: false
      }
    });
    const frames: number[] = [];

    runtime.onFrame((frame) => {
      frames.push(frame.frame);
      runtime.app.nodes.require("player").translate(0.25, 0, 0);
    });

    expect(runtime.evidence).toMatchObject({
      kind: "aura-game-app-runtime-evidence",
      status: "idle",
      started: false,
      frame: 0,
      inputControllers: 1,
      activeInputControllers: 1
    });

    runtime.start();
    runtime.input?.press("KeyJ");
    runtime.step(1 / 20);
    runtime.pause();
    runtime.resize(800, 450, 1.5);
    runtime.resume();
    runtime.step(1 / 20);

    expect(frames).toEqual([1, 2]);
    expect(runtime.evidence).toMatchObject({
      status: "running",
      started: true,
      frame: 2,
      startCount: 1,
      pauseCount: 1,
      resumeCount: 1,
      stepCount: 2,
      resizeCount: 1,
      lastResize: { width: 800, height: 450, pixelRatio: 1.5 },
      app: {
        loop: {
          frame: 2
        },
        systems: {
          mutableNodes: true
        }
      }
    });
    expect(runtime.app.nodes.require("player").position).toEqual([0.5, 1, 0]);

    const disposed = runtime.dispose();
    expect(disposed).toMatchObject({
      status: "disposed",
      disposed: true,
      disposeCount: 1,
      activeInputControllers: 0
    });
  });

  it("publishes standardized game evidence for input, movement, combat, animation, renderer, audio, and errors", () => {
    const app = createAuraApp(null, {
      autoStart: false,
      scene: scene().add(
        model(assets.fighter, { name: "evidence fighter" })
          .runtime(game.runtimeNode("player", { tags: ["fighter"] }))
      )
    });
    const input = game.input({ actions: { light: ["KeyJ"] }, autoListen: false });
    const body = game.kinematicBody({ id: "player-body", position: [0, 0, 0], velocity: [2, 0, 0], groundY: 0 });
    const combat = game.combatWorld();
    combat.addActor({ id: "player", team: "p1", position: [0, 0, 0], facing: 1 });

    input.press("KeyJ");
    input.update(1 / 60);
    app.step(1 / 60);

    expect(app.evidence({
      input,
      bodies: [body],
      combat,
      animation: { controllers: 1, activeClips: ["Idle"], eventCount: 2 },
      renderer: { backend: "webgl2", drawCalls: 12, frameTimeMs: 12.4, renderSize: [1280, 720], assetFailures: ["missing-texture"], contextLost: false },
      audio: { unlocked: true, muted: false, cuesTriggered: ["hit"], musicPlaying: true, errors: ["late-unlock"] },
      errors: [{ severity: "warning", code: "clip-fallback", message: "Used fallback idle clip." }],
      source: { expectsGame: true }
    })).toMatchObject({
      input: { configured: true, actions: ["light"], frame: 1 },
      movement: { bodies: 1, groundedBodies: 1, airborneBodies: 0, movingBodies: 1 },
      collision: { combatWorld: true, actors: 1 },
      animation: { controllers: 1, activeClips: ["Idle"], eventCount: 2 },
      renderer: { backend: "webgl2", drawCalls: 12, frameTimeMs: 12.4, renderSize: [1280, 720], assetFailures: ["missing-texture"], contextLost: false },
      audio: { unlocked: true, muted: false, cuesTriggered: ["hit"], musicPlaying: true, errors: ["late-unlock"] },
      errors: [{ severity: "warning", code: "clip-fallback", message: "Used fallback idle clip." }]
    });

    input.dispose();
    app.dispose();
  });

  it("provides reusable locomotion state for idle, run, jump, fall, land, and hit animation clips", () => {
    const locomotion = game.locomotion({
      clipMap: {
        idle: "idle",
        run: "sprint",
        jump: "attack-kick-right",
        fall: "die",
        land: "pick-up",
        hit: "die"
      },
      availableClips: ["idle", "sprint", "attack-kick-right", "die", "pick-up"],
      runSpeedThreshold: 0.2,
      jumpVelocityThreshold: 0.15,
      fallVelocityThreshold: -0.15,
      landDuration: 0.12,
      hitDuration: 0.2
    });

    expect(locomotion.snapshot()).toMatchObject({ state: "idle", clip: "idle", missingClips: [] });
    expect(locomotion.step(1 / 60, { grounded: true, vx: 2.4 })).toMatchObject({ state: "run", clip: "sprint", loop: true });
    expect(locomotion.step(1 / 60, { grounded: false, vy: 5.5, events: [{ type: "jump" }] })).toMatchObject({
      state: "jump",
      clip: "attack-kick-right",
      loop: false
    });
    expect(locomotion.step(1 / 60, { grounded: false, vy: -2.2 })).toMatchObject({ state: "fall", clip: "die", loop: true });
    expect(locomotion.step(1 / 60, { grounded: true, vy: 0, events: [{ type: "land" }] })).toMatchObject({
      state: "land",
      clip: "pick-up",
      oneShot: true,
      restart: true
    });
    expect(locomotion.step(1 / 60, { grounded: true, hit: true, events: [{ type: "hit" }] })).toMatchObject({
      state: "hit",
      clip: "die",
      oneShot: true,
      eventTypes: ["hit"]
    });
    expect(locomotion.reset()).toMatchObject({ state: "idle", clip: "idle" });

    const missing = game.locomotion({
      clipMap: { idle: "Idle", run: "Run", jump: "Jump", fall: "Fall", land: "Land", hit: "Hit" },
      availableClips: ["Idle", "Run"]
    }).snapshot();
    expect(missing.missingClips).toEqual(["Jump", "Fall", "Land", "Hit"]);
  });

  it("keeps root game facade helper exports source-visible without private runtime imports", () => {
    const rootIndex = readSource("packages/engine/src/index.ts");
    const agentApi = readSource("packages/engine/src/agent-api/index.ts");
    const gameRuntime = readSource("packages/engine/src/agent-api/GameRuntime.ts");
    const gameGenreKits = readSource("packages/engine/src/agent-api/GameGenreKits.ts");
    const gameSceneBindings = readSource("packages/engine/src/agent-api/GameSceneGeometryBindings.ts");
    const gameKits = readSource("packages/engine/src/agent-api/game-kits/index.ts");
    const fightingKit = readSource("packages/engine/src/agent-api/game-kits/fighting.ts");

    expect(rootIndex).toContain('export * from "./agent-api/index.js";');
    expect(agentApi).toContain("export const games = {");
    expect(agentApi).toContain("export const game = {");
    expect(agentApi).toMatch(/export const game = \{[\s\S]*runtimeNode:[\s\S]*input: createGameInput[\s\S]*kinematicBody: createGameKinematicBody[\s\S]*collisionWorld: createGameCollisionWorld[\s\S]*combatWorld: createCombatWorld[\s\S]*cameraDirector: createGameCameraDirector[\s\S]*effects: createGameEffects[\s\S]*hud: \{[\s\S]*accessibility: \{/);
    expectIncludesAll(gameRuntime, [
      "export function createGameInput",
      "export function createGameKinematicBody",
      "export function createGameCollisionWorld",
      "export function createGameEventLog",
      "export function createCombatWorld",
      "export function createGameCameraDirector",
      "export function createGameEffects",
      "export function createGameHudHealthBinding",
      "export function createGameHudMeterBinding",
      "export function createGameHudTimerBinding",
      "export function createGameHudScoreBinding",
      "export function createGameHudObjectiveBinding",
      "export function createGameHudEventLogBinding",
      "export function createGameHudComboBinding",
      "export function createGameAccessibilityLabel",
      "export function createGameReducedMotionSource",
      "export function createGameReducedFlashSource",
      "export function createGameHighContrastSource",
      "export function createGamePauseControlsSource"
    ]);
    expectIncludesAll(gameGenreKits, [
      "export function createGameLocomotionKit",
      "export function createGameAssetBoundPlatformerLevel",
      "export function createGameAssetBoundRacingRoute",
      "export function createGamePlatformerKit",
      "export function createGameRacingKit",
      "export function createGameFallingBlocksKit"
    ]);
    expectIncludesAll(gameSceneBindings, [
      "export function createGameRacingSceneBinding",
      "export function createGamePlatformerSceneBinding",
      "export function createGameRacingPresentationCamera",
      "export function createGamePlatformerPresentationCamera",
      "readonly targetNode?: string",
      "readonly targetOffset?: Vec3",
      "readonly offsetMode?: \"scene\" | \"target-yaw\""
    ]);
    expect(agentApi).toContain("racingPresentationCamera: createGameRacingPresentationCamera");
    expect(agentApi).toContain("platformerPresentationCamera: createGamePlatformerPresentationCamera");
    expect(agentApi).toContain("readonly targetOffset?: AuraVec3");
    expect(agentApi).toContain("readonly offsetMode?: \"scene\" | \"target-yaw\"");
    expect(agentApi).toContain("function rotateVec3BySceneYaw");
    expect(agentApi).toContain("applyCameraOffset(cameraSpec, cameraSpec.offset, runtimeTarget)");
    expect(gameKits).toContain("export const gameKits = {");
    expectIncludesAll(fightingKit, [
      "export const fighting = {",
      "controls: defaultFightingControls",
      "runtimeNode: fighterRuntimeNode",
      "stagePreset: fightingStagePreset",
      "validateStage: validateFightingStage",
      "createKit: createFightingGameKit"
    ]);
  });

  it("keeps CLI asset command source tokens discoverable without writing CLI files", () => {
    const cli = readSource("packages/aura3d-cli/src/cli.ts");
    const cliApi = readSource("packages/aura3d-cli/src/index.ts");

    expectIncludesAll(cli, [
      'action === "inspect"',
      "print(inspectAsset({",
      'animation: hasFlag("--animation")',
      'humanoid: hasFlag("--humanoid")',
      'skeleton: hasFlag("--skeleton")',
      'morphs: hasFlag("--morphs")',
      'license: hasFlag("--license")',
      'action === "validate-game"',
      "print(validateGameAssets({",
      "output: readEvidenceOutput()",
      "...readAssetValidationOptions()",
      'gameProfile: profile',
      'action === "validate-animation-studio"',
      "validateAnimationStudioAssets",
      'action === "validate-animation"',
      "validateAnimationAssets",
      'action === "assemble-character"',
      'createCharacterAssemblyPlan({ name, body, parts: readParts("--part")',
      "aura3d assets inspect ./model.glb"
    ]);
    expectIncludesAll(cliApi, [
      "AuraAssetReadinessProfile",
      "AssetReadinessReport",
      "export function inspectAsset",
      "export function validateGameAssets",
      "export { validateAnimationAssets",
      "export function createCharacterAssemblyPlan"
    ]);
  });

  it("keeps fighting-game template and kit source tokens tied to gameplay evidence", () => {
    const templateMain = readSource("packages/create-aura3d/templates/fighting-game/src/main.ts");
    const templateFighters = readSource("packages/create-aura3d/templates/fighting-game/src/game/fighters.ts");
    const templateAssets = readSource("packages/create-aura3d/templates/fighting-game/src/aura-assets.ts");
    const routeHealth = readSource("packages/create-aura3d/templates/fighting-game/tests/route-health.spec.ts");
    const gameplaySmoke = readSource("packages/create-aura3d/templates/fighting-game/tests/gameplay-smoke.spec.ts");
    const fightingKit = readSource("packages/engine/src/agent-api/game-kits/fighting.ts");

    expectIncludesAll(templateMain, [
      "createGameApp(\"#app\"",
      "const input = gameApp.input",
      "gameApp.onFrame",
      "input.update(dt)",
      "createFighterNode(\"player\"",
      "createFighterNode(\"rival\"",
      "game.kinematicBody(",
      "game.combatWorld(",
      "game.cameraDirector(",
      "game.effects(",
      "combat.beginAttack",
      "app.evidence({",
      "__AURA3D_GAME_EVIDENCE__",
      "__AURA3D_GAME_RUNTIME__"
    ]);
    expectIncludesAll(templateFighters, [
      "export function createFighterNode",
      "game.runtimeNode(id"
    ]);
    expect(templateMain.match(/createGameApp\(/g)?.length ?? 0).toBe(1);
    expect(templateMain).not.toContain("createAuraApp(");
    expect(templateMain).not.toContain("model(\"");
    expect(templateAssets).toContain("defineAuraAssets");
    expect(routeHealth).toContain("fighting-game route loads");
    expect(gameplaySmoke).toContain("__AURA3D_GAME_EVIDENCE__");
    expectIncludesAll(fightingKit, [
      "input.update(dt)",
      "combat.beginAttack(playerId, moves.light)",
      "combat.beginAttack(playerId, moves.heavy)",
      "combat.beginAttack(playerId, moves.special)",
      "effects.hitSpark(event.position",
      "effects.blockSpark(event.position",
      "camera.update(dt"
    ]);
  });

  it("keeps showcase game routes on public genre kits instead of route-local engines", () => {
    const skylineMain = readSource("apps/showcase-skyline-runner/src/main.ts");
    const turboMain = readSource("apps/showcase-turbo-drift-circuit/src/main.ts");
    const blockfallMain = readSource("apps/showcase-blockfall-reactor/src/main.ts");
    const blockfallReadme = readSource("apps/showcase-blockfall-reactor/README.md");

    expect(skylineMain).toContain("const playableSurfaceMap =");
    /*
     * The level is built by `src/level.ts`, which `main.ts` and `level-proof.ts` share.
     *
     * The gate's intent is that the route uses the public asset-bound level builder rather
     * than a route-local engine, so it is checked where the call now lives. The extraction
     * exists because both files previously built the level themselves, which is why
     * retuning the jump in `main.ts` left the 60-second proof running the old tuning.
     */
    const skylineLevel = readSource("apps/showcase-skyline-runner/src/level.ts");
    expect(skylineLevel).toContain("game.assetBoundPlatformerLevel({");
    expect(skylineLevel).toContain("solvePlatformerMotion(");
    expect(skylineMain).toContain("createSkylineLevel()");
    expect(readSource("apps/showcase-skyline-runner/src/level-proof.ts")).toContain("createSkylineLevel");
    expect(skylineMain).toContain("const platformerScene = game.platformerSceneBinding({");
    expect(skylineMain).toContain("const platformerState = game.platformer(level)");
    const skylineGeometry = readFileSync("apps/showcase-skyline-runner/src/generated/game-geometry.ts", "utf8");
    expect(skylineMain).toContain('import { gameGeometryContract } from "./generated/game-geometry"');
    expect(skylineMain).not.toContain('"source": "asset-mesh-extracted"');
    expect(skylineMain).not.toContain("sha256-68e115700a600bb3cfee70d0e0f75083c07cb6e38f29379aa935d871681a59b4");
    expect(skylineGeometry).toContain('"source": "asset-mesh-extracted"');
    expect(skylineGeometry).toContain('"worldAssetHash": "sha256-9f7c2b49b14458be84aa5509b1c623466b8e468af4414f7ab76adc328d291bdd"');
    expect(skylineMain).toContain("sceneBinding: platformerScene.evidence");
    expect(skylineMain).toContain("surfaceContact: platformerScene.contactPointForPlayer(state.player)");
    expect(skylineMain).toContain("surfaceContactAlignment: playerSurfaceAlignment()");
    expect(skylineMain).toContain("playerTargetHeight: platformerScene.evidence.playerTargetHeight");
    expect(skylineMain).toContain("platformerScene.toScenePlayer");
    expect(skylineMain).toContain("game.platformerCameraRig({");
    expect(skylineMain).not.toContain("camera.follow(");
    expect(skylineMain).not.toContain("import { camera,");
    expect(skylineMain).not.toContain("stepSkylineRunner(");
    expect(skylineMain).not.toContain("createInitialSkylineState(");
    expect(skylineMain).not.toContain("(state.player.x - 18) * 0.08");
    /*
     * `runner-rules.ts` is gone, so assert it stays gone.
     *
     * It was a 252-line orphan with **zero importers** that still declared `gravity: -20.2` and
     * `jumpVelocity: 8.75` — the route-local motion constants PRD rule 1 bans, and the same stale
     * tuning WS-4.2 removed from `main.ts`. The old gate only checked what the file must *not*
     * contain (`stepSkylineRunner`, `resolvePlatformLanding`, `advanceFrame`), which let the dead
     * constants sit there indefinitely: it policed a route-local *engine* while ignoring route-local
     * *tuning*.
     *
     * Deleting it is the fix. Checking for its absence is what stops it coming back, and is strictly
     * stronger than the three negative assertions it replaces.
     */
    expect(existsSync("apps/showcase-skyline-runner/src/runner-rules.ts")).toBe(false);

    expect(turboMain).toContain("const trackTopology =");
    expect(turboMain).toContain("const route = game.assetBoundRacingRoute(");
    expect(turboMain).toContain("const racingScene = game.racingSceneBinding({");
    expect(turboMain).toContain("const racingState = game.racing(");
    const turboGeometry = readFileSync("apps/showcase-turbo-drift-circuit/src/generated/game-geometry.ts", "utf8");
    expect(turboMain).toContain('import { gameGeometryContract } from "./generated/game-geometry"');
    expect(turboMain).not.toContain('"source": "asset-mesh-extracted"');
    // The certified track hash belongs in the generated contract, never inlined in route
    // source. Turbo now binds showcaseTsukubaCircuit.
    expect(turboMain).not.toContain("sha256-8c139a570143ce20a415803d67a46e92d65e2c711a310ad3891f71a69f8ce031");
    expect(turboGeometry).toContain('"source": "asset-mesh-extracted"');
    expect(turboGeometry).toContain("sha256-8c139a570143ce20a415803d67a46e92d65e2c711a310ad3891f71a69f8ce031");
    expect(turboMain).toContain("sceneBinding: racingScene.evidence");
    expect(turboMain).toContain("checkpointScenePoints: racingScene.checkpointScenePoints");
    expect(turboMain).toContain("roadAlignment: roadAlignmentForSnapshot");
    expect(turboMain).toContain("carTrackSceneBinding");
    expect(turboMain).toContain("carAlignedToVisibleRoad");
    expect(turboMain).toContain("racingScene.toScenePose");
    expect(turboMain).toContain("game.racingCameraRig({");
    expect(turboMain).toContain('selectedMode: "chase"');
    expect(turboMain).not.toContain("trackModelSceneOffset");
    expect(turboMain).not.toContain("camera.follow(");
    expect(turboMain).not.toContain("import { camera,");
    expect(turboMain).not.toMatch(/function\s+(updateCar|updateRaceProgress|projectToTrack|sampleTrackAt|createRacePathMetrics)\b/);
    expect(turboMain).not.toContain("racePathMetrics");
    expect(turboMain).not.toContain("playerCar.setPosition(raceSnapshot.position.x");

    expect(blockfallMain).toContain("const fallingBlocks = game.fallingBlocks({");
    expect(blockfallMain).toContain('deterministicModule: "game.fallingBlocks"');
    expect(blockfallMain).toContain("createPublicReplayEvidence");
    expect(blockfallMain).toContain("createPublicLineClearProof");
    expect(blockfallMain).not.toContain("advanceFrame(");
    expect(blockfallMain).not.toContain("createInitialState(");
    expect(blockfallMain).not.toContain('deterministicModule: "src/rules.ts"');
    expect(blockfallReadme).toContain("the public `game.fallingBlocks` kit");
    expect(blockfallReadme).not.toContain("route-local deterministic rules");
  });

  it("keeps package-smoke and release-gate scripts wired into game runtime readiness", () => {
    const scripts = readPackageJson().scripts ?? {};
    const unitRaw = scripts["game-runtime:unit:raw"] ?? "";
    const packageRaw = scripts["game-runtime:package:raw"] ?? "";
    const release = scripts["game-runtime:release"] ?? "";
    const releaseRaw = scripts["game-runtime:release:raw"] ?? "";

    expect(scripts["game-runtime:unit"]).toContain("pnpm game-runtime:unit:raw");
    expect(unitRaw).toContain("tests/unit/game-runtime/game-runtime-source-gates.test.ts");
    expect(scripts["game-runtime:package"]).toContain("pnpm game-runtime:package:raw");
    expect(packageRaw).toContain("tools/game-runtime-package-smoke/index.ts");
    expect(release).toContain("pnpm game-runtime:release:raw");
    for (const gate of ["unit", "browser", "template", "docs", "package"]) {
      expect(releaseRaw).toContain(`pnpm game-runtime:${gate}`);
    }
    expect(releaseRaw.indexOf("pnpm game-runtime:package")).toBeGreaterThan(releaseRaw.indexOf("pnpm game-runtime:docs"));
  });
});

function readSource(file: string): string {
  return readFileSync(resolve(process.cwd(), file), "utf8");
}

function readPackageJson(): PackageJson {
  return JSON.parse(readSource("package.json")) as PackageJson;
}

function expectIncludesAll(source: string, tokens: readonly string[]): void {
  for (const token of tokens) expect(source).toContain(token);
}
