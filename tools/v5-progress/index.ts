import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

interface ProgressItem {
  readonly text: string;
  readonly checked: boolean;
}

const progressPath = resolve("docs/project/v5-roadmap-progress.md");
const progress = existsSync(progressPath) ? readFileSync(progressPath, "utf8") : "";
const items = parseChecklist(progress);
const completedMilestones = items.filter((item) => item.checked && /^Milestone \d+/.test(item.text));
const incompleteMilestones = items.filter((item) => !item.checked && /^Milestone \d+/.test(item.text));
const activeMilestone = matchLine(progress, /^Current milestone:\s*(.+)$/m) ?? "unknown";
const currentStatus = matchLine(progress, /^Current status:\s*(.+)$/m) ?? "unknown";
const lastVerifiedCommand = matchLine(progress, /^Last verified command:\s*(.+)$/m) ?? "unknown";
const lastVerifiedAt = matchLine(progress, /^Last verified at:\s*(.+)$/m) ?? "unknown";
const requiredMilestones = Array.from({ length: 21 }, (_, index) => `Milestone ${index}`);
const milestoneCoverage = requiredMilestones.map((milestone) => ({
  milestone,
  present: progress.includes(milestone)
}));
const activeItems = activeSectionItems(progress, "## Active Milestone");
const knownGaps = sectionBullets(progress, "## Known Gaps");
const blockedClaims = sectionBullets(progress, "## Blocked Claims");

const report = {
  schema: "g3d-v5-progress/v1",
  generatedAt: new Date().toISOString(),
  pass: existsSync(progressPath)
    && (currentStatus === "in-progress" || currentStatus === "complete")
    && (activeMilestone.startsWith("Milestone") || activeMilestone === "complete")
    && milestoneCoverage.every((entry) => entry.present)
    && (activeItems.length > 0 || currentStatus === "complete")
    && knownGaps.length > 0
    && blockedClaims.length > 0,
  progressPath: "docs/project/v5-roadmap-progress.md",
  currentStatus,
  activeMilestone,
  lastVerifiedCommand,
  lastVerifiedAt,
  completedMilestoneCount: completedMilestones.length,
  incompleteMilestoneCount: incompleteMilestones.length,
  milestoneCoverage,
  activeItems,
  knownGaps,
  blockedClaims,
  knownIncompleteMilestones: incompleteMilestones.map((item) => item.text)
};

mkdirSync(resolve("tests/reports"), { recursive: true });
writeFileSync(resolve("tests/reports/v5-progress.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (!report.pass) process.exitCode = 1;

function parseChecklist(markdown: string): ProgressItem[] {
  return markdown
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*-\s+\[(x| )\]\s+(.+)$/i))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match) => ({
      checked: match[1]?.toLowerCase() === "x",
      text: match[2] ?? ""
    }));
}

function matchLine(markdown: string, pattern: RegExp): string | undefined {
  return markdown.match(pattern)?.[1]?.trim();
}

function activeSectionItems(markdown: string, heading: string): readonly ProgressItem[] {
  const start = markdown.indexOf(heading);
  if (start < 0) return [];
  const rest = markdown.slice(start + heading.length);
  const next = rest.search(/\n##\s+/);
  const section = next >= 0 ? rest.slice(0, next) : rest;
  return parseChecklist(section);
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

