import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

/**
 * Animation Studio PROMPT-SPECIFICITY gate — PRD Phase H (H1) + D1.
 *
 * Reads the REAL render artifact `render-live-summary.json` and FAILS when the
 * rendered episode is actually the Moon-Garden fixture (or otherwise leaks the
 * moon-garden default cast/set/props). This is the "prompt universality unproven /
 * fixture leakage" defect: a prompt for "two robots in a garage" must NOT silently
 * render the moon garden.
 *
 * Two modes:
 *  - DEFAULT (no expectations supplied): any moon-garden marker anywhere in the
 *    summary fails the gate. Use this for arbitrary prompt renders that must never
 *    be the fixture.
 *  - With `prompt`/`expectTerms`: in addition, at least one prompt-derived term
 *    must appear in the rendered cast/set/captions (the render must reflect the
 *    prompt), AND no moon marker may appear unless the prompt itself asked for it.
 *
 * Markers checked (cast ids, set/scene ids, caption text, document path):
 *   moon, moon garden, moon-garden, moon lily/lilies, glow stone(s), miko, luma,
 *   miko-luma, mushroom prop(s).
 *
 * Never hard-codes a pass; fails on missing/malformed input.
 */

export interface PromptSpecificityReport {
  readonly schema: "animation-studio-prompt-specificity/v1";
  readonly ok: boolean;
  readonly generatedAt: string;
  readonly summaryPath: string;
  readonly summaryExists: boolean;
  readonly prompt: string | null;
  readonly moonGardenMarkersFound: readonly string[];
  readonly promptTermsMatched: readonly string[];
  readonly castIds: readonly string[];
  readonly blockers: readonly string[];
}

export interface PromptSpecificityOptions {
  readonly summaryPath?: string;
  readonly packageDir?: string;
  readonly out?: string;
  readonly generatedAt?: string;
  /** The prompt the scene was generated from (enables term-coverage checks). */
  readonly prompt?: string;
  /** Explicit terms expected to appear in the render (overrides prompt parsing). */
  readonly expectTerms?: readonly string[];
  /** Set true only when the prompt legitimately requested moon-garden content. */
  readonly allowMoonGarden?: boolean;
}

const defaultSummaryPath =
  "packages/create-aura3d/templates/animation-studio/dist/episodes/live-3d/render-live-summary.json";
const defaultOut = "tests/reports/animation-studio/prompt-specificity.json";

/** Moon-garden default-fixture markers. */
const MOON_MARKERS: readonly { readonly id: string; readonly re: RegExp }[] = [
  { id: "moon-garden", re: /moon[\s-]?garden/i },
  { id: "moon lilies", re: /moon\s+lil(?:y|ies)/i },
  { id: "glow stones", re: /glow[\s-]?stones?/i },
  { id: "mushroom props", re: /mushroom/i },
  { id: "miko cast", re: /\bmiko\b/i },
  { id: "luma cast", re: /\bluma\b/i },
  { id: "miko-luma cast", re: /miko[\s-]?luma/i }
];

const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "of", "in", "on", "at", "to", "with", "for", "two", "three",
  "is", "are", "be", "who", "that", "this", "their", "they", "them", "his", "her", "its", "as",
  "from", "by", "into", "over", "scene", "about", "while", "where", "when", "having"
]);

interface RenderLiveSummary {
  readonly route?: string;
  readonly framesDir?: string;
  readonly video?: string;
  readonly documentPath?: string;
  readonly promptText?: string;
  readonly stagedPerformance?: readonly { readonly characters?: readonly { readonly id?: string }[] }[];
  readonly seekProofs?: readonly {
    readonly caption?: { readonly text?: string } | null;
    readonly shot?: { readonly shotId?: string; readonly presetId?: string } | null;
    readonly characters?: readonly { readonly id?: string }[];
  }[];
  readonly captionProofs?: readonly { readonly text?: string; readonly shotId?: string }[];
  readonly set?: { readonly id?: string; readonly name?: string } | null;
}

function resolveSummaryPath(options: PromptSpecificityOptions): string {
  if (options.summaryPath) return options.summaryPath;
  if (options.packageDir) return join(options.packageDir, "render-live-summary.json");
  return defaultSummaryPath;
}

export function createPromptSpecificityReport(
  root = process.cwd(),
  options: PromptSpecificityOptions = {}
): PromptSpecificityReport {
  const summaryRel = resolveSummaryPath(options);
  const absoluteSummary = join(root, summaryRel);
  const summaryExists = existsSync(absoluteSummary);
  const summary = summaryExists ? (readJson(absoluteSummary) as RenderLiveSummary | null) : null;

  const prompt = options.prompt ?? summary?.promptText ?? null;
  const blockers: string[] = [];
  if (!summaryExists) {
    blockers.push(`${summaryRel} is missing — run scripts/render-live.ts to produce a real render.`);
  } else if (!summary) {
    blockers.push(`${summaryRel} is not valid JSON.`);
  }

  const castIds = new Set<string>();
  const haystackParts: string[] = [];
  if (summary) {
    haystackParts.push(summary.route ?? "", summary.framesDir ?? "", summary.video ?? "", summary.documentPath ?? "");
    haystackParts.push(summary.set?.id ?? "", summary.set?.name ?? "");
    for (const beat of summary.stagedPerformance ?? []) {
      for (const c of beat.characters ?? []) if (c.id) castIds.add(c.id);
    }
    for (const seek of summary.seekProofs ?? []) {
      haystackParts.push(seek.caption?.text ?? "", seek.shot?.shotId ?? "", seek.shot?.presetId ?? "");
      for (const c of seek.characters ?? []) if (c.id) castIds.add(c.id);
    }
    for (const cap of summary.captionProofs ?? []) {
      haystackParts.push(cap.text ?? "", cap.shotId ?? "");
    }
  }
  for (const id of castIds) haystackParts.push(id);
  const haystack = haystackParts.join("  ");

  const allowMoon = options.allowMoonGarden === true || (prompt ? /moon|miko|luma/i.test(prompt) : false);
  const moonGardenMarkersFound = summary
    ? MOON_MARKERS.filter((m) => m.re.test(haystack)).map((m) => m.id)
    : [];

  if (summary && moonGardenMarkersFound.length > 0 && !allowMoon) {
    blockers.push(
      `Render leaked the Moon-Garden fixture (markers: ${moonGardenMarkersFound.join(", ")}) — ` +
        `a non-moon prompt must not produce moon-garden cast/set/props.`
    );
  }

  // Prompt-term coverage: if we know the prompt, at least one meaningful term must
  // surface in the rendered cast/captions/set.
  const expectTerms = (options.expectTerms ?? (prompt ? extractTerms(prompt) : [])).map((t) => t.toLowerCase());
  const lowerHay = haystack.toLowerCase();
  const promptTermsMatched = expectTerms.filter((t) => lowerHay.includes(t));
  if (summary && expectTerms.length > 0 && promptTermsMatched.length === 0) {
    blockers.push(
      `None of the prompt terms (${expectTerms.join(", ")}) appear in the rendered cast/set/captions — ` +
        `the render does not reflect the prompt.`
    );
  }

  return {
    schema: "animation-studio-prompt-specificity/v1",
    ok: blockers.length === 0,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    summaryPath: summaryRel,
    summaryExists,
    prompt,
    moonGardenMarkersFound,
    promptTermsMatched,
    castIds: [...castIds].sort(),
    blockers
  };
}

function extractTerms(prompt: string): string[] {
  const words = prompt
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
  return [...new Set(words)];
}

export function writePromptSpecificityReport(
  root: string,
  report: PromptSpecificityReport,
  out = defaultOut
): void {
  const absoluteOut = join(root, out);
  mkdirSync(dirname(absoluteOut), { recursive: true });
  writeFileSync(absoluteOut, `${JSON.stringify(report, null, 2)}\n`);
}

function readJson(path: string): unknown | null {
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
if (
  currentScript.endsWith("tools/animation-studio-prompt-specificity-gate/index.ts") ||
  currentScript.endsWith("tools/animation-studio-prompt-specificity-gate/index.js")
) {
  const args = parseArgs(process.argv.slice(2));
  const root = process.cwd();
  const report = createPromptSpecificityReport(root, {
    summaryPath: typeof args.summary === "string" ? args.summary : undefined,
    packageDir: typeof args["package-dir"] === "string" ? args["package-dir"] : undefined,
    prompt: typeof args.prompt === "string" ? args.prompt : undefined,
    allowMoonGarden: args["allow-moon"] === true
  });
  writePromptSpecificityReport(root, report, typeof args.out === "string" ? args.out : defaultOut);
  console.log(
    `prompt=${report.prompt ?? "(none)"} cast=[${report.castIds.join(",")}] ` +
      `moonMarkers=[${report.moonGardenMarkersFound.join(",")}] termsMatched=[${report.promptTermsMatched.join(",")}]`
  );
  if (!report.ok) {
    console.error(report.blockers.join("\n"));
    process.exitCode = 1;
  } else {
    console.log("PASS: render is prompt-specific; no moon-garden fixture leakage.");
  }
}
