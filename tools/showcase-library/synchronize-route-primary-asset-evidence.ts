import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { addAsset } from "../../packages/aura3d-cli/src/index.js";
import { readPngRenderedProbeMetrics } from "./png-foreground.mjs";

const routeId = process.argv[2];
const assetId = process.argv[3];
if (!routeId || !assetId) {
  throw new Error("Usage: synchronize-route-primary-asset-evidence <route-id> <asset-id>");
}

const root = resolve(process.cwd());
const manifest = JSON.parse(readFileSync(resolve(root, "aura.assets.json"), "utf8")) as {
  readonly assets: readonly Record<string, unknown>[];
};
const asset = manifest.assets.find((candidate) => candidate.id === assetId);
if (!asset) throw new Error(`Unknown asset ${assetId}`);
const source = String(asset.outputPath ?? "");
const assetHash = String(asset.hash ?? "");
if (!source || !assetHash) throw new Error(`${assetId} is missing outputPath/hash`);

const screenshot = `tests/reports/showcase-route-primary-probes/${routeId}.png`;
const screenshotBytes = readFileSync(resolve(root, screenshot));
const probeReport = JSON.parse(
  readFileSync(resolve(root, `tests/reports/showcase-route-primary-probes/${routeId}.json`), "utf8")
) as {
  readonly routePath: string;
  readonly generatedAt: string;
  readonly renderedProbe: {
    readonly foregroundBounds?: {
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
    };
  };
};
const metrics = readPngRenderedProbeMetrics(resolve(root, screenshot));
const renderedProbe = {
  url: screenshot,
  kind: "browser-screenshot" as const,
  renderer: "@aura3d/engine createAuraApp route-primary probe",
  route: probeReport.routePath,
  sha256: `sha256-${createHash("sha256").update(screenshotBytes).digest("hex")}`,
  assetHash,
  ...metrics,
  checkedAt: probeReport.generatedAt,
  ...(probeReport.renderedProbe.foregroundBounds
    ? { foregroundBounds: probeReport.renderedProbe.foregroundBounds }
    : {})
};
const orientation = asset.orientation && typeof asset.orientation === "object"
  ? {
      ...(asset.orientation as Record<string, unknown>),
      renderedProbe: {
        url: renderedProbe.url,
        sha256: renderedProbe.sha256,
        assetHash,
        checkedAt: renderedProbe.checkedAt,
        route: renderedProbe.route
      }
    }
  : undefined;

const result = addAsset({
  projectDir: root,
  file: source,
  name: assetId,
  copy: false,
  renderedProbe,
  ...(orientation ? { orientation: orientation as never } : {})
});
console.log(`${assetId}: ${result.ok ? "synchronized" : "failed"} ${renderedProbe.sha256}`);
