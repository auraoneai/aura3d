import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

type GateStatus = "pass" | "fail";

interface FlagshipGate {
  readonly id: string;
  readonly title: string;
  readonly status: GateStatus;
  readonly ok: boolean;
  readonly summary: string;
  readonly evidencePaths: readonly string[];
  readonly blockers: readonly string[];
}

interface AuraClashFlagshipReadinessReport {
  readonly schema: "aura-clash-flagship-readiness";
  readonly ok: boolean;
  readonly status: "flagship-ready" | "flagship-blocked";
  readonly generatedAt: string;
  readonly appRoot: string;
  readonly gates: readonly FlagshipGate[];
  readonly blockers: readonly string[];
}

const defaultOutPath = "apps/aura-clash-showcase/tests/reports/flagship-readiness.json";

export function createAuraClashFlagshipReadinessReport(root = process.cwd()): AuraClashFlagshipReadinessReport {
  const appRoot = join(root, "apps/aura-clash-showcase");
  const appSourcePath = join(appRoot, "src/playable/AuraClashArenaApp.ts");
  const testPath = join(appRoot, "tests/flagship-readiness.spec.ts");
  const appPackagePath = join(appRoot, "package.json");
  const rootPackagePath = join(root, "package.json");

  const source = read(appSourcePath);
  const flagshipTest = read(testPath);
  const appPackage = readJson(appPackagePath);
  const rootPackage = readJson(rootPackagePath);
  const writeProofBlock = block(source.text, /function writeProof\(input:/, /input\.root\.dataset\.arenaStatus = proof;/);
  const sparkBlock = block(source.text, /function createSparkItems\(sparks:/, /function item\(/);
  const computesDistinctFighterHashes =
    source.text.includes("distinct: player.hash !== rival.hash") ||
    source.text.includes("distinct: String(player.hash) !== String(rival.hash)");

  const gates: FlagshipGate[] = [
    gate({
      id: "flagship-playwright-suite-present",
      title: "Flagship Playwright suite covers the manual failure modes",
      ok:
        flagshipTest.exists &&
        includesAll(flagshipTest.text, [
          "all shipped controls produce explicit gameplay proof",
          "KO state locks combat until reset",
          "normal play does not ship debug-style hit artifacts",
          "flagship proof exposes performance and audio budgets"
        ]),
      summary: flagshipTest.exists
        ? "The flagship Playwright suite exists and names controls, KO/reset, artifact, performance, and audio gates."
        : "The flagship Playwright suite is missing.",
      evidencePaths: [toRepo(root, testPath)],
      blockers: flagshipTest.exists
        ? missingAll(flagshipTest.text, [
            "all shipped controls produce explicit gameplay proof",
            "KO state locks combat until reset",
            "normal play does not ship debug-style hit artifacts",
            "flagship proof exposes performance and audio budgets"
          ]).map((item) => `Missing Playwright gate: ${item}`)
        : ["Add apps/aura-clash-showcase/tests/flagship-readiness.spec.ts."]
    }),
    gate({
      id: "control-key-coverage",
      title: "A/D/S/Space/Shift/Q/J/K/L/P/R controls are release-gated",
      ok: includesAll(flagshipTest.text, [
        "KeyA",
        "KeyD",
        "KeyS",
        "Space",
        "ShiftLeft",
        "KeyQ",
        "KeyJ",
        "KeyK",
        "KeyL",
        "KeyP",
        "KeyR"
      ]),
      summary: "The flagship suite must exercise every shipped keyboard control, including down, guard, special, pause, and reset.",
      evidencePaths: [toRepo(root, testPath)],
      blockers: missingAll(flagshipTest.text, [
        "KeyA",
        "KeyD",
        "KeyS",
        "Space",
        "ShiftLeft",
        "KeyQ",
        "KeyJ",
        "KeyK",
        "KeyL",
        "KeyP",
        "KeyR"
      ]).map((code) => `Missing control coverage for ${code}.`)
    }),
    gate({
      id: "runtime-controls-proof",
      title: "Runtime proof publishes controls evidence every frame",
      ok:
        writeProofBlock.includes("controls:") &&
        includesAll(writeProofBlock, ["lastInput", "downSupported", "specialRequiresMeter", "koLocked", "resetCount"]),
      summary:
        "window.__AURA_CLASH_ARENA_PROOF__ must include controls.lastInput, downSupported, specialRequiresMeter, koLocked, and resetCount in the normal writeProof path.",
      evidencePaths: [toRepo(root, appSourcePath)],
      blockers: [
        ...(writeProofBlock.includes("controls:") ? [] : ["writeProof() does not publish a controls object in the normal runtime proof."]),
        ...missingAll(writeProofBlock, ["lastInput", "downSupported", "specialRequiresMeter", "koLocked", "resetCount"]).map(
          (field) => `writeProof() is missing controls.${field}.`
        )
      ]
    }),
    gate({
      id: "distinct-release-fighter-assets",
      title: "Flagship proof rejects same-model tinting and training mannequin fighters",
      ok:
        writeProofBlock.includes("fighterAssets:") &&
        computesDistinctFighterHashes &&
        source.text.includes("releaseReady: true") &&
        !source.text.includes("auraClashTrainingMannequin") &&
        flagshipTest.text.includes("flagship cannot use the same fighter GLB twice with tinting") &&
        flagshipTest.text.includes("training mannequin is not a release-facing player fighter"),
      summary:
        "The flagship route must publish player/rival typed fighter asset ids, URLs, hashes, distinctness, and release readiness. Same-model tinting and the training mannequin must fail release gates.",
      evidencePaths: [toRepo(root, appSourcePath), toRepo(root, testPath)],
      blockers: [
        ...(writeProofBlock.includes("fighterAssets:") ? [] : ["writeProof() does not publish proof.fighterAssets."]),
        ...(computesDistinctFighterHashes ? [] : ["fighter asset proof does not compute distinct hashes."]),
        ...(source.text.includes("releaseReady: true") ? [] : ["fighter asset proof does not mark the active player/rival assets as releaseReady: true."]),
        ...(source.text.includes("auraClashTrainingMannequin") ? ["Active flagship source still references auraClashTrainingMannequin; same-model training assets cannot be release proof."] : []),
        ...(flagshipTest.text.includes("flagship cannot use the same fighter GLB twice with tinting")
          ? []
          : ["flagship Playwright suite does not reject same-model tinting."]),
        ...(flagshipTest.text.includes("training mannequin is not a release-facing player fighter")
          ? []
          : ["flagship Playwright suite does not reject the training mannequin as a release-facing fighter."])
      ]
    }),
    gate({
      id: "ko-lock-reset-gated",
      title: "KO lock and reset behavior are release-gated",
      ok: includesAll(flagshipTest.text, ["koLocked", "totalHits", "KeyR", "Reset should clear", "attacks after KO must not"]),
      summary: "The flagship suite must prove KO cannot keep taking damage or repeat attacks until reset, and reset clears the round.",
      evidencePaths: [toRepo(root, testPath)],
      blockers: missingAll(flagshipTest.text, ["koLocked", "totalHits", "KeyR", "Reset should clear", "attacks after KO must not"]).map(
        (item) => `Missing KO/reset assertion token: ${item}`
      )
    }),
    gate({
      id: "normal-hit-vfx-no-debug-cubes",
      title: "Normal-play hit VFX are not debug cubes or generic box artifacts",
      ok: sparkBlock.length > 0 && !/Geometry\.litCube\(/.test(sparkBlock) && !/item\(`spark-/.test(sparkBlock),
      summary: "The normal hit-effect path must be a designed VFX path, not lit cube render items.",
      evidencePaths: [toRepo(root, appSourcePath), toRepo(root, testPath)],
      blockers: [
        ...(sparkBlock.length === 0 ? ["Could not find createSparkItems() implementation to audit."] : []),
        ...(/Geometry\.litCube\(/.test(sparkBlock) ? ["createSparkItems() still uses Geometry.litCube(), which matches the box-like hit artifact."] : []),
        ...(/item\(`spark-/.test(sparkBlock) ? ["createSparkItems() still emits generic spark cube render items in normal play."] : [])
      ]
    }),
    gate({
      id: "performance-proof-contract",
      title: "Flagship proof exposes explicit performance budgets",
      ok:
        writeProofBlock.includes("performance:") &&
        includesAll(source.text, ["frameTimeMs", "fps", "budgetOk"]) &&
        flagshipTest.text.includes("proof.performance"),
      summary: "The playable route must publish performance.frameTimeMs, fps, drawCalls, and budgetOk and the test suite must enforce thresholds.",
      evidencePaths: [toRepo(root, appSourcePath), toRepo(root, testPath)],
      blockers: [
        ...(writeProofBlock.includes("performance:") ? [] : ["writeProof() does not publish proof.performance."]),
        ...missingAll(source.text, ["frameTimeMs", "fps", "budgetOk"]).map((field) => `Performance field ${field} is missing from the route source.`),
        ...(flagshipTest.text.includes("proof.performance") ? [] : ["flagship-readiness.spec.ts does not assert proof.performance."])
      ]
    }),
    gate({
      id: "audio-proof-contract",
      title: "Flagship proof exposes audio readiness instead of silent placeholders",
      ok:
        writeProofBlock.includes("audio:") &&
        /AudioContext|HTMLAudioElement|game\.audio/.test(source.text) &&
        includesAll(source.text, ["musicReady", "sfxReady", "muted", "lastCue"]) &&
        flagshipTest.text.includes("proof.audio"),
      summary: "The playable route must publish audio readiness with music, SFX, mute, and last cue evidence.",
      evidencePaths: [toRepo(root, appSourcePath), toRepo(root, testPath)],
      blockers: [
        ...(writeProofBlock.includes("audio:") ? [] : ["writeProof() does not publish proof.audio."]),
        ...(/AudioContext|HTMLAudioElement|game\.audio/.test(source.text) ? [] : ["No concrete audio runtime path is present in the route source."]),
        ...missingAll(source.text, ["musicReady", "sfxReady", "muted", "lastCue"]).map((field) => `Audio field ${field} is missing from the route source.`),
        ...(flagshipTest.text.includes("proof.audio") ? [] : ["flagship-readiness.spec.ts does not assert proof.audio."])
      ]
    }),
    gate({
      id: "script-wiring",
      title: "Flagship gates are runnable from app and root package scripts",
      ok:
        appPackage.json?.scripts?.["test:flagship"] === "playwright test tests/flagship-readiness.spec.ts" &&
        appPackage.json?.scripts?.["flagship:readiness"] === "node scripts/check-flagship-readiness-evidence.mjs" &&
        appPackage.json?.scripts?.["flagship:gates"] === "node scripts/run-flagship-readiness-gates.mjs" &&
        rootPackage.json?.scripts?.["verify:aura-clash-flagship"] === "pnpm --dir apps/aura-clash-showcase flagship:gates",
      summary: "The new readiness tool and Playwright suite must be reachable through stable package scripts.",
      evidencePaths: [toRepo(root, appPackagePath), toRepo(root, rootPackagePath)],
      blockers: [
        ...(appPackage.json?.scripts?.["test:flagship"] === "playwright test tests/flagship-readiness.spec.ts"
          ? []
          : ["apps/aura-clash-showcase package.json is missing test:flagship."]),
        ...(appPackage.json?.scripts?.["flagship:readiness"] === "node scripts/check-flagship-readiness-evidence.mjs"
          ? []
          : ["apps/aura-clash-showcase package.json is missing flagship:readiness."]),
        ...(appPackage.json?.scripts?.["flagship:gates"] === "node scripts/run-flagship-readiness-gates.mjs"
          ? []
          : ["apps/aura-clash-showcase package.json is missing flagship:gates."]),
        ...(rootPackage.json?.scripts?.["verify:aura-clash-flagship"] === "pnpm --dir apps/aura-clash-showcase flagship:gates"
          ? []
          : ["root package.json is missing verify:aura-clash-flagship."])
      ]
    })
  ];

  const blockers = gates.flatMap((item) => item.blockers.map((blocker) => `${item.id}: ${blocker}`));
  const ok = gates.every((item) => item.ok);
  return {
    schema: "aura-clash-flagship-readiness",
    ok,
    status: ok ? "flagship-ready" : "flagship-blocked",
    generatedAt: new Date().toISOString(),
    appRoot: toRepo(root, appRoot),
    gates,
    blockers
  };
}

export function writeAuraClashFlagshipReadinessReport(
  report: AuraClashFlagshipReadinessReport,
  root = process.cwd(),
  outPath = defaultOutPath
): void {
  const absolute = join(root, outPath);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, `${JSON.stringify(report, null, 2)}\n`);
}

function gate(input: Omit<FlagshipGate, "status" | "ok"> & { readonly ok: boolean }): FlagshipGate {
  return {
    ...input,
    status: input.ok ? "pass" : "fail"
  };
}

function read(path: string): { readonly exists: boolean; readonly text: string } {
  if (!existsSync(path)) return { exists: false, text: "" };
  return { exists: true, text: readFileSync(path, "utf8") };
}

function readJson(path: string): { readonly exists: boolean; readonly json: any } {
  if (!existsSync(path)) return { exists: false, json: null };
  return { exists: true, json: JSON.parse(readFileSync(path, "utf8")) };
}

function block(text: string, start: RegExp, end: RegExp): string {
  const startMatch = start.exec(text);
  if (!startMatch || startMatch.index < 0) return "";
  const rest = text.slice(startMatch.index);
  const endMatch = end.exec(rest);
  return endMatch && endMatch.index >= 0 ? rest.slice(0, endMatch.index + endMatch[0].length) : rest;
}

function includesAll(text: string, tokens: readonly string[]): boolean {
  return tokens.every((token) => text.includes(token));
}

function missingAll(text: string, tokens: readonly string[]): readonly string[] {
  return tokens.filter((token) => !text.includes(token));
}

function toRepo(root: string, path: string): string {
  return relative(root, path).replaceAll("\\", "/");
}

function readOption(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const root = readOption("--root") ?? process.cwd();
  const outPath = readOption("--out") ?? defaultOutPath;
  const report = createAuraClashFlagshipReadinessReport(root);
  writeAuraClashFlagshipReadinessReport(report, root, outPath);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}
