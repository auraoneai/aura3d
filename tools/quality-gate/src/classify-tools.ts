/**
 * T4.8 — mechanical tool classifier (research 14 §1.1 categories):
 *   browser-launch   launches a browser/renderer (playwright, puppeteer, chromium)
 *   pixel-decode     decodes pixels (pngjs/jimp/sharp/pixelmatch, readPixels, getImageData)
 *   reads-reports    reads tests/reports/**
 *   imports-three    imports the three package directly
 * "aggregator-only" = reads-reports AND NOT browser-launch AND NOT pixel-decode.
 * Output: tools/_quarantine/CLASSIFICATION.json.
 */
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

const RE_BROWSER_LAUNCH = /playwright|puppeteer|chromium|\.launch\(|new Browser|launchBrowser/;
const RE_PIXEL_DECODE = /pngjs|jimp|sharp|pixelmatch|readPixels|getImageData|decodePng|createImageBitmap/;
const RE_READS_REPORTS = /tests\/reports|tests\\reports/;
const RE_IMPORTS_THREE = /from\s+["']three["']|require\(\s*["']three["']|import\s+["']three["']/;

export interface ToolClassification {
  readonly dir: string;
  readonly files: number;
  readonly browserLaunch: boolean;
  readonly pixelDecode: boolean;
  readonly readsReports: boolean;
  readonly importsThree: boolean;
  readonly classification: "aggregator-only" | "runner" | "pixel-tool" | "library" | "empty";
}

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.(ts|mts|js|mjs|cjs)$/.test(entry)) yield p;
  }
}

export function classifyDir(dir: string): ToolClassification {
  let files = 0;
  let browserLaunch = false, pixelDecode = false, readsReports = false, importsThree = false;
  for (const file of walk(dir)) {
    files += 1;
    const src = readFileSync(file, "utf8");
    if (RE_BROWSER_LAUNCH.test(src)) browserLaunch = true;
    if (RE_PIXEL_DECODE.test(src)) pixelDecode = true;
    if (RE_READS_REPORTS.test(src)) readsReports = true;
    if (RE_IMPORTS_THREE.test(src)) importsThree = true;
  }
  const classification: ToolClassification["classification"] =
    files === 0 ? "empty"
    : readsReports && !browserLaunch && !pixelDecode ? "aggregator-only"
    : browserLaunch ? "runner"
    : pixelDecode ? "pixel-tool"
    : "library";
  return { dir, files, browserLaunch, pixelDecode, readsReports, importsThree, classification };
}

export function classifyTools(toolsRoot: string): ToolClassification[] {
  const out: ToolClassification[] = [];
  for (const entry of readdirSync(toolsRoot).sort()) {
    const dir = join(toolsRoot, entry);
    if (entry === "_quarantine" || !statSync(dir).isDirectory()) continue;
    if (!existsSync(dir)) continue;
    out.push(classifyDir(dir));
  }
  return out;
}

export interface ClassificationFile {
  readonly schema: "aura3d.quality-gate.classification/1";
  readonly generatedAt: string;
  readonly tools: readonly ToolClassification[];
  readonly aggregatorOnly: readonly string[];
}

export function toFile(rows: readonly ToolClassification[]): ClassificationFile {
  return {
    schema: "aura3d.quality-gate.classification/1",
    generatedAt: new Date().toISOString(),
    tools: rows,
    aggregatorOnly: rows.filter((r) => r.classification === "aggregator-only").map((r) => r.dir)
  };
}
