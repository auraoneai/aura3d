import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

import {
  gradeSceneFidelity,
  type CharacterFidelity,
  type CharacterFidelityInput,
  type FidelityProvenance,
  type FidelityRigGrade,
  type FidelityMotionSource,
  type SceneFidelity
} from "../../packages/create-aura3d/templates/animation-studio/src/fidelity.js";

/**
 * Animation Studio FIDELITY REPORT — PRD Phase M7.
 *
 * Surfaces the honest A/B/C fidelity tier per CHARACTER and per SCENE, joining the
 * REAL signals the pipeline already wrote:
 *  - per-character resolver reports (`dist/scene/<id>.resolver-report.json`) → rig grade,
 *  - the working document (`dist/scene/working.document.json`) → cast provenance,
 *  - the render summary (`render-live-summary.json`) → dominant motion source + shading.
 *
 * The UI (`apps/animation-studio-web`) reads the SAME `fidelity.ts` rules, so this
 * report and the studio badge always agree. A grade-C scene is labeled "previz" — it
 * must never be presented as finished. The report NEVER hard-codes a pass: the grade
 * is computed from the joined signals, and the scene grade is the floor of its cast.
 */

export interface FidelityReport {
  readonly schema: "animation-studio-fidelity/v1";
  readonly generatedAt: string;
  readonly sceneId: string;
  readonly scene: SceneFidelity;
  /** True for a grade-C scene — UI labels the output "previz". */
  readonly previz: boolean;
  readonly inputs: {
    readonly documentPath: string | null;
    readonly resolverReports: readonly string[];
    readonly summaryPath: string | null;
  };
}

export interface FidelityReportOptions {
  readonly sceneDir?: string;
  readonly documentPath?: string;
  readonly summaryPath?: string;
  readonly out?: string;
  readonly generatedAt?: string;
}

const defaultSceneDir = "packages/create-aura3d/templates/animation-studio/dist/scene";
const defaultSummaryPath =
  "packages/create-aura3d/templates/animation-studio/dist/episodes/live-3d/render-live-summary.json";
const defaultOut = "tests/reports/animation-studio/fidelity.json";

interface RuntimeCharacter {
  readonly id?: string;
  readonly source?: string;
  readonly sourceUrl?: string;
  readonly attribution?: string;
}
interface RuntimeDocument {
  readonly id?: string;
  readonly assets?: { readonly characters?: readonly RuntimeCharacter[] };
}
interface ResolverReport {
  readonly id?: string;
  readonly accepted?: { readonly rigGrade?: string } | null;
}
interface SummaryBodyMotion {
  readonly characterId?: string;
  readonly clipSource?: string;
}
interface RenderSummary {
  readonly bodyMotion?: readonly SummaryBodyMotion[];
  readonly toon?: { readonly bands?: number } | null;
  readonly quality?: { readonly tier?: string } | null;
  readonly realShadows?: boolean;
}

/** Classify document provenance into the fidelity provenance enum (mirrors the UI's castProvenance). */
function provenanceFor(c: RuntimeCharacter): FidelityProvenance {
  if (c.source === "curated") return "curated";
  if (c.source === "user-uploaded" || /^file:/i.test(c.sourceUrl ?? "")) return "user-uploaded";
  if (c.source === "catalog-resolved" || c.sourceUrl || c.attribution) return "catalog-resolved";
  return "authored-fallback";
}

function asRigGrade(value: unknown): FidelityRigGrade | undefined {
  return value === "A" || value === "B" || value === "C" || value === "D" ? value : undefined;
}

function asMotionSource(value: unknown): FidelityMotionSource | undefined {
  const v = typeof value === "string" ? value.toLowerCase() : "";
  const allowed: FidelityMotionSource[] = ["mocap", "extracted", "embedded", "procedural", "idle", "talk", "fallback"];
  return (allowed as string[]).includes(v) ? (v as FidelityMotionSource) : undefined;
}

export function createFidelityReport(root = process.cwd(), options: FidelityReportOptions = {}): FidelityReport {
  const sceneDirRel = options.sceneDir ?? defaultSceneDir;
  const documentRel = options.documentPath ?? join(sceneDirRel, "working.document.json");
  const summaryRel = options.summaryPath ?? defaultSummaryPath;

  const document = readJson<RuntimeDocument>(join(root, documentRel));
  const summary = readJson<RenderSummary>(join(root, summaryRel));

  // Rig grade per character from the resolver reports.
  const rigGrades = new Map<string, FidelityRigGrade>();
  const resolverReports: string[] = [];
  const absSceneDir = join(root, sceneDirRel);
  if (existsSync(absSceneDir)) {
    for (const file of readdirSync(absSceneDir)) {
      if (!file.endsWith(".resolver-report.json")) continue;
      const rel = join(sceneDirRel, file);
      const report = readJson<ResolverReport>(join(root, rel));
      if (!report) continue;
      resolverReports.push(rel);
      const grade = asRigGrade(report.accepted?.rigGrade);
      if (report.id && grade) rigGrades.set(report.id, grade);
    }
  }

  // Motion source per character from the render summary.
  const motionByChar = new Map<string, FidelityMotionSource>();
  for (const b of summary?.bodyMotion ?? []) {
    const ms = asMotionSource(b.clipSource);
    if (b.characterId && ms) motionByChar.set(b.characterId, ms);
  }

  // Scene-level shading/shadows from the render summary.
  const shading: "cel" | "pbr" | "none" = summary?.toon && (summary.toon.bands ?? 0) > 1 ? "cel" : summary ? "pbr" : "none";
  const shadows = summary?.realShadows === true;

  const characters = document?.assets?.characters ?? [];
  const inputs: CharacterFidelityInput[] = characters
    .filter((c): c is RuntimeCharacter & { id: string } => typeof c.id === "string")
    .map((c) => ({
      id: c.id,
      rigGrade: rigGrades.get(c.id),
      provenance: provenanceFor(c),
      motionSource: motionByChar.get(c.id),
      shading,
      shadows
    }));

  const scene = gradeSceneFidelity(inputs);

  return {
    schema: "animation-studio-fidelity/v1",
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    sceneId: document?.id ?? "untitled",
    scene,
    previz: scene.previz,
    inputs: {
      documentPath: document ? documentRel : null,
      resolverReports,
      summaryPath: summary ? summaryRel : null
    }
  };
}

export function writeFidelityReport(root: string, report: FidelityReport, out = defaultOut): void {
  const absoluteOut = join(root, out);
  mkdirSync(dirname(absoluteOut), { recursive: true });
  writeFileSync(absoluteOut, `${JSON.stringify(report, null, 2)}\n`);
}

function readJson<T>(absolutePath: string): T | null {
  try {
    return JSON.parse(readFileSync(absolutePath, "utf8")) as T;
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
if (
  currentScript.endsWith("tools/animation-studio-fidelity-report/index.ts") ||
  currentScript.endsWith("tools/animation-studio-fidelity-report/index.js")
) {
  const args = parseArgs(process.argv.slice(2));
  const root = process.cwd();
  const report = createFidelityReport(root, {
    sceneDir: typeof args["scene-dir"] === "string" ? args["scene-dir"] : undefined,
    documentPath: typeof args.document === "string" ? args.document : undefined,
    summaryPath: typeof args.summary === "string" ? args.summary : undefined
  });
  writeFidelityReport(root, report, typeof args.out === "string" ? args.out : defaultOut);
  console.log(`SCENE ${report.sceneId}: fidelity ${report.scene.grade}${report.previz ? " (PREVIZ — not finished)" : ""} — ${report.scene.reason}`);
  for (const c of report.scene.characters) {
    console.log(`  ${c.id}: ${c.grade}${c.previz ? " [previz]" : ""} — ${c.reason}`);
  }
}
