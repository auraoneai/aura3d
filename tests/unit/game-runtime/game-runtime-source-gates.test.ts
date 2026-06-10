import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createAuraApp, createGameApp, defineAuraAssets, game, lights, model, scene } from "../../../packages/engine/src";

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

  it("keeps root game facade helper exports source-visible without private runtime imports", () => {
    const rootIndex = readSource("packages/engine/src/index.ts");
    const agentApi = readSource("packages/engine/src/agent-api/index.ts");
    const gameRuntime = readSource("packages/engine/src/agent-api/GameRuntime.ts");
    const gameKits = readSource("packages/engine/src/agent-api/game-kits/index.ts");
    const fightingKit = readSource("packages/engine/src/agent-api/game-kits/fighting.ts");

    expect(rootIndex).toContain('export * from "./agent-api/index.js";');
    expect(agentApi).toContain("export const games = {");
    expect(agentApi).toContain("export const game = {");
    expect(agentApi).toMatch(/export const game = \{[\s\S]*runtimeNode:[\s\S]*input: createGameInput[\s\S]*kinematicBody: createGameKinematicBody[\s\S]*combatWorld: createCombatWorld[\s\S]*cameraDirector: createGameCameraDirector[\s\S]*effects: createGameEffects[\s\S]*hud: \{[\s\S]*accessibility: \{/);
    expectIncludesAll(gameRuntime, [
      "export function createGameInput",
      "export function createGameKinematicBody",
      "export function createCombatWorld",
      "export function createGameCameraDirector",
      "export function createGameEffects",
      "export function createGameHudHealthBinding",
      "export function createGameHudMeterBinding",
      "export function createGameHudTimerBinding",
      "export function createGameHudComboBinding",
      "export function createGameAccessibilityLabel",
      "export function createGameReducedMotionSource",
      "export function createGameReducedFlashSource",
      "export function createGameHighContrastSource",
      "export function createGamePauseControlsSource"
    ]);
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
      "aura3d assets inspect ./model.glb",
      "aura3d assets validate-game",
      "aura3d assets validate-animation",
      "aura3d assets assemble-character --name hero --body bodyAsset --part hair=hairAsset"
    ]);
    expectIncludesAll(cliApi, [
      'export type AuraAssetReadinessProfile = "game" | "animation"',
      "export interface AssetReadinessReport",
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
