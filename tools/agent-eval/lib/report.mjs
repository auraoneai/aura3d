import { median, spread } from "./metrics.mjs";

const fmt = (v, digits = 1) => (v == null ? "n/a" : Number.isInteger(v) ? String(v) : v.toFixed(digits));
const num = (values) => values.filter((v) => typeof v === "number" && Number.isFinite(v));

function numCell(values, digits = 1) {
  const xs = num(values);
  if (!xs.length) return "n/a";
  const { min, max } = spread(xs);
  return `${fmt(median(xs), digits)} (${fmt(min, digits)}-${fmt(max, digits)}, n=${xs.length})`;
}

function rateCell(values) {
  const xs = values.filter((v) => typeof v === "boolean");
  if (!xs.length) return "n/a";
  return `${xs.filter(Boolean).length}/${xs.length}`;
}

const ROWS = [
  ["ended at the turn cap (unfinished)", (m) => m.hitTurnCap, "rate"],
  ["first-try typecheck", (m) => m.firstTryTypecheck, "rate"],
  ["first-try build (vite, stock)", (m) => m.firstTryBuild, "rate"],
  ["first-try renders non-black", (m) => m.firstTryRender, "rate"],
  ["final builds", (m) => m.finalBuild, "rate"],
  ["final renders non-black", (m) => m.finalRender, "rate"],
  ["probe checks passed (fraction)", (m) => m.probePassFraction, "num2"],
  ["judge checklist passed (fraction, model judge)", (m) => m.checklistPassFraction, "num2"],
  ["edits to green (typecheck)", (m) => m.editsToGreen, "num"],
  ["silent no-ops (model judge)", (m) => m.silentNoOps, "num"],
  ["agent turns", (m) => m.turns, "num"],
  ["agent wall time, s", (m) => m.agentWallSec, "num"],
  ["input tokens processed", (m) => m.tokensIn, "num0"],
  ["output tokens", (m) => m.tokensOut, "num0"],
  ["final source lines (src/)", (m) => m.srcLines, "num"],
  ["final source tokens (o200k)", (m) => m.srcTokens, "num0"],
  ["glue lines (model-estimated)", (m) => m.glueLines, "num"],
  ["docs files opened", (m) => m.docsFilesOpened, "num"],
  ["package/type files opened", (m) => m.typesFilesOpened, "num"],
  ["bundle raw KB (JS)", (m) => m.bundleRawKB, "num"],
  ["time to ready, ms (software GL)", (m) => m.readyMs, "num0"]
];

const TASK_NAMES = { 1: "PBR cube with orbit", 2: "forest of 10,000 instances", 3: "skinned character with crossfade", 4: "game loop (fixed step, score, restart)", 5: "shader water", 6: "complete mobile arcade game", 7: "prop on pedestal" };

export function renderReport({ batches, metrics, meta = {} }) {
  const valid = metrics.filter((m) => m.valid);
  const invalid = metrics.filter((m) => !m.valid);
  const tasks = [...new Set(metrics.map((m) => m.task))].sort((a, b) => a - b);
  const lines = [];
  lines.push(`# Cold-start authoring trial: ${batches.join(", ")}`);
  lines.push("");
  lines.push(`Generated ${meta.generated ?? new Date().toISOString()}. Harness: \`tools/agent-eval\`. Runs: ${metrics.length} (valid ${valid.length}, invalid ${invalid.length}).`);
  lines.push("");
  lines.push("**Read this first.** Fresh model agents (claude-sonnet-5.5 through Kiro Prism) with no repo context and no web access, one isolated sandbox per run. Build and render scoring ran on a remote CPU runner with software WebGL2 (SwiftShader): render and time-to-ready numbers say nothing about a real GPU. Every number is a median with (min-max, n) or a count out of n. With small n the table shows direction and spread, not statistical significance; nothing here is tuned, filtered or averaged into a score. Invalid runs (infrastructure failures) are listed, not hidden.");
  lines.push("");
  if (meta.docs) lines.push(`Aura3D arm docs: ${meta.docs}`);
  if (meta.library) lines.push(`Library under test: ${meta.library}`);
  if (meta.docs || meta.library) lines.push("");
  const arms = ["aura", "three", ...[...new Set(metrics.map((m) => m.arm))].filter((a) => a !== "aura" && a !== "three").sort()].filter((a) => metrics.some((m) => m.arm === a));
  const ARM_LABEL = { aura: "Aura3D (docs-only, 40-turn budget)", three: "three.js (40-turn budget)", "aura-cap100": "Aura3D (docs-only, 100-turn budget)" };
  for (const task of tasks) {
    const byArm = (arm) => valid.filter((m) => m.task === task && m.arm === arm);
    const groups = arms.map((arm) => ({ arm, runs: byArm(arm) }));
    lines.push(`## Task ${task}: ${TASK_NAMES[task] ?? ""}`);
    lines.push("");
    lines.push(`| Metric | ${groups.map((g) => `${ARM_LABEL[g.arm] ?? g.arm}, n=${g.runs.length}`).join(" | ")} |`);
    lines.push(`| --- | ${groups.map(() => "---").join(" | ")} |`);
    for (const [label, pick, kind] of ROWS) {
      const cell = (runs) => {
        const values = runs.map(pick);
        if (kind === "rate") return rateCell(values);
        return numCell(values, kind === "num2" ? 2 : kind === "num0" ? 0 : 1);
      };
      lines.push(`| ${label} | ${groups.map((g) => cell(g.runs)).join(" | ")} |`);
    }
    lines.push("");
    const failedProbes = (runs) => {
      const counts = {};
      for (const m of runs) for (const [k, v] of Object.entries(m.probeItems ?? {})) if (v === false) counts[k] = (counts[k] ?? 0) + 1;
      return Object.entries(counts)
        .sort((x, y) => y[1] - x[1])
        .map(([k, n]) => `${k} x${n}`)
        .join(", ");
    };
    lines.push(`Failed probe checks: ${groups.map((g) => `${ARM_LABEL[g.arm] ?? g.arm}: ${failedProbes(g.runs) || "none"}`).join("; ")}.`);
    lines.push("");
  }
  if (invalid.length) {
    lines.push("## Invalid runs");
    lines.push("");
    for (const m of invalid) lines.push(`- ${m.runId}: ${m.invalidReason ?? "unknown"}`);
    lines.push("");
  }
  lines.push("## Caveats");
  lines.push("");
  for (const c of meta.caveats ?? []) lines.push(`- ${c}`);
  lines.push("");
  return lines.join("\n");
}
