// Applies look-dev verdicts to aura.library.json candidate entries → release
// (05-S9). Inputs are the per-asset `review.json` files `review-vision.ts`
// writes (--aura/--reference runs + needs-human routing), or a verdicts index:
//   { "runUrl": "<ci-run-url>", "entries": { "<id>": { score, verdict, notes } } }
//
// For every scored entry the driver appends the C-32 review record, marks
// lookDevApproved on accept, and flips quality to "release" when the intake
// admission record already passed (admission.status === "admitted" — the
// entry's gates ran at `library add` time; promotion does not re-run them).
// Entries whose intake admission is missing/rejected stay candidate and are
// reported as needing re-admission instead.
//
//   tsx --tsconfig tsconfig.base.json tools/asset-optimize/library-promote.mts \
//     --reviews <dir-of-review.json|index.json> --run <run-url> [--write]
// Without --write it prints the plan only (kit counts + unmet minimums).
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { readAuraLibrary, writeAuraLibrary, syncAuraLibrary } from "../../packages/aura3d-cli/src/library-manifest.js";

const argv = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};

const reviewsDir = flag("--reviews");
const runUrl = flag("--run") ?? "lookdev-manual";
const write = argv.includes("--write");
const repoRoot = process.cwd();

if (!reviewsDir) {
  console.error("usage: library-promote.mts --reviews <dir|index.json> --run <run-url> [--write]");
  process.exit(2);
}

interface VerdictInput {
  readonly score?: number;
  readonly verdict?: "accept" | "reject" | "needs-human";
  readonly notes?: string;
  readonly reviewer?: string;
  readonly judge?: "human" | "vision-model";
  readonly judgeId?: string;
  readonly axes?: Record<string, number>;
}

const loadVerdicts = (path: string): { runUrl: string; entries: Map<string, VerdictInput> } => {
  const entries = new Map<string, VerdictInput>();
  let url = runUrl;
  if (path.endsWith(".json")) {
    const doc = JSON.parse(readFileSync(path, "utf8"));
    if (doc.entries && typeof doc.entries === "object") {
      for (const [id, v] of Object.entries(doc.entries as Record<string, VerdictInput>)) entries.set(id, v);
      if (typeof doc.runUrl === "string") url = doc.runUrl;
    } else if (doc.asset) {
      // a single review-vision.ts review.json
      entries.set(doc.asset, doc as VerdictInput);
    }
    return { runUrl: url, entries };
  }
  for (const file of readdirSync(path)) {
    if (!file.endsWith(".json")) continue;
    const doc = JSON.parse(readFileSync(join(path, file), "utf8")) as { asset?: string } & VerdictInput;
    if (doc.asset) entries.set(doc.asset, doc);
  }
  return { runUrl: url, entries };
};

const { entries: verdicts } = loadVerdicts(resolve(repoRoot, reviewsDir));
const manifest = readAuraLibrary(repoRoot);
if (!manifest) throw new Error("no aura.library.json found");

const SCORE_ACCEPT = 6.5;
const report: { id: string; kit: string; action: string; detail: string }[] = [];
const promoted: typeof manifest.entries = manifest.entries.map((entry) => {
  const v = verdicts.get(entry.id);
  if (!v) return entry;
  const score = v.score;
  const verdict = v.verdict ?? (score !== undefined && score >= SCORE_ACCEPT ? "accept" : "reject");
  const review = {
    reviewer: v.reviewer ?? "lookdev",
    verdict: verdict === "needs-human" ? "reject" : verdict,
    notes: v.notes ?? `look-dev ${verdict} (score ${score ?? "n/a"})`,
    at: new Date().toISOString(),
    judge: { kind: (v.judge ?? "vision-model") as "human" | "vision-model", id: v.judgeId ?? "c32" },
    ...(score !== undefined ? { score } : {}),
    ...(v.axes ? { axes: v.axes } : {}),
  };
  const previous = entry.lookDev ?? { runUrl, reviews: [] as never[] };
  const lookDev = { ...previous, runUrl, reviews: [...previous.reviews, review] };
  const approved = verdict === "accept" || entry.lookDevApproved === true;
  const admissionOk = entry.admission?.status === "admitted";

  let action: string;
  if (verdict === "needs-human") action = "needs-human — recorded, stays candidate";
  else if (approved && admissionOk && entry.quality !== "release") action = "promote → release";
  else if (approved && !admissionOk) action = "look-dev ✓ but intake admission missing/rejected — stays candidate";
  else if (!approved) action = "reject — stays candidate";
  else action = "already release";
  report.push({ id: entry.id, kit: entry.kit, action, detail: `score=${score ?? "n/a"}` });

  const quality = approved && admissionOk ? "release" : entry.quality;
  return { ...entry, lookDev, lookDevApproved: approved, quality };
});

for (const r of report) console.log(`${r.kit}/${r.id}: ${r.action} (${r.detail})`);

const { issues } = syncAuraLibrary(repoRoot);
if (issues.length) console.warn(`sync issues: ${issues.map((i) => `${i.kit}/${i.entryId}: ${i.issue}`).join("; ")}`);

const kits = new Map<string, { candidate: number; release: number }>();
for (const e of promoted) {
  const k = kits.get(e.kit) ?? { candidate: 0, release: 0 };
  if ((e.quality ?? "candidate") === "release") k.release += 1; else k.candidate += 1;
  kits.set(e.kit, k);
}
console.log("\nkit minimums report (semantic minimums reviewed separately):");
for (const [kit, c] of [...kits.entries()].sort()) {
  console.log(`  ${kit}: ${c.release} release / ${c.candidate} candidate`);
}
const unmatched = [...verdicts.keys()].filter((id) => !manifest.entries.some((e) => e.id === id));
if (unmatched.length) console.warn(`verdicts with no library entry: ${unmatched.join(", ")}`);

if (write) {
  writeAuraLibrary(repoRoot, { ...manifest, entries: promoted });
  console.log(`\nwrote aura.library.json (${promoted.filter((e) => e.quality === "release").length} release entries).`);
} else {
  console.log("\ndry-run — pass --write to apply.");
}
