import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { addAsset } from "../../packages/aura3d-cli/src/index.js";
import { readPngRenderedProbeMetrics } from "./png-foreground.mjs";

/**
 * Synchronizes an asset's manifest `renderedProbe` from its release asset-probe report.
 *
 * This is the companion to `synchronize-route-primary-asset-evidence.ts`, which reads a
 * *route* screenshot. The two are not interchangeable: a release asset probe renders the
 * asset alone on a dedicated 752x600 stage, so its foreground fills the frame, while a
 * route screenshot contains the whole scene and the isolated subject occupies a small
 * fraction of a 1440x900 image. Using the route producer for an asset whose evidence is
 * an asset probe replaces a large, readable subject measurement with a small one and
 * trips the role-aware readability rule.
 *
 * Usage: synchronize-release-asset-probe-evidence <asset-id>
 */

const assetId = process.argv[2];
if (!assetId) {
  throw new Error("Usage: synchronize-release-asset-probe-evidence <asset-id>");
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

const screenshot = `tests/reports/showcase-release-asset-probes/${assetId}.png`;
const reportPath = `tests/reports/showcase-release-asset-probes/${assetId}.json`;
const screenshotBytes = readFileSync(resolve(root, screenshot));
const probeReport = JSON.parse(readFileSync(resolve(root, reportPath), "utf8")) as {
  readonly generatedAt: string;
  readonly renderedProbe: { readonly route: string; readonly checkedAt?: string };
  readonly evidence: {
    readonly pixels: {
      readonly foregroundBounds?: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
    };
  };
};

const metrics = readPngRenderedProbeMetrics(resolve(root, screenshot));
const foregroundBounds = probeReport.evidence.pixels.foregroundBounds;
const renderedProbe = {
  url: screenshot,
  kind: "browser-screenshot" as const,
  renderer: "createAuraApp @aura3d/engine showcase release asset probe",
  route: probeReport.renderedProbe.route,
  sha256: `sha256-${createHash("sha256").update(screenshotBytes).digest("hex")}`,
  assetHash,
  ...metrics,
  checkedAt: probeReport.generatedAt,
  ...(foregroundBounds ? { foregroundBounds } : {})
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
console.log(`${assetId}: ${result.ok ? "synchronized" : "failed"} ${renderedProbe.sha256} fg=${foregroundBounds?.width}x${foregroundBounds?.height}`);
