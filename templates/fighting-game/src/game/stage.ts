import { game, games } from "@aura3d/engine";
import { publicAssetInstructions, REQUIRED_FIGHTER_ASSETS, REQUIRED_FIGHTER_CLIPS, type FighterAssetKey } from "./fighters";

type GameVec3 = readonly [number, number, number];

export const fightingControls = games.fighting.controls();
export const fightingStage = games.fighting.stagePreset("neon-dojo", {
  id: "fighting-template-arena",
  width: 7.6,
  depth: 2.5,
  safeInset: 0.48
});
export const fightingStageIssues = games.fighting.validateStage(fightingStage);

export const fightingStageBounds = {
  minX: fightingStage.combatBounds.minX,
  maxX: fightingStage.combatBounds.maxX,
  minY: fightingStage.combatBounds.minY,
  maxY: fightingStage.combatBounds.maxY,
  minZ: fightingStage.combatBounds.minZ,
  maxZ: fightingStage.combatBounds.maxZ
};

export interface FightingRouteReadinessOptions {
  readonly missingFighterAssets: readonly FighterAssetKey[];
}

export function createFightingRouteReadiness(options: FightingRouteReadinessOptions) {
  const placeholderMode = options.missingFighterAssets.length > 0;
  return {
  kind: "aura3d-fighting-game-route-readiness",
  sourceOnly: placeholderMode,
  placeholderMode,
  proofMode: placeholderMode ? "source-placeholders" : "typed-assets",
  template: "fighting-game",
  route: "/",
  packageName: "aura3d-fighting-game",
  entry: "src/main.ts",
  sourceFiles: ["src/main.ts", "src/aura-assets.ts", "src/game/fighters.ts", "src/game/moves.ts", "src/game/stage.ts"],
  publicEngineApis: [
    "createGameApp",
    "scene",
    "model(typed AuraAssetRef)",
    "game.runtimeNode",
    "gameApp.onFrame",
    "gameApp.input",
    "game.evidence",
    "game.kinematicBody",
    "game.jumpAssist",
    "game.combatWorld",
    "AnimationController",
    "game.effects",
    "game.cameraDirector",
    "games.fighting.stagePreset",
    "games.fighting.validateStage",
    "game.hud",
    "game.accessibility",
    "game.debug.overlay"
  ],
  requiredTypedAssets: REQUIRED_FIGHTER_ASSETS,
  missingTypedAssets: options.missingFighterAssets,
  requiredAnimationClips: REQUIRED_FIGHTER_CLIPS,
  assetCommands: publicAssetInstructions,
  buildDeclarations: {
    routeHealthSpec: "tests/route-health.spec.ts",
    gameplaySmokeSpec: "tests/gameplay-smoke.spec.ts",
    localCommandsNotRunByTemplate: ["npm run typecheck", "npm run build", "npm run test"],
    evidenceRequiredBeforeLaunchReady: [
      "npx @aura3d/cli@latest assets validate-game --profile fighting-character --json output",
      "npm run test scaffold output proving route load and replay hit",
      "browser screenshot showing a typed GLB fighter moved by runtime node mutation",
      "archived collectGameRuntimeEvidence/app.evidence JSON under tests/reports/game-runtime/",
      "human or automated visual/accessibility approval"
    ]
  },
  stage: {
    id: fightingStage.id,
    safeZone: fightingStage.safeZone,
    combatBounds: fightingStage.combatBounds,
    validationIssues: fightingStageIssues.map((issue) => ({
      severity: issue.severity,
      code: issue.code,
      message: issue.message
    }))
  }
  } as const;
}

export const fightingRouteReadiness = createFightingRouteReadiness({
  missingFighterAssets: REQUIRED_FIGHTER_ASSETS
});

export function createFighterColliders(playerPosition: GameVec3, rivalPosition: GameVec3) {
  return [
    game.collider.capsule({ id: "player-body", center: playerPosition, radius: 0.34, height: 1.7, tags: ["fighter", "player"] }),
    game.collider.capsule({ id: "rival-body", center: rivalPosition, radius: 0.34, height: 1.7, tags: ["fighter", "rival"] })
  ];
}

export function createTouchLayout(width: number, height: number) {
  return game.touchControls({
    width,
    height,
    buttons: [
      { action: "jump", label: "Jump", binding: "TouchJump" },
      { action: "guard", label: "Guard", binding: "TouchGuard" },
      { action: "light", label: "Light", binding: "TouchLight" },
      { action: "heavy", label: "Heavy", binding: "TouchHeavy" },
      { action: "special", label: "Special", binding: "TouchSpecial" }
    ]
  });
}
