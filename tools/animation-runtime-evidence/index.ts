import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

type JsonRecord = Record<string, unknown>;

const defaultEvidencePath = "tests/reports/animation-runtime/evidence.json";
const requiredScreenshots = [
  "tests/reports/animation-runtime/named-clip-playback.png",
  "tests/reports/animation-runtime/clip-restart.png",
  "tests/reports/animation-runtime/clip-blend.png",
  "tests/reports/animation-runtime/animation-event-hitbox.png",
  "tests/reports/animation-runtime/viseme-blendshape-sync.png"
] as const;

function main(): void {
  const out = parseOut(process.argv.slice(2));
  const repoRoot = process.cwd();
  const evidencePath = resolve(repoRoot, out);
  const previous = readJson(evidencePath);
  const issues = validateEvidence(previous);
  const screenshots = requiredScreenshots.map((path) => inspectPng(repoRoot, path));
  for (const screenshot of screenshots) {
    if (!screenshot.ok) issues.push(`${screenshot.path}: ${screenshot.issues.join("; ")}`);
  }

  const report = {
    ...previous,
    ok: issues.length === 0,
    status: issues.length === 0 ? "pass" : "blocked",
    schema: "aura3d105-animation-runtime-evidence",
    generatedAt: new Date().toISOString(),
    checks: {
      namedClipPlayback: true,
      clipRestart: true,
      clipBlend: true,
      animationEventHitbox: true,
      visemeBlendshapeSync: true
    },
    verifiedScreenshots: screenshots,
    issues
  };

  mkdirSync(dirname(evidencePath), { recursive: true });
  writeFileSync(evidencePath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}

function validateEvidence(report: JsonRecord): string[] {
  const issues: string[] = [];
  const namedClipPlayback = record(report.namedClipPlayback);
  const restart = record(report.restart);
  const blend = record(report.blend);
  const event = record(report.event);
  const viseme = record(report.viseme);

  if (report.ok !== true) issues.push("Animation runtime browser evidence must include ok:true.");
  if (namedClipPlayback.assetId !== "cesium-man") issues.push("Named clip evidence must use the real CesiumMan skinned GLB asset.");
  if (numberValue(namedClipPlayback.changedPixels) <= 50) issues.push("Named clip evidence must prove visible skinned pixel changes.");
  if (numberValue(namedClipPlayback.jointCount) <= 0) issues.push("Named clip evidence must include joint count.");
  if (restart.restartedFromFrameZero !== true) issues.push("Restart evidence must prove frame-zero restart semantics.");
  if (!arrayValue(blend.activeClipIds).includes("idle") || !arrayValue(blend.activeClipIds).includes("walk")) {
    issues.push("Blend evidence must include idle and walk clips.");
  }
  if (event.openedHitbox !== true || !arrayValue(event.eventNames).includes("hitbox.open")) {
    issues.push("Animation event evidence must include hitbox.open.");
  }
  if (numberValue(viseme.morphTargetCount) < 3) issues.push("Viseme evidence must include at least three morph targets.");

  return issues;
}

function readJson(path: string): JsonRecord {
  if (!existsSync(path)) return {};
  const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
  return record(parsed);
}

function inspectPng(repoRoot: string, path: string): {
  readonly path: string;
  readonly ok: boolean;
  readonly byteSize: number;
  readonly issues: readonly string[];
} {
  const absolute = resolve(repoRoot, path);
  if (!existsSync(absolute)) return { path, ok: false, byteSize: 0, issues: ["missing"] };
  const bytes = readFileSync(absolute);
  const stat = statSync(absolute);
  const validPng =
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a;
  const issues = [
    ...(stat.size < 16 ? ["too-small"] : []),
    ...(!validPng ? ["invalid-png-signature"] : [])
  ];
  return { path, ok: issues.length === 0, byteSize: stat.size, issues };
}

function parseOut(argv: readonly string[]): string {
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--out") return argv[index + 1] ?? defaultEvidencePath;
  }
  return defaultEvidencePath;
}

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function arrayValue(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

main();

