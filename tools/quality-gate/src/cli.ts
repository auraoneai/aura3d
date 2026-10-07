/**
 * §10.3 multi-sub dispatcher: `tsx src/cli.ts <gate|calibrate|report|classify-tools|propose-golden>`.
 * Each sub reads JSON inputs, runs the pure module, writes JSON/markdown output.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { evaluateGates } from "./verdict";
import { calibrate, selfTest } from "./calibrate";
import { loadGoldens, proposeGoldenUpdate } from "./golden";
import { stepSummary, writeStepSummary } from "./report";
import { classifyTools, toFile } from "./classify-tools";
import type { CapturedItem, GoldenManifest, MetricValue, PanelRoundRecordDoc } from "./types";

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const need = (flag: string): string => {
  const v = arg(flag);
  if (!v) { console.error(`missing ${flag}`); process.exit(2); }
  return v!;
};
const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, "utf8")) as T;
const writeJson = (path: string, value: unknown): void => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n", "utf8");
};

const sub = process.argv[2];
switch (sub) {
  case "gate": {
    const items = readJson<CapturedItem[]>(need("--items"));
    const metricsDoc = readJson<{ items: { itemId: string; metrics: MetricValue[] }[] }>(need("--metrics"));
    const goldens = existsSyncSafe(arg("--goldens"))
      ? loadGoldens(arg("--goldens")!)
      : { schema: "aura3d.quality-gate.goldens/1" as const, runnerImage: "", gpuRenderer: "", entries: [] };
    const metrics = new Map(metricsDoc.items.map((i) => [i.itemId, i.metrics] as const));
    const { itemVerdicts, exitCode } = evaluateGates({ items: items.map((item) => ({ item })), metrics, goldens });
    const verdicts = Object.fromEntries([...itemVerdicts].map(([id, v]) => [id, v]));
    writeJson(arg("--out") ?? "verdicts.json", { itemVerdicts: verdicts, exitCode });
    process.exit(exitCode);
  }
  case "calibrate": {
    const items = readJson<CapturedItem[]>(need("--items"));
    const inputs = readJson<Record<string, Parameters<typeof calibrate>[1]>>(need("--inputs"));
    const reports = items.map((item) => calibrate(item, inputs[item.itemId] ?? { noise: [], variants: {} }));
    const broken = reports.filter((r) => r.uncoveredControls.length > 0);
    const selfTestMetrics = existsSyncSafe(arg("--self-test"))
      ? readJson<Record<string, Record<string, MetricValue[]>>>(arg("--self-test")!)
      : {};
    const selfTestFailures = reports.flatMap((r) =>
      (selfTestMetrics[r.itemId] ? selfTest(r, selfTestMetrics[r.itemId] as never) : []).map((c) => `${r.itemId}:${c}`)
    );
    writeJson(arg("--out") ?? "calibration.json", { reports, calibrationBroken: broken.map((r) => r.itemId), selfTestFailures });
    if (broken.length > 0 || selfTestFailures.length > 0) process.exit(1); // calibration-broken
    break;
  }
  case "report": {
    const verdictsDoc = readJson<{ itemVerdicts: Record<string, string[]> }>(need("--verdicts"));
    const metricsDoc = readJson<{ items: { itemId: string; metrics: MetricValue[] }[] }>(need("--metrics"));
    const rows = Object.entries(verdictsDoc.itemVerdicts).map(([itemId, v]) => ({
      itemId,
      verdicts: v as never,
      metrics: metricsDoc.items.find((i) => i.itemId === itemId)?.metrics ?? []
    }));
    writeStepSummary(stepSummary(rows, new Map()), arg("--out") ?? "step-summary.md");
    break;
  }
  case "classify-tools": {
    const rows = classifyTools(arg("--root") ?? resolve(process.cwd(), ".."));
    const out = arg("--out") ?? resolve(process.cwd(), "../_quarantine/CLASSIFICATION.json");
    writeJson(out, toFile(rows));
    console.log(`${out}: ${rows.filter((r) => r.classification === "aggregator-only").length} aggregator-only of ${rows.length}`);
    break;
  }
  case "propose-golden": {
    const items = readJson<CapturedItem[]>(need("--items"));
    const round = readJson<PanelRoundRecordDoc>(need("--round"));
    const cal = readJson<{ reports: { itemId: string; thresholds: never[] }[] }>(need("--calibration"));
    const current = existsSyncSafe(arg("--current")) ? loadGoldens(arg("--current")!) : undefined;
    const calibrations = new Map(cal.reports.map((r) => [r.itemId, r.thresholds] as const));
    const manifest = proposeGoldenUpdate({
      items, round, calibrations,
      ...(current ? { current } : {}),
      runnerImage: items[0]?.env.runnerImage ?? "",
      gpuRenderer: items[0]?.env.gpuRenderer ?? ""
    });
    writeJson(arg("--out") ?? "goldens-proposed.json", manifest);
    break;
  }
  default:
    console.error("usage: cli.ts <gate|calibrate|report|classify-tools|propose-golden> [flags]");
    process.exit(2);
}

function existsSyncSafe(path: string | undefined): path is string {
  return typeof path === "string" && existsSyncFs(path);
}
function existsSyncFs(path: string): boolean {
  try { readFileSync(path); return true; } catch { return false; }
}
