import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { inflateSync } from "node:zlib";
import { expect, test } from "@playwright/test";
import { startExampleDevServer } from "./example-dev-server";

const corridorProbeIds = ["ammoCrate", "medkit", "neonCorridorContainmentWorld", "neonContainmentWardenA", "neonContainmentWardenB", "neonContainmentPulseRifle"] as const;
type CorridorProbeId = typeof corridorProbeIds[number];

const reportDir = resolve("tests/reports/neon-corridor-strike/release-asset-probes");

test("writes six hash-bound Neon Corridor release probes", async ({ page }) => {
  test.setTimeout(240_000);
  const server = await startExampleDevServer();
  mkdirSync(reportDir, { recursive: true });
  try {
    for (const id of corridorProbeIds) {
      await page.goto(`${server.origin}/tests/browser/neon-corridor-release-asset-probe-harness.html?asset=${id}`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => Boolean(window.__AURA3D_CORRIDOR_RELEASE_PROBE__ || window.__AURA3D_CORRIDOR_RELEASE_PROBE_ERROR__), undefined, { timeout: 45_000 });
      const error = await page.evaluate(() => window.__AURA3D_CORRIDOR_RELEASE_PROBE_ERROR__);
      expect(error).toBeUndefined();
      const evidence = await page.evaluate(() => window.__AURA3D_CORRIDOR_RELEASE_PROBE__) as { id: CorridorProbeId; hash: string; route: string; foregroundBounds: { x: number; y: number; width: number; height: number }; diagnostics: { backend?: string; drawCalls: number }; failures: string[] };
      expect(evidence.failures).toEqual([]);
      expect(evidence.diagnostics.backend).toBe("production-runtime");
      const pngPath = resolve(reportDir, `${id}.png`);
      await page.locator("#probe-stage canvas").screenshot({ path: pngPath });
      const bytes = readFileSync(pngPath);
      const metrics = readPng(bytes);
      const checkedAt = new Date().toISOString();
      const renderedProbe = {
        url: `../../tests/reports/neon-corridor-strike/release-asset-probes/${id}.png`,
        kind: "browser-screenshot",
        renderer: "createAuraApp @aura3d/engine production-runtime",
        route: evidence.route,
        checkedAt,
        sha256: `sha256-${createHash("sha256").update(bytes).digest("hex")}`,
        assetHash: evidence.hash,
        ...metrics,
        foregroundBounds: evidence.foregroundBounds
      };
      writeFileSync(resolve(reportDir, `${id}.json`), `${JSON.stringify({ schema: "aura3d-neon-corridor-release-asset-probe/1.0", renderedProbe, evidence }, null, 2)}\n`);
      const roleNeedsForward = id === "neonContainmentWardenA" || id === "neonContainmentWardenB" || id === "neonContainmentPulseRifle";
      writeFileSync(resolve(reportDir, `${id}.orientation.json`), `${JSON.stringify({ orientation: {
        source: "manifest-override",
        ...(roleNeedsForward ? { forwardAxis: "+Z", upAxis: "+Y" } : {}),
        view: roleNeedsForward ? "hash-bound-route-facing-view" : "hash-bound-readable-prop-view",
        assetHash: evidence.hash,
        generatedBy: "tests/browser/neon-corridor-release-asset-probes.spec.ts",
        checkedAt,
        route: evidence.route,
        renderedProbe: { url: renderedProbe.url, sha256: renderedProbe.sha256, assetHash: evidence.hash, checkedAt, route: evidence.route },
        messages: [roleNeedsForward
          ? "The current hash-bound isolated root probe was reviewed +Y-up with the authored route-facing direction along +Z. It proves only static presentation; movement, aiming, hits, and damage remain route-local."
          : "The current hash-bound isolated root probe proves a readable static prop/environment presentation; no forward-axis or gameplay behavior is inferred."]
      } }, null, 2)}\n`);
    }
  } finally { await server.close(); }
});

function readPng(bytes: Buffer): { width: number; height: number; nonBlankPixels: number; colorBuckets: number } {
  let offset = 8, width = 0, height = 0, colorType = 0;
  const chunks: Buffer[] = [];
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset); offset += 4;
    const type = bytes.subarray(offset, offset + 4).toString("ascii"); offset += 4;
    const data = bytes.subarray(offset, offset + length); offset += length + 4;
    if (type === "IHDR") { width = data.readUInt32BE(0); height = data.readUInt32BE(4); colorType = data[9] ?? 0; }
    if (type === "IDAT") chunks.push(Buffer.from(data));
    if (type === "IEND") break;
  }
  const bpp = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 0 ? 1 : 0;
  if (!width || !height || !bpp) throw new Error(`unsupported PNG ${width}x${height} type ${colorType}`);
  const inflated = inflateSync(Buffer.concat(chunks));
  const rowLength = width * bpp;
  let previous = new Uint8Array(rowLength), nonBlankPixels = 0;
  const buckets = new Set<string>();
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * (rowLength + 1), filter = inflated[rowOffset] ?? 0;
    const row = new Uint8Array(rowLength);
    for (let x = 0; x < rowLength; x += 1) {
      const raw = inflated[rowOffset + 1 + x] ?? 0, left = x >= bpp ? row[x - bpp] ?? 0 : 0, up = previous[x] ?? 0, upLeft = x >= bpp ? previous[x - bpp] ?? 0 : 0;
      row[x] = (raw + predictor(filter, left, up, upLeft)) & 255;
    }
    for (let pixel = 0; pixel < width; pixel += 1) {
      const i = pixel * bpp, red = row[i] ?? 0, green = colorType === 0 ? red : row[i + 1] ?? 0, blue = colorType === 0 ? red : row[i + 2] ?? 0, alpha = colorType === 6 ? row[i + 3] ?? 255 : 255;
      if (alpha > 8 && (red > 8 || green > 8 || blue > 8)) { nonBlankPixels += 1; buckets.add(`${red >> 5}:${green >> 5}:${blue >> 5}`); }
    }
    previous = row;
  }
  return { width, height, nonBlankPixels, colorBuckets: buckets.size };
}

function predictor(filter: number, left: number, up: number, upLeft: number): number {
  if (filter === 0) return 0; if (filter === 1) return left; if (filter === 2) return up; if (filter === 3) return Math.floor((left + up) / 2);
  const p = left + up - upLeft, pa = Math.abs(p - left), pb = Math.abs(p - up), pc = Math.abs(p - upLeft); return pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
}
