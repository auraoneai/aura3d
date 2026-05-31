import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const repoRoot = process.cwd();
const requestedRound = normalizeRoundArg(process.argv[2] ?? process.env.BENCHMARK_ROUND ?? "");
const round = requestedRound ?? latestDecisionRound();

if (!round) {
  fail("No benchmark decision found. Provide BENCHMARK_ROUND only after that round decision explicitly says `Decision: ship`.");
}

const promptResult = `benchmark/results/round-${round}.md`;
const engineResult = `benchmark/results/round-${round}-engine.md`;
const decisionResult = `benchmark/results/round-${round}-decision.md`;

for (const file of [promptResult, engineResult, decisionResult]) {
  if (!existsSync(join(repoRoot, file))) {
    fail(`Required release-proof file is missing: ${file}`);
  }
}

const decision = read(decisionResult);
if (!/^Decision:\s*`?ship`?\s*$/im.test(decision)) {
  fail(`${decisionResult} must contain a standalone \`Decision: ship\` line.`);
}
if (/do not ship|invalid for shipping|failed benchmark|no-ship/i.test(decision)) {
  fail(`${decisionResult} still contains failing/no-ship language.`);
}
if (!/User signature:\s*`?gchahal1982`?/i.test(decision)) {
  fail(`${decisionResult} must include the signed user approval for the passing decision.`);
}

const prompt = read(promptResult);
if (!/User signature:\s*`?gchahal1982`?/i.test(prompt)) {
  fail(`${promptResult} must include the signed user approval for the passing result.`);
}

const engine = read(engineResult);
if (!/User signature:\s*`?gchahal1982`?/i.test(engine)) {
  fail(`${engineResult} must include the signed user approval for the passing result.`);
}

const remaining = read("REMAINING.md");
for (const task of ["12", "17"]) {
  if (!new RegExp(`^- \\[x\\] ${task}\\.`, "m").test(remaining)) {
    fail(`REMAINING.md task ${task} must be checked before release publish.`);
  }
}

const changelog = read("CHANGELOG.md");
for (const file of [promptResult, engineResult, decisionResult]) {
  if (!changelog.includes(file)) {
    fail(`CHANGELOG.md must cite ${file} before release publish.`);
  }
}
const selectedRoundChangelog = changelogSectionsForRound(changelog, round);
if (!/\b(pass|passed|passing|ship|shipping|go-live ready)\b/i.test(selectedRoundChangelog)) {
  fail(`CHANGELOG.md must describe Round ${round} as passing before release publish.`);
}
if (/\b(fail|failed|no-ship|do not ship|invalid for shipping|not go-live ready)\b/i.test(selectedRoundChangelog)) {
  fail(`CHANGELOG.md contains failing/no-ship wording for selected Round ${round}.`);
}

console.log(`release-proof-ok: Round ${round} benchmark proof is present`);

function normalizeRoundArg(value) {
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^(?:round-?)?(\d+)$/i);
  if (!match) fail(`Invalid BENCHMARK_ROUND value: ${value}`);
  return match[1];
}

function latestDecisionRound() {
  const dir = join(repoRoot, "benchmark", "results");
  if (!existsSync(dir)) return null;
  return readdirSync(dir)
    .map((name) => name.match(/^round-(\d+)-decision\.md$/)?.[1] ?? null)
    .filter(Boolean)
    .sort((a, b) => Number(b) - Number(a))
    [0] ?? null;
}

function changelogSectionsForRound(changelog, round) {
  const lines = changelog.split(/\r?\n/);
  const mentions = [`round-${round}.md`, `round-${round}-engine.md`, `round-${round}-decision.md`, `Round ${round}`];
  const blocks = [];

  for (let index = 0; index < lines.length; index += 1) {
    if (!mentions.some((mention) => lines[index].includes(mention))) continue;
    const start = previousHeading(lines, index);
    const end = nextHeading(lines, index);
    blocks.push(lines.slice(start, end).join("\n"));
  }

  return blocks.join("\n\n");
}

function previousHeading(lines, index) {
  for (let cursor = index; cursor >= 0; cursor -= 1) {
    if (/^#{2,}\s+/.test(lines[cursor])) return cursor;
  }
  return 0;
}

function nextHeading(lines, index) {
  for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
    if (/^#{2,}\s+/.test(lines[cursor])) return cursor;
  }
  return lines.length;
}

function read(file) {
  return readFileSync(join(repoRoot, file), "utf8");
}

function fail(message) {
  console.error(`release-proof-error: ${message}`);
  process.exit(1);
}
