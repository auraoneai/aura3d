import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

type CheckResult = {
  readonly id: string;
  readonly ok: boolean;
  readonly detail: string;
};

const root = process.cwd();

const requiredFiles = [
  "docs/api/game-runtime.md",
  "docs/examples/fighting-game.md",
  "packages/create-aura3d/templates/fighting-game/package.json",
  "packages/create-aura3d/templates/fighting-game/src/main.ts",
  "packages/create-aura3d/templates/fighting-game/src/aura-assets.ts",
  "packages/create-aura3d/templates/fighting-game/src/game/fighters.ts",
  "packages/create-aura3d/templates/fighting-game/src/game/moves.ts",
  "packages/create-aura3d/templates/fighting-game/src/game/stage.ts",
  "packages/create-aura3d/templates/fighting-game/tests/route-health.spec.ts",
  "packages/create-aura3d/templates/fighting-game/tests/gameplay-smoke.spec.ts",
  "tests/unit/agent-api/aura-app-handle.test.ts",
  "tests/unit/agent-api/runtime-node-handle.test.ts",
  "tests/unit/game-runtime/input.test.ts",
  "tests/unit/game-runtime/kinematic-body.test.ts",
  "tests/unit/game-runtime/hitbox-world.test.ts",
  "tests/unit/game-runtime/game-runtime-source-gates.test.ts",
  "tests/unit/animation/animation-runtime-node-source-gates.test.ts",
  "tests/browser/game-runtime-mutability.spec.ts",
  "tests/browser/fighting-game-runtime.spec.ts",
  "tests/browser/game-runtime-visual.spec.ts",
  "tools/game-runtime-package-smoke/index.ts",
  "tmp/aura3d104-agent-reports/template-runtime.md"
];

const checks: CheckResult[] = [];

for (const file of requiredFiles) {
  checks.push({
    id: `file:${file}`,
    ok: existsSync(resolve(root, file)),
    detail: file
  });
}

const templateMain = read("packages/create-aura3d/templates/fighting-game/src/main.ts");
const templatePackage = read("packages/create-aura3d/templates/fighting-game/package.json");
const templateCodeSourceFiles = [
  "packages/create-aura3d/templates/fighting-game/src/main.ts",
  "packages/create-aura3d/templates/fighting-game/src/aura-assets.ts",
  "packages/create-aura3d/templates/fighting-game/src/game/fighters.ts",
  "packages/create-aura3d/templates/fighting-game/src/game/moves.ts",
  "packages/create-aura3d/templates/fighting-game/src/game/stage.ts",
  "packages/create-aura3d/templates/fighting-game/tests/route-health.spec.ts",
  "packages/create-aura3d/templates/fighting-game/tests/gameplay-smoke.spec.ts"
];
const templateCodeSources = templateCodeSourceFiles.map(read).join("\n");
const templateGameSources = [
  "packages/create-aura3d/templates/fighting-game/README.md",
  ...templateCodeSourceFiles
].map(read).join("\n");
const docs = `${read("docs/api/game-runtime.md")}\n${read("docs/examples/fighting-game.md")}\n${read("llms.txt")}`;
const packageJson = read("package.json");
const sourceGates = read("tests/unit/game-runtime/game-runtime-source-gates.test.ts");
const animationSourceGates = read("tests/unit/animation/animation-runtime-node-source-gates.test.ts");
const agentReport = read("tmp/aura3d104-agent-reports/template-runtime.md");
const publicGameSource = [
  "packages/engine/src/index.ts",
  "packages/engine/src/agent-api/index.ts",
  "packages/engine/src/agent-api/GameRuntime.ts",
  "packages/engine/src/agent-api/GameEvidence.ts",
  "packages/engine/src/agent-api/AnimationController.ts",
  "packages/engine/src/agent-api/game-kits/index.ts",
  "packages/engine/src/agent-api/game-kits/fighting.ts"
].map(read).join("\n");
const cliSource = [
  "packages/aura3d-cli/src/cli.ts",
  "packages/aura3d-cli/src/index.ts"
].map(read).join("\n");

for (const token of [
  "app.evidence(",
  "game.kinematicBody(",
  "game.jumpAssist(",
  "game.combatWorld(",
  "game.cameraDirector(",
  "game.effects(",
  "game.debug.overlay(",
  "input.combo(",
  "input.update(",
  ".update(dt)"
]) {
  checks.push({
    id: `template-main-token:${token}`,
    ok: templateMain.includes(token),
    detail: `fighting-game route should include ${token}`
  });
}

for (const check of [
  { id: "template-main-token:gameApp.input", ok: /gameApp\.input/.test(templateMain), detail: "fighting-game route should use runtime-owned gameApp.input" },
  { id: "template-main-token:gameApp.onFrame(", ok: /gameApp\.onFrame\(/.test(templateMain), detail: "fighting-game route should use gameApp.onFrame(" },
  { id: "template-source-token:game.runtimeNode(", ok: /game\.runtimeNode\(/.test(templateCodeSources), detail: "fighting-game template should create runtime nodes through game.runtimeNode(" }
]) {
  checks.push(check);
}

for (const token of [
  "src/game/fighters.ts",
  "src/game/moves.ts",
  "src/game/stage.ts",
  "import { assets } from \"./aura-assets\"",
  "model(asset",
  "AnimationController",
  ".bindRuntimeNode(",
  "games.fighting.controls()",
  "games.fighting.stagePreset(",
  "games.fighting.validateStage(",
  "game.touchControls(",
  "game.collider.capsule(",
  "fightingRouteReadiness",
  "createFightingRouteReadiness",
  "proofMode",
  "routeHealthSpec",
  "gameplaySmokeSpec",
  "npx @aura3d/cli@latest assets validate-game",
  "__AURA3D_GAME_SOURCE__",
  "__AURA3D_GAME_REPLAY__",
  "__AURA3D_GAME_EVIDENCE__",
  "hitCount"
]) {
  checks.push({
    id: `template-source-token:${token}`,
    ok: templateGameSources.includes(token),
    detail: `fighting-game template source should include ${token}`
  });
}

for (const token of ["\"typecheck\"", "\"build\"", "\"test\""]) {
  checks.push({
    id: `template-package-script:${token}`,
    ok: templatePackage.includes(token),
    detail: `fighting-game package.json should declare ${token}`
  });
}

for (const token of [
  "create-aura3d@latest aura-fighter --template fighting-game",
  "app.input",
  "app.evidence",
  "game.hud.health",
  "game.accessibility.pauseControls",
  "collectAuraSceneEvidence(scene)",
  "input.combo",
  "Static scenes are not game runtime evidence",
  "Do not claim a game route is launch-ready"
]) {
  checks.push({
    id: `docs-token:${token}`,
    ok: docs.includes(token),
    detail: `docs should include ${token}`
  });
}

checks.push({
  id: "template-no-three-imports",
  ok: !/\bfrom\s+["']three["']|GLTFLoader|three\/examples/.test(templateCodeSources),
  detail: "fighting-game template must not import three or GLTFLoader"
});

checks.push({
  id: "template-no-unsafe-or-string-assets",
  ok: !/unsafeModelUrl|model\(\s*["']/.test(templateCodeSources),
  detail: "fighting-game template must use typed Aura3D assets instead of unsafe URLs or string model ids"
});

const hasStaticSceneMasquerade =
  /createAuraApp\([^)]*,\s*\{\s*scene\s*:/s.test(templateMain) &&
  !/game\.runtimeNode\(|gameApp\.onFrame\(|input\.update\(|app\.evidence\(/s.test(templateGameSources);

checks.push({
  id: "blocking:no-static-scene-masquerade",
  ok: !hasStaticSceneMasquerade,
  detail: "a fighting-game route with only createAuraApp({ scene }) and no runtime nodes/frame loop/input/evidence is a static scene, not a game"
});

const gameplayRuntimeSignals = [
  /game\.runtimeNode\(/,
  /gameApp\.onFrame\(/,
  /input\.update\(/,
  /game\.kinematicBody\(/,
  /game\.combatWorld\(/,
  /AnimationController/,
  /\.bindRuntimeNode\(/,
  /game\.cameraDirector\(/,
  /game\.effects\(/,
  /games\.fighting\.stagePreset\(/,
  /app\.evidence\(/
];

checks.push({
  id: "blocking:runtime-gameplay-signals",
  ok: gameplayRuntimeSignals.every((pattern) => pattern.test(templateGameSources)),
  detail: "fighting-game template must include runtime nodes, frame updates, input updates, bodies, combat, animation, camera, effects, stage, and evidence"
});

for (const token of [
  "export const game = {",
  "export const games = {",
  "runtimeNode:",
  "input: createGameInput",
  "kinematicBody: createGameKinematicBody",
  "combatWorld: createCombatWorld",
  "cameraDirector: createGameCameraDirector",
  "effects: createGameEffects",
  "hud: {",
  "accessibility: {",
  "export const gameKits = {",
  "export const fighting = {",
  "stagePreset: fightingStagePreset",
  "validateStage: validateFightingStage",
  "createKit: createFightingGameKit",
  "export class AnimationController",
  "bindRuntimeNode("
]) {
  checks.push({
    id: `public-game-source-token:${token}`,
    ok: publicGameSource.includes(token),
    detail: `public game source should include ${token}`
  });
}

for (const token of [
  "action === \"inspect\"",
  "action === \"validate-game\"",
  "action === \"validate-cartoon\"",
  "action === \"assemble-character\"",
  "validateGameAssets",
  "validateCartoonAssets",
  "createCharacterAssemblyPlan",
  "aura3d assets validate-game",
  "aura3d assets validate-cartoon"
]) {
  checks.push({
    id: `cli-source-token:${token}`,
    ok: cliSource.includes(token),
    detail: `CLI source should include ${token}`
  });
}

for (const token of [
  "model(assets.fighter",
  "app.onFrame",
  "app.nodes.require(\"player\")",
  "not.toContain(\"app.setScene(\")",
  "replay.replay(recorder.recorded())",
  "combat.beginAttack(\"player\"",
  "diagnostics: { overlay: true",
  "hitboxes:",
  "game-runtime:package",
  "game-runtime:release"
]) {
  checks.push({
    id: `source-gate-token:${token}`,
    ok: sourceGates.includes(token),
    detail: `game-runtime source gates should include ${token}`
  });
}

for (const token of [
  "play(clip: string",
  "setAnimation(animation: AuraAnimationSpec | undefined): this",
  "node.animation = { ...options, clip };",
  "runtimeNodes.reset(renderSnapshot);",
  "if (playAnimationClips && update.animationClip) node.play?.(update.animationClip, { loop: true });"
]) {
  checks.push({
    id: `animation-source-gate-token:${token}`,
    ok: animationSourceGates.includes(token),
    detail: `animation runtime-node source gates should include ${token}`
  });
}

for (const token of [
  "\"game-runtime:unit\"",
  "tests/unit/game-runtime/game-runtime-source-gates.test.ts",
  "\"game-runtime:package\"",
  "tools/game-runtime-package-smoke/index.ts",
  "\"game-runtime:release\"",
  "\"game-runtime:release:raw\"",
  "pnpm game-runtime:evidence",
  "pnpm game-runtime:package"
]) {
  checks.push({
    id: `package-script-token:${token}`,
    ok: packageJson.includes(token),
    detail: `package scripts should include ${token}`
  });
}

for (const token of [
  "source-only",
  "not executed",
  "assets validate-game",
  "npm run test",
  "browser screenshot",
  "runtime evidence JSON",
  "visual/accessibility approval"
]) {
  checks.push({
    id: `agent-report-token:${token}`,
    ok: agentReport.includes(token),
    detail: `agent report should include ${token}`
  });
}

const failures = checks.filter((check) => !check.ok);
const report = {
  kind: "aura-game-runtime-readiness",
  ok: failures.length === 0,
  checks,
  failures
};

console.log(JSON.stringify(report, null, 2));
if (failures.length > 0) process.exitCode = 1;

function read(file: string): string {
  const path = resolve(root, file);
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}
