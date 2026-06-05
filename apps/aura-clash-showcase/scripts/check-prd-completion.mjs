#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(appRoot, "../..");

const prdPath = path.resolve(repoRoot, "docs/project/aura-clash-showcase.md");
const readinessPath = path.resolve(
  appRoot,
  process.env.AURA_CLASH_READINESS_OUT ?? "launch-evidence/readiness.json"
);
const outPath = path.resolve(
  appRoot,
  process.env.AURA_CLASH_COMPLETION_AUDIT_OUT ?? "launch-evidence/completion-audit.json"
);

const prd = fs.readFileSync(prdPath, "utf8");
const active = prd.split("\n# Legacy World War X PRD Archive")[0];
const unchecked = [...active.matchAll(/^(\s*)- \[ \] (.+)$/gm)].map((match) => ({
  label: match[2].trim(),
  line: lineNumberAt(active, match.index ?? 0)
}));
const readiness = readJsonIfPresent(readinessPath);
const readinessByLabel = new Map(
  (readiness?.gates ?? [])
    .filter((gate) => typeof gate.prdLabel === "string")
    .map((gate) => [gate.prdLabel, gate])
);
const readinessByLine = new Map(
  (readiness?.gates ?? [])
    .filter((gate) => Number.isFinite(Number(gate.prdLineHint)))
    .map((gate) => [Number(gate.prdLineHint), gate])
);

const open = unchecked.map((item) => {
  const readinessGate = readinessByLabel.get(item.label) ?? readinessByLine.get(item.line) ?? null;

  return {
    ...item,
    readinessGateId: readinessGate?.id ?? null,
    readinessMatchedBy: readinessByLabel.get(item.label) ? "label" : readinessGate ? "line" : "none",
    readinessOk: readinessGate?.ok === true,
    missingArtifactIds: readinessGate?.missingArtifactIds ?? [],
    commandPath: readinessGate?.commandPath ?? "No readiness mapping available."
  };
});

const report = {
  ok: open.length === 0,
  generatedAt: new Date().toISOString(),
  prd: toRepoRelative(prdPath),
  activeScopeEnd: "# Legacy World War X PRD Archive",
  readiness: toRepoRelative(readinessPath),
  readinessPresent: readiness !== null,
  activeUncheckedCount: open.length,
  open,
  boundary:
    "This completion audit proves only whether active Aura Clash showcase checkboxes remain unchecked. It does not generate evidence, deploy, run tests, or record user approval."
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);

if (!report.ok) {
  console.error(
    `Aura Clash showcase completion audit failed: ${open.length} active unchecked item(s) remain. Report: ${toRepoRelative(outPath)}`
  );
  for (const item of open) {
    console.error(`- ${toRepoRelative(prdPath)}:${item.line} ${item.label}`);
  }
  process.exitCode = 1;
} else {
  console.log(`Aura Clash showcase completion audit passed. Report: ${toRepoRelative(outPath)}`);
}

function readJsonIfPresent(target) {
  if (!fs.existsSync(target)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(target, "utf8"));
}

function lineNumberAt(text, index) {
  return text.slice(0, index).split("\n").length;
}

function toRepoRelative(target) {
  return path.relative(repoRoot, target).replaceAll(path.sep, "/");
}
