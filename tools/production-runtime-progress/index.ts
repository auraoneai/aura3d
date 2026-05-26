import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

interface ProgressItem {
  readonly checked: boolean;
  readonly text: string;
}

const progressPath = "docs/project/production-runtime-roadmap-progress.md";
const progress = existsSync(resolve(progressPath)) ? readFileSync(resolve(progressPath), "utf8") : "";
const items = parseChecklist(progress);
const requiredMilestones = Array.from({ length: 19 }, (_, index) => `Milestone ${index}`);
const completedMilestones = items.filter((item) => item.checked && /^Milestone \d+/.test(item.text));
const incompleteMilestones = items.filter((item) => !item.checked && /^Milestone \d+/.test(item.text));
const activeItems = activeSectionItems(progress, "## Active Milestone");
const currentStatus = matchLine(progress, /^Current status:\s*(.+)$/m) ?? "unknown";
const activeMilestone = matchLine(progress, /^Current milestone:\s*(.+)$/m) ?? "unknown";
const knownGaps = sectionBullets(progress, "## Known Gaps");
const blockedClaims = sectionBullets(progress, "## Blocked Claims");
const milestoneCoverage = requiredMilestones.map((milestone) => ({ milestone, present: progress.includes(milestone) }));
const report = {
  schema: "a3d-production-runtime-progress/v1",
  generatedAt: new Date().toISOString(),
  pass: existsSync(resolve(progressPath))
    && (currentStatus === "in-progress" || currentStatus === "complete")
    && (activeMilestone.startsWith("Milestone") || activeMilestone === "complete")
    && milestoneCoverage.every((entry) => entry.present)
    && (activeItems.length > 0 || currentStatus === "complete")
    && knownGaps.length > 0
    && blockedClaims.length > 0,
  progressPath,
  currentStatus,
  activeMilestone,
  completedMilestoneCount: completedMilestones.length,
  incompleteMilestoneCount: incompleteMilestones.length,
  milestoneCoverage,
  activeItems,
  knownGaps,
  blockedClaims,
  knownIncompleteMilestones: incompleteMilestones.map((item) => item.text)
};
writeJson("tests/reports/production-runtime-progress.json", report);
console.log(JSON.stringify(report, null, 2));
if (!report.pass) process.exitCode = 1;

function parseChecklist(markdown: string): ProgressItem[] {
  return markdown
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*-\s+\[(x| )\]\s+(.+)$/i))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match) => ({ checked: match[1]?.toLowerCase() === "x", text: match[2] ?? "" }));
}

function matchLine(markdown: string, pattern: RegExp): string | undefined {
  return markdown.match(pattern)?.[1]?.trim();
}

function activeSectionItems(markdown: string, heading: string): readonly ProgressItem[] {
  const start = markdown.indexOf(heading);
  if (start < 0) return [];
  const rest = markdown.slice(start + heading.length);
  const next = rest.search(/\n##\s+/);
  return parseChecklist(next >= 0 ? rest.slice(0, next) : rest);
}

function sectionBullets(markdown: string, heading: string): readonly string[] {
  const start = markdown.indexOf(heading);
  if (start < 0) return [];
  const rest = markdown.slice(start + heading.length);
  const next = rest.search(/\n##\s+/);
  const section = next >= 0 ? rest.slice(0, next) : rest;
  return section
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*-\s+(?:\[[x ]\]\s+)?(.+)$/i)?.[1]?.trim())
    .filter((item): item is string => Boolean(item));
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(resolve(path)), { recursive: true });
  writeFileSync(resolve(path), `${JSON.stringify(value, null, 2)}\n`);
}
