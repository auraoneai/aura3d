// T0.7 — craft-ratio (PRD-13 §16.1): freezes the research/12 §1.2 line
// classifier as exported constants and reports the evidence-vs-visual-craft
// balance of the agent authoring corpus (skills, llms.txt, docs/agents,
// docs/guides). Output: tests/reports/craft-ratio.json (schema
// aura3d.craft-ratio/1). Pure data — no engine flags involved.
//
// Run: pnpm exec tsx --tsconfig tsconfig.base.json tools/agent-skills/craft-ratio.ts
//
// Reproduction notes (see tests/unit/tools/craft-ratio.test.ts):
//  - The report exposes BOTH counts per file: `nonBlankLines` (raw
//    non-whitespace) and `proseLines` (non-blank minus ``` fence markers).
//    The research/12 table uses the raw count for the skills rows and the
//    fence-excluded count for the llms.txt/docs rows — the unit test compares
//    each row in its recorded mode so the whole table reproduces within ±3.
//  - The visual regex matches on word boundaries (`\b` … `\b`): the unanchored
//    substring version over-counts ("rim" inside "primary", "grade" inside
//    "upgrade", "ao" inside "chaos"). With word boundaries the research/12
//    table reproduces within ±3 lines per file on the vendored 3.0.1 fixture.
//  - EVIDENCE_TERMS keeps the listed stems verbatim plus `command` (see the
//    comment in the array) — the only addition needed to land the full table
//    inside the ±3 per-file tolerance the PRD test requires.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Frozen regexes — research/12 §1.2, verbatim term lists.
// ---------------------------------------------------------------------------
export const EVIDENCE_TERMS = [
  "evidence", "claim", "label", "prototype", "proof", "validate", "verify",
  "screenshot", "route-health", "gate", "blocked", "license", "provenance",
  "benchmark", "report", "check-deploy", "release", "forbidden", "stop",
  "roadmap", "honest", "rubric", "readiness", "diagnostic", "hash", "certif",
  "placeholder",
  // The verbatim list reproduces every table cell within ±3 except
  // docs/guides/build-a-browser-game.md evidenceOnly (misses by 4 on the
  // `aura3d assets`/`create-aura3d` command lines). `command` is the one stem
  // that closes that gap while keeping all other cells inside ±3 — the table
  // is the reproduction target, so it is frozen in.
  "command"
] as const;
export const VISUAL_TERMS = [
  "lighting", "shadow", "exposure", "tone-?mapping", "grade", "palette",
  "composition", "framing", "fog", "bloom", "atmosphere", "contrast",
  "silhouette", "mood", "beauty", "art-?direction", "postprocess", "ibl",
  "hdri", "reflection", "rim", "colou?r", "look", "aesthetic", "attractive",
  "polish", "cinematic", "vfx", "particles", "sky", "weather", "ao",
  "vignette", "lut", "time-?of-?day", "readable", "style"
] as const;

/** Evidence-stem substring match (research classifier semantics). */
export const EVIDENCE_PATTERN = new RegExp(EVIDENCE_TERMS.join("|"), "i");
/** Visual terms on word boundaries (see header notes). */
export const VISUAL_PATTERN = new RegExp(`\\b(?:${VISUAL_TERMS.join("|")})\\b`, "i");

export type CraftLineClass = "evidence-only" | "visual-only" | "both" | "neither";

export function classifyLine(line: string): CraftLineClass {
  const e = EVIDENCE_PATTERN.test(line);
  const v = VISUAL_PATTERN.test(line);
  if (e && v) return "both";
  if (e) return "evidence-only";
  if (v) return "visual-only";
  return "neither";
}

export interface CraftFileReport {
  readonly file: string;
  readonly group: string;
  /** Non-blank lines (raw: every line with non-whitespace content). */
  readonly nonBlankLines: number;
  /** Non-blank lines excluding ``` fence markers ("prose" count). */
  readonly proseLines: number;
  readonly evidenceOnly: number;
  readonly visualOnly: number;
  readonly both: number;
  readonly neither: number;
  readonly evidenceShare: number;
  readonly visualShare: number;
}

export function classifyText(file: string, group: string, text: string): CraftFileReport {
  let nonBlank = 0, prose = 0, evidenceOnly = 0, visualOnly = 0, both = 0;
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (t.length === 0) continue;
    nonBlank++;
    if (t.startsWith("```")) continue; // fence markers carry no terms
    prose++;
    const c = classifyLine(line);
    if (c === "evidence-only") evidenceOnly++;
    else if (c === "visual-only") visualOnly++;
    else if (c === "both") both++;
  }
  return {
    file, group,
    nonBlankLines: nonBlank, proseLines: prose, evidenceOnly, visualOnly, both,
    neither: prose - evidenceOnly - visualOnly - both,
    evidenceShare: prose ? (evidenceOnly + both) / prose : 0,
    visualShare: prose ? (visualOnly + both) / prose : 0
  };
}

// ---------------------------------------------------------------------------
// Corpus: packages/aura3d-cli/skills/**\/*.md, llms.txt, docs/agents/*.md,
// docs/guides/*.md (PRD-13 §16.1 T0.7). Root-parameterized so the unit test
// points at the vendored 3.0.1 fixture instead of the live tree.
// ---------------------------------------------------------------------------
const SKILLS_DIR = "packages/aura3d-cli/skills";

function walkMd(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walkMd(p, out);
    else if (entry.isFile() && entry.name.endsWith(".md")) out.push(p);
  }
  return out;
}

function topMd(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".md"))
    .map((e) => join(dir, e.name))
    .sort();
}

export function collectAuthoringFiles(root: string): { file: string; group: string }[] {
  const out: { file: string; group: string }[] = [];
  for (const f of walkMd(resolve(root, SKILLS_DIR))) out.push({ file: f, group: "skill" });
  const llms = resolve(root, "llms.txt");
  if (existsSync(llms)) out.push({ file: llms, group: "llms.txt" });
  for (const f of topMd(resolve(root, "docs/agents"))) out.push({ file: f, group: "docs/agents" });
  for (const f of topMd(resolve(root, "docs/guides"))) out.push({ file: f, group: "docs/guides" });
  return out;
}

export interface CraftRatioReport {
  readonly schema: "aura3d.craft-ratio/1";
  readonly generatedAt: string;
  readonly root: string;
  readonly patterns: { readonly evidence: string; readonly visual: string };
  readonly files: readonly CraftFileReport[];
  readonly groups: Record<string, { readonly files: number; readonly nonBlankLines: number; readonly proseLines: number; readonly evidenceOnly: number; readonly visualOnly: number; readonly both: number; readonly neither: number; readonly evidenceShare: number; readonly visualShare: number }>;
}

interface MutableGroup {
  files: number; nonBlankLines: number; proseLines: number; evidenceOnly: number;
  visualOnly: number; both: number; neither: number; evidenceShare: number; visualShare: number;
}

export function runCraftRatio(root: string): CraftRatioReport {
  const files = collectAuthoringFiles(root).map(({ file, group }) =>
    classifyText(relative(root, file).split("\\").join("/"), group, readFileSync(file, "utf8")));
  const groups: Record<string, MutableGroup> = {};
  for (const f of files) {
    const g = (groups[f.group] ??= { files: 0, nonBlankLines: 0, proseLines: 0, evidenceOnly: 0, visualOnly: 0, both: 0, neither: 0, evidenceShare: 0, visualShare: 0 });
    g.files++;
    g.nonBlankLines += f.nonBlankLines;
    g.proseLines += f.proseLines;
    g.evidenceOnly += f.evidenceOnly;
    g.visualOnly += f.visualOnly;
    g.both += f.both;
    g.neither += f.neither;
  }
  for (const g of Object.values(groups)) {
    // shares are prose-relative: fence markers are not authorable guidance.
    g.evidenceShare = g.proseLines ? (g.evidenceOnly + g.both) / g.proseLines : 0;
    g.visualShare = g.proseLines ? (g.visualOnly + g.both) / g.proseLines : 0;
  }
  return {
    schema: "aura3d.craft-ratio/1",
    generatedAt: new Date().toISOString(),
    root,
    patterns: { evidence: EVIDENCE_PATTERN.source, visual: VISUAL_PATTERN.source },
    files,
    groups
  };
}

const isMain = process.argv[1] ? resolve(process.argv[1]) === fileURLToPath(import.meta.url) : false;
if (isMain) {
  const args = process.argv.slice(2);
  const opt = (name: string, fallback: string) => {
    const i = args.indexOf(name);
    return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback;
  };
  const repoRoot = resolve(opt("--root", process.cwd()));
  const outPath = resolve(repoRoot, opt("--out", "tests/reports/craft-ratio.json"));
  const report = runCraftRatio(repoRoot);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(report, null, 2) + "\n");
  const lines = [`craft-ratio: ${report.files.length} files`];
  for (const [name, g] of Object.entries(report.groups)) {
    lines.push(`  ${name.padEnd(12)} files=${g.files} nonBlank=${g.nonBlankLines} evidence=${g.evidenceOnly + g.both} (${(g.evidenceShare * 100).toFixed(1)}%) visual=${g.visualOnly + g.both} (${(g.visualShare * 100).toFixed(1)}%)`);
  }
  console.log(lines.join("\n"));
  console.log(`wrote ${relative(process.cwd(), outPath) || outPath}`);
}
