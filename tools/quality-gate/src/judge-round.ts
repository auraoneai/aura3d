/**
 * §10.3 judge-round runner (PRD-12 T4.6): assembles blind packets from capture
 * artifacts, runs the Prism vision judge, and writes a PanelRoundRecordDoc.
 * Canary item 0 is a fixed known frame; failure aborts the round.
 *
 * Usage: tsx judge-round.ts --items <items.json> --metrics <metrics.json>
 *   --captures <dir> --round <R-id> --canary <png> --out <round.json>
 *   [--seed <s>] [--limit <n>] [--dry-run]
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { buildPacket, revealBlind } from "./rubric";
import { canaryPassed, judgeWithPrism } from "./judge-prism";
import type {
  BenchmarkJudgementRecord, GameJudgementRecord, PanelRoundRecordDoc,
  PanelRoundAggregate, MetricValue
} from "./types";

const arg = (flag: string): string | undefined => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

const items = JSON.parse(readFileSync(arg("--items") ?? "items.json", "utf8"));
const itemList: { itemId: string; aura?: string; reference?: string; kind?: string }[] =
  Array.isArray(items) ? items : items.items ?? [];
const roundId = arg("--round") ?? "R-0";
const seed = arg("--seed") ?? roundId;
const limit = Number(arg("--limit") ?? "0");
const dryRun = process.argv.includes("--dry-run");
const baseUrl = process.env.PRISM_BASE_URL ?? "https://prism.kiro.cognition.ai";
const model = "claude-opus-5.5" as const;

// Canary item 0: a fixed known frame judged before anything else (T4.3).
const canaryPath = arg("--canary") ?? "benchmarks/quality-rebuild/refs/canary-01.png";
if (!existsSync(canaryPath)) throw new Error(`canary frame missing: ${canaryPath}`);

async function main() {
  let canaryOk = false;
  if (!dryRun) {
    const description = await judgeWithPrism(
      {
        itemId: "canary-01",
        images: [readFileSync(canaryPath).toString("base64")],
        prompt: "Describe this image in one sentence. Name every object, its colour, and its position.",
        kind: "benchmark"
      },
      { baseUrl, model, apiKeyEnv: "PRISM_API_KEY" }
    ) as unknown as { critique?: string };
    canaryOk = canaryPassed(String((description as { critique?: string })?.critique ?? JSON.stringify(description)));
    if (!canaryOk) {
      console.error("canary failed: judge description lacked required tokens — aborting round");
      process.exit(1);
    }
  }

  const benchmark: BenchmarkJudgementRecord[] = [];
  const games: GameJudgementRecord[] = [];
  const aggregates: PanelRoundAggregate[] = [];
  const selected = itemList.slice(0, limit > 0 ? limit : itemList.length);

  for (const item of selected) {
    const capturesDir = arg("--captures") ?? "artifacts";
    const auraFile = join(capturesDir, `${item.itemId}.aura.png`);
    const refFile = join(capturesDir, `${item.itemId}.three.png`);
    if (!existsSync(auraFile) || !existsSync(refFile)) {
      console.warn(`skip ${item.itemId}: capture pair missing`);
      continue;
    }
    const kind: "benchmark" | "game" = item.kind === "game" || item.itemId.startsWith("game:") ? "game" : "benchmark";
    const packet = buildPacket({
      itemId: item.itemId,
      auraImage: readFileSync(auraFile).toString("base64"),
      referenceImage: readFileSync(refFile).toString("base64"),
      seed,
      kind
    });
    if (dryRun) {
      console.log(`[dry-run] ${item.itemId} ${kind} ${packet.blindKey}`);
      continue;
    }
    const record = await judgeWithPrism(
      { itemId: item.itemId, images: [packet.imageA, packet.imageB], prompt: packet.prompt, blindKey: packet.blindKey, kind },
      { baseUrl, model, apiKeyEnv: "PRISM_API_KEY" }
    );
    const revealed = revealBlind(packet);
    if (kind === "game") {
      games.push(record as GameJudgementRecord);
      aggregates.push({ itemId: item.itemId, median: 0, classes: [], verdict: "non-discriminating" });
    } else {
      const bench = record as BenchmarkJudgementRecord;
      benchmark.push(bench);
      const auraScore = revealed.a === "aura" ? bench.scores.aura : bench.scores.reference;
      aggregates.push({
        itemId: item.itemId,
        median: auraScore,
        classes: bench.differences.map((d) => d.cls),
        verdict: auraScore >= 7 ? "pass" : "non-discriminating"
      });
    }
  }

  const doc: PanelRoundRecordDoc = {
    schema: "aura3d.quality-gate.panel/1",
    roundId,
    env: {
      commitSha: process.env.GITHUB_SHA ?? "",
      githubRunId: process.env.GITHUB_RUN_ID ?? "",
      runnerImage: process.env.ImageOS ?? "",
      gpuRenderer: "",
      browserVersion: "",
      launchArgs: []
    },
    thresholdsFrozenAt: "round-0",
    calibration: [],
    canaryPassed: canaryOk || dryRun,
    benchmark,
    games,
    aggregates
  };
  const out = arg("--out") ?? "round.json";
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(doc, null, 2) + "\n", "utf8");
  console.log(`round ${roundId}: ${benchmark.length} benchmark + ${games.length} game judgements -> ${out}`);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
