import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

export interface CartoonStudioVisualQualityFrame {
  readonly id: string;
  readonly path?: string;
  readonly exists: boolean;
  readonly bytes: number;
  readonly ok: boolean;
  readonly blockers: readonly string[];
}

export interface CartoonStudioVisualQualityReport {
  readonly schema: "cartoon-studio-visual-quality/v1";
  readonly ok: boolean;
  readonly generatedAt: string;
  readonly packageDir: string;
  readonly visualAcceptancePath: string;
  readonly frames: readonly CartoonStudioVisualQualityFrame[];
  readonly evidence: Record<string, unknown> | null;
  readonly blockers: readonly string[];
}

export interface CartoonStudioVisualQualityOptions {
  readonly packageDir?: string;
  readonly out?: string;
  readonly generatedAt?: string;
  readonly minFrameBytes?: number;
}

const defaultPackageDir = "dist/episodes/moon-garden-001";
const defaultOut = "tests/reports/aura3d11/cartoon-visual-quality.json";
const requiredFrameIds = ["first", "dialogue", "action", "final"] as const;

export function createCartoonStudioVisualQualityReport(root = process.cwd(), options: CartoonStudioVisualQualityOptions = {}): CartoonStudioVisualQualityReport {
  const packageDir = options.packageDir ?? defaultPackageDir;
  const minFrameBytes = options.minFrameBytes ?? 1_024;
  const visualAcceptancePath = join(packageDir, "visual-acceptance.json");
  const absoluteVisualPath = join(root, visualAcceptancePath);
  const evidence = readJsonIfPresent(absoluteVisualPath);
  const blockers: string[] = [];

  if (!evidence) {
    blockers.push(`${visualAcceptancePath} is missing or invalid.`);
  }

  if (evidence) {
    const publishReady = booleanAt(evidence, ["ok", "visualOk", "publishReady", "releaseReady"]).some(Boolean);
    if (!publishReady) blockers.push(`${visualAcceptancePath} does not declare ok/visualOk/publishReady/releaseReady true.`);
    if (booleanAt(evidence, ["blank", "isBlank", "debugOverlayVisible", "routeChromeVisible", "proofOverlayVisible", "browserUiVisible"]).some(Boolean)) {
      blockers.push(`${visualAcceptancePath} reports blank frames, route chrome, browser UI, debug overlays, or proof overlays.`);
    }
    if (numberAt(evidence, ["visibleCharacterCount", "charactersVisible"]).some((value) => value < 2)) {
      blockers.push(`${visualAcceptancePath} reports fewer than two visible characters.`);
    }
    if (numberAt(evidence, ["representativeFrameCount", "frameCount"]).some((value) => value < requiredFrameIds.length)) {
      blockers.push(`${visualAcceptancePath} reports too few representative frames.`);
    }
  }

  const frames = requiredFrameIds.map((id): CartoonStudioVisualQualityFrame => {
    const evidenceFramePath = framePathFor(evidence, id);
    const path = evidenceFramePath
      ? evidenceFramePath.startsWith(packageDir)
        ? evidenceFramePath
        : join(packageDir, evidenceFramePath)
      : join(packageDir, "frames", `${id}.png`);
    const absolutePath = join(root, path);
    const exists = existsSync(absolutePath);
    const bytes = exists ? statSync(absolutePath).size : 0;
    const frameBlockers: string[] = [];
    if (!exists) frameBlockers.push(`${path} is missing.`);
    if (exists && bytes < minFrameBytes) frameBlockers.push(`${path} is below ${minFrameBytes} byte(s).`);
    return {
      id,
      path,
      exists,
      bytes,
      ok: frameBlockers.length === 0,
      blockers: frameBlockers
    };
  });
  blockers.push(...frames.flatMap((frame) => frame.blockers));

  return {
    schema: "cartoon-studio-visual-quality/v1",
    ok: blockers.length === 0,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    packageDir,
    visualAcceptancePath,
    frames,
    evidence: evidence as Record<string, unknown> | null,
    blockers
  };
}

export function writeCartoonStudioVisualQualityReport(root: string, report: CartoonStudioVisualQualityReport, out = defaultOut): void {
  const absoluteOut = join(root, out);
  mkdirSync(dirname(absoluteOut), { recursive: true });
  writeFileSync(absoluteOut, `${JSON.stringify(report, null, 2)}\n`);
}

function framePathFor(evidence: unknown, id: string): string | undefined {
  if (!evidence || typeof evidence !== "object") return undefined;
  const record = evidence as Record<string, unknown>;
  const candidates = [
    record[`${id}Frame`],
    record[`${id}FramePath`],
    record[`${id}Screenshot`],
    record[`${id}ScreenshotPath`]
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string") return candidate;
  }
  const frames = record.frames;
  if (Array.isArray(frames)) {
    for (const frame of frames) {
      if (!frame || typeof frame !== "object") continue;
      const frameRecord = frame as Record<string, unknown>;
      if ((frameRecord.id === id || frameRecord.kind === id) && typeof frameRecord.path === "string") return frameRecord.path;
    }
  }
  return undefined;
}

function booleanAt(value: unknown, keys: readonly string[]): boolean[] {
  const results: boolean[] = [];
  visit(value, (entry, key) => {
    if (key && keys.includes(key) && typeof entry === "boolean") results.push(entry);
  });
  return results;
}

function numberAt(value: unknown, keys: readonly string[]): number[] {
  const results: number[] = [];
  visit(value, (entry, key) => {
    if (key && keys.includes(key) && typeof entry === "number") results.push(entry);
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
if (currentScript.endsWith("tools/cartoon-studio-visual-quality-gate/index.ts") || currentScript.endsWith("tools/cartoon-studio-visual-quality-gate/index.js")) {
  const args = parseArgs(process.argv.slice(2));
  const root = process.cwd();
  const report = createCartoonStudioVisualQualityReport(root, {
    packageDir: typeof args["package-dir"] === "string" ? args["package-dir"] : undefined
  });
  writeCartoonStudioVisualQualityReport(root, report, typeof args.out === "string" ? args.out : defaultOut);
  if (!report.ok) {
    console.error(report.blockers.join("\n"));
    process.exitCode = 1;
  }
}
