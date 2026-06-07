import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { createServer, type ViteDevServer } from "vite";

test.describe("Aura3D Cartoon Studio render export boundary", () => {
  test.setTimeout(90_000);
  let server: ViteDevServer;
  let origin: string;

  test.beforeAll(async () => {
    ({ server, origin } = await startCartoonStudioServer());
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("exposes render package requirements and does not treat source-only proof as publish-ready export", async ({ page }) => {
    await page.goto(origin, { waitUntil: "domcontentloaded" });
    await expect(page.locator("#cartoon-studio-panel")).toBeVisible();

    const proof = await page.evaluate(() => {
      const proof = (window as unknown as {
        __AURA3D_CARTOON_EPISODE_PROOF__?: {
          readonly renderQueueItems?: number;
          readonly renderStatus?: { readonly sourceOnlyAcceptedAsPublishProof?: boolean };
          readonly publishReadiness?: { readonly ready?: boolean; readonly issues?: readonly string[] };
          readonly sampleRenderSourceWorkflow?: {
          readonly sourceOnly?: boolean;
          readonly artifacts?: Record<string, unknown>;
          readonly missingForPublishReady?: readonly string[];
          readonly packageReadinessChecklist?: readonly string[];
          readonly requiredEvidenceJsonFields?: readonly string[];
          readonly remainingProofGates?: readonly string[];
          };
          readonly studio?: {
            readonly renderPipeline?: { readonly outputs?: readonly string[]; readonly itemCount?: number; readonly publishReadyFromCurrentEvidence?: boolean; readonly issueCount?: number };
          };
        };
      }).__AURA3D_CARTOON_EPISODE_PROOF__;
      return {
        renderQueueItems: proof?.renderQueueItems,
        publishReadiness: proof?.publishReadiness,
        sampleRenderSourceWorkflow: proof?.sampleRenderSourceWorkflow,
        renderPipeline: proof?.studio?.renderPipeline,
        sourceOnlyAcceptedAsPublishProof: proof?.renderStatus?.sourceOnlyAcceptedAsPublishProof
      };
    });

    expect(proof.renderQueueItems).toBeGreaterThan(0);
    expect(proof.renderPipeline?.itemCount).toBe(proof.renderQueueItems);
    expect(proof.renderPipeline?.outputs).toEqual(
      expect.arrayContaining(["mp4", "webm", "caption-vtt", "caption-srt", "thumbnail", "timeline-json", "evidence-json", "youtube-metadata"])
    );
    expect(proof.sampleRenderSourceWorkflow?.sourceOnly).toBe(true);
    expect(proof.sourceOnlyAcceptedAsPublishProof).toBe(false);
    expect(proof.sampleRenderSourceWorkflow?.requiredEvidenceJsonFields ?? []).toContain("artifacts.video");
    expect(proof.sampleRenderSourceWorkflow?.remainingProofGates ?? []).toEqual(
      expect.arrayContaining(["Actual 60-second MP4/WebM render artifact", "Actual captions/timeline/audio-stems/evidence JSON files with hashes"])
    );
    expect(proof.publishReadiness?.ready).toBe(false);
    expect(proof.renderPipeline?.publishReadyFromCurrentEvidence).toBe(false);
    expect(proof.renderPipeline?.issueCount ?? 0).toBeGreaterThan(0);
  });
});

async function startCartoonStudioServer() {
  const root = resolve(process.cwd(), "packages/create-aura3d/templates/cartoon-studio");
  const server = await createServer({
    root,
    configFile: false,
    logLevel: "silent",
    server: {
      host: "127.0.0.1",
      strictPort: false
    }
  });
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === "string") {
    throw new Error("Cartoon Studio Vite server did not bind a TCP port.");
  }
  return { server, origin: `http://127.0.0.1:${address.port}/` };
}
