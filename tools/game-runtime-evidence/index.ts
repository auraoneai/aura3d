import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

type JsonRecord = Record<string, unknown>;

type InspectedJson = {
  readonly relativePath: string;
  readonly exists: boolean;
  readonly ok: boolean;
  readonly parseError?: string;
  readonly json?: JsonRecord;
};

const root = process.cwd();
const reportPath = "tests/reports/game-runtime/game-runtime-evidence.json";

const requiredManifestPaths = [
  "tests/reports/game-runtime/browser-evidence.manifest.json",
  "tests/reports/game-runtime/runtime-evidence.manifest.json"
] as const;

const sourceProofPaths = [
  "tests/reports/game-runtime/rendered-movement-evidence.json",
  "tests/reports/game-runtime/combat-visual-evidence.json",
  "tests/reports/game-runtime/typed-glb-runtime-node-mutation-evidence.json"
] as const;

const requiredProofIds = [
  "renderedMovement",
  "controls",
  "physics",
  "collision",
  "animationStateChanges",
  "nonblankVisualOutput",
  "hitboxOverlay",
  "hitSpark",
  "cameraShake",
  "hudUpdate",
  "typedGlbRuntimeNodeMutation"
] as const;

const requiredSystems = [
  "mutableNodes",
  "frameLoop",
  "input",
  "physics",
  "collision",
  "animation",
  "effectsPlan",
  "cameraPlan",
  "stage"
] as const;

const manifests = requiredManifestPaths.map(inspectJson);
const sourceProofReports = sourceProofPaths.map(inspectJson);
const browserCommandReport = inspectJson("tests/reports/game-runtime/browser.json");
const proofIdsFound = unique(sourceProofReports.flatMap((report) => getStringArray(report.json, "proofIds")));
const missingProofIds = requiredProofIds.filter((proofId) => !proofIdsFound.includes(proofId));
const screenshots = sourceProofReports.flatMap((report) => {
  const screenshot = asRecord(report.json?.screenshot);
  if (!screenshot) return [];
  return [{
    reportPath: report.relativePath,
    path: typeof screenshot.path === "string" ? screenshot.path : "",
    sha256: typeof screenshot.sha256 === "string" ? screenshot.sha256 : "",
    width: typeof screenshot.width === "number" ? screenshot.width : 0,
    height: typeof screenshot.height === "number" ? screenshot.height : 0
  }];
});
const systems = {
  mutableNodes: proofIdsFound.includes("typedGlbRuntimeNodeMutation") && proofIdsFound.includes("renderedMovement"),
  frameLoop: proofIdsFound.includes("renderedMovement"),
  input: proofIdsFound.includes("controls"),
  physics: proofIdsFound.includes("physics"),
  collision: proofIdsFound.includes("collision"),
  animation: proofIdsFound.includes("animationStateChanges"),
  effectsPlan: proofIdsFound.includes("hitSpark"),
  cameraPlan: proofIdsFound.includes("cameraShake"),
  stage: proofIdsFound.includes("nonblankVisualOutput")
} satisfies Record<(typeof requiredSystems)[number], boolean>;
const missingSystems = requiredSystems.filter((system) => systems[system] !== true);
const missingScreenshots = screenshots.filter((screenshot) =>
  screenshot.path.length === 0 ||
  !screenshot.sha256.startsWith("sha256:") ||
  screenshot.width <= 0 ||
  screenshot.height <= 0
);
const missingSourceReports = sourceProofReports.filter((report) => !report.exists || !report.ok).map((report) => report.relativePath);
const missingManifests = manifests.filter((report) => !report.exists || !report.ok).map((report) => report.relativePath);
const ok =
  missingManifests.length === 0 &&
  missingSourceReports.length === 0 &&
  missingProofIds.length === 0 &&
  missingSystems.length === 0 &&
  screenshots.length >= 3 &&
  missingScreenshots.length === 0 &&
  browserCommandReport.ok;
const runtimeFrame = Math.max(0, ...sourceProofReports.map((report) => getNestedNumber(report.json, ["runtime", "frame"])));
const output = {
  kind: "aura3d-game-runtime-evidence",
  ok,
  status: ok ? "browser-runtime-evidence-collected" : "execution-required",
  generatedAt: new Date().toISOString(),
  reportPath,
  collector: "collectGameRuntimeEvidence(app) source-level browser proof aggregation",
  claimBoundary:
    "This report is only passing after browser proof JSON files with screenshot hashes exist. Source declarations or pending manifests alone do not satisfy release evidence gates.",
  requiredManifests: [...requiredManifestPaths],
  requiredSourceProofReports: [...sourceProofPaths],
  manifests,
  sourceProofReports,
  requiredProofIds: [...requiredProofIds],
  proofIdsFound,
  missingProofIds,
  requiredSystems: [...requiredSystems],
  systems,
  missingSystems,
  screenshots,
  missingScreenshots,
  routeHealth: {
    status: browserCommandReport.ok ? "pass" : "pending-or-failed",
    commandReport: browserCommandReport
  },
  runtime: {
    frame: runtimeFrame
  }
};

mkdirSync(dirname(resolve(root, reportPath)), { recursive: true });
writeFileSync(resolve(root, reportPath), `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(JSON.stringify(output, null, 2));
if (!ok) process.exitCode = 1;

function inspectJson(relativePath: string): InspectedJson {
  const absolutePath = resolve(root, relativePath);

  if (!existsSync(absolutePath)) {
    return {
      relativePath,
      exists: false,
      ok: false
    };
  }

  try {
    const json = JSON.parse(readFileSync(absolutePath, "utf8")) as JsonRecord;
    return {
      relativePath,
      exists: true,
      ok: json.ok === true || json.status === "pending-execution",
      json
    };
  } catch (error) {
    return {
      relativePath,
      exists: true,
      ok: false,
      parseError: error instanceof Error ? error.message : String(error)
    };
  }
}

function asRecord(value: unknown): JsonRecord | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : undefined;
}

function getStringArray(json: JsonRecord | undefined, key: string): string[] {
  const value = json?.[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function getNestedNumber(json: JsonRecord | undefined, keys: readonly string[]): number {
  let current: unknown = json;

  for (const key of keys) {
    const record = asRecord(current);
    if (!record) return 0;
    current = record[key];
  }

  return typeof current === "number" && Number.isFinite(current) ? current : 0;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}
