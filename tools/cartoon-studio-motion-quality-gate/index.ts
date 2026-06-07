import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { inspectSourceIntegrity } from "../cartoon-studio-package-proof/index.js";

export interface CartoonStudioMotionQualityReport {
  readonly schema: "cartoon-studio-motion-quality/v1";
  readonly ok: boolean;
  readonly generatedAt: string;
  readonly packageDir: string;
  readonly visualAcceptancePath: string;
  readonly videoPath: string;
  readonly videoExists: boolean;
  readonly videoBytes: number;
  readonly metrics: CartoonStudioMotionMetrics;
  readonly sourceIntegrity: ReturnType<typeof inspectSourceIntegrity>;
  readonly blockers: readonly string[];
}

export interface CartoonStudioMotionMetrics {
  readonly frameHashChanges: number;
  readonly globalMotionSegments: number;
  readonly independentRegionMotionSegments: number;
  readonly characterRegionMotionSegments: number;
  readonly mouthMotionSegments: number;
  readonly cameraMotionDeclared: boolean;
  readonly globalOnlyMotion: boolean;
  readonly flatLayerMotion: boolean;
}

export interface CartoonStudioMotionQualityOptions {
  readonly packageDir?: string;
  readonly out?: string;
  readonly generatedAt?: string;
  readonly minVideoBytes?: number;
  readonly minFrameHashChanges?: number;
  readonly minIndependentRegionMotionSegments?: number;
  readonly minCharacterRegionMotionSegments?: number;
  readonly minMouthMotionSegments?: number;
}

const defaultPackageDir = "dist/episodes/moon-garden-001";
const defaultOut = "tests/reports/aura3d11/cartoon-motion-quality.json";

export function createCartoonStudioMotionQualityReport(root = process.cwd(), options: CartoonStudioMotionQualityOptions = {}): CartoonStudioMotionQualityReport {
  const packageDir = options.packageDir ?? defaultPackageDir;
  const videoPath = join(packageDir, "episode.webm");
  const absoluteVideoPath = join(root, videoPath);
  const videoExists = existsSync(absoluteVideoPath);
  const videoBytes = videoExists ? statSync(absoluteVideoPath).size : 0;
  const visualAcceptancePath = join(packageDir, "visual-acceptance.json");
  const visualAcceptance = readJsonIfPresent(join(root, visualAcceptancePath));
  const renderManifestPath = join(packageDir, "render-manifest.json");
  const renderManifest = readJsonIfPresent(join(root, renderManifestPath));
  const metrics = extractMotionMetrics(visualAcceptance, renderManifest);
  const sourceIntegrity = inspectSourceIntegrity(root, [
    visualAcceptancePath,
    renderManifestPath,
    join(packageDir, "prompt-animation-evidence.json"),
    join(packageDir, "route-proof.json")
  ]);

  const blockers: string[] = [];
  const minVideoBytes = options.minVideoBytes ?? 32_768;
  const minFrameHashChanges = options.minFrameHashChanges ?? 8;
  const minIndependent = options.minIndependentRegionMotionSegments ?? 2;
  const minCharacter = options.minCharacterRegionMotionSegments ?? 2;
  const minMouth = options.minMouthMotionSegments ?? 1;

  if (!videoExists) blockers.push(`${videoPath} is missing.`);
  if (videoExists && videoBytes < minVideoBytes) blockers.push(`${videoPath} is below ${minVideoBytes} byte(s).`);
  if (!visualAcceptance) blockers.push(`${visualAcceptancePath} is missing or invalid.`);
  if (metrics.frameHashChanges < minFrameHashChanges) {
    blockers.push(`Only ${metrics.frameHashChanges} frame hash change(s); expected at least ${minFrameHashChanges}.`);
  }
  if (metrics.independentRegionMotionSegments < minIndependent) {
    blockers.push(`Only ${metrics.independentRegionMotionSegments} independent region motion segment(s); expected at least ${minIndependent}.`);
  }
  if (metrics.characterRegionMotionSegments < minCharacter) {
    blockers.push(`Only ${metrics.characterRegionMotionSegments} character/body region motion segment(s); expected at least ${minCharacter}.`);
  }
  if (metrics.mouthMotionSegments < minMouth) {
    blockers.push(`Only ${metrics.mouthMotionSegments} mouth motion segment(s); expected at least ${minMouth}.`);
  }
  if (metrics.globalOnlyMotion) blockers.push("Motion evidence reports global-only motion.");
  if (metrics.flatLayerMotion) blockers.push("Motion evidence reports flat-layer/background-and-character motion.");
  if (metrics.globalMotionSegments > 0 && metrics.independentRegionMotionSegments === 0 && !metrics.cameraMotionDeclared) {
    blockers.push("Frame changes appear to be global motion only and no shot camera move is declared.");
  }
  blockers.push(...sourceIntegrity.forbiddenEvidence.map((entry) => `${entry.path}: ${entry.detail}`));

  return {
    schema: "cartoon-studio-motion-quality/v1",
    ok: blockers.length === 0,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    packageDir,
    visualAcceptancePath,
    videoPath,
    videoExists,
    videoBytes,
    metrics,
    sourceIntegrity,
    blockers
  };
}

export function extractMotionMetrics(...sources: readonly unknown[]): CartoonStudioMotionMetrics {
  const values = sources.filter(Boolean);
  const metric = (keys: readonly string[], fallback = 0) => Math.max(fallback, ...values.flatMap((value) => numbersAt(value, keys)));
  const flags = (keys: readonly string[]) => values.some((value) => booleansAt(value, keys).some(Boolean));
  const frameHashes = values.flatMap((value) => stringsAt(value, ["frameHash", "hash", "sha256"]));
  const uniqueFrameHashes = new Set(frameHashes).size;
  const declaredFrameHashChanges = metric(["frameHashChanges", "changedFrameHashes", "uniqueFrameHashCount"], Math.max(0, uniqueFrameHashes - 1));
  return {
    frameHashChanges: declaredFrameHashChanges,
    globalMotionSegments: metric(["globalMotionSegments", "globalOnlySegments", "cameraMotionSegments"]),
    independentRegionMotionSegments: metric(["independentRegionMotionSegments", "localMotionSegments", "regionMotionSegments"]),
    characterRegionMotionSegments: metric(["characterRegionMotionSegments", "bodyRegionMotionSegments", "limbMotionSegments"]),
    mouthMotionSegments: metric(["mouthMotionSegments", "mouthMovementSegments", "visemeMotionSegments"]),
    cameraMotionDeclared: flags(["cameraMotionDeclared", "shotCameraMoveDeclared", "cameraMoveDeclared"]),
    globalOnlyMotion: flags(["globalOnlyMotion", "onlyGlobalMotion", "singleLayerMotion"]),
    flatLayerMotion: flags(["flatLayerMotion", "backgroundAndCharactersMoveTogether", "sourcePixelsAnimated"])
  };
}

export function writeCartoonStudioMotionQualityReport(root: string, report: CartoonStudioMotionQualityReport, out = defaultOut): void {
  const absoluteOut = join(root, out);
  mkdirSync(dirname(absoluteOut), { recursive: true });
  writeFileSync(absoluteOut, `${JSON.stringify(report, null, 2)}\n`);
}

function numbersAt(value: unknown, keys: readonly string[]): number[] {
  const results: number[] = [];
  visit(value, (entry, key) => {
    if (key && keys.includes(key) && typeof entry === "number" && Number.isFinite(entry)) results.push(entry);
  });
  return results;
}

function booleansAt(value: unknown, keys: readonly string[]): boolean[] {
  const results: boolean[] = [];
  visit(value, (entry, key) => {
    if (key && keys.includes(key) && typeof entry === "boolean") results.push(entry);
  });
  return results;
}

function stringsAt(value: unknown, keys: readonly string[]): string[] {
  const results: string[] = [];
  visit(value, (entry, key) => {
    if (key && keys.includes(key) && typeof entry === "string") results.push(entry);
  });
  return results;
}

function visit(value: unknown, callback: (value: unknown, key?: string) => void, key?: string): void {
  callback(value, key);
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((entry) => visit(entry, callback));
    return;
  }
  for (const [entryKey, entry] of Object.entries(value as Record<string, unknown>)) visit(entry, callback, entryKey);
}

function readJsonIfPresent(path: string): unknown | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function parseArgs(argv: readonly string[]) {
  const args: Record<string, string | boolean> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? "";
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      args[key] = next;
      index += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

const currentScript = process.argv[1] ? relative(process.cwd(), process.argv[1]) : "";
if (currentScript.endsWith("tools/cartoon-studio-motion-quality-gate/index.ts") || currentScript.endsWith("tools/cartoon-studio-motion-quality-gate/index.js")) {
  const args = parseArgs(process.argv.slice(2));
  const root = process.cwd();
  const report = createCartoonStudioMotionQualityReport(root, {
    packageDir: typeof args["package-dir"] === "string" ? args["package-dir"] : undefined
  });
  writeCartoonStudioMotionQualityReport(root, report, typeof args.out === "string" ? args.out : defaultOut);
  if (!report.ok) {
    console.error(report.blockers.join("\n"));
    process.exitCode = 1;
  }
}
