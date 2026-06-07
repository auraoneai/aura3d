import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { createServer, type ViteDevServer } from "vite";

const screenshotDir = resolve(process.cwd(), "tests/reports/aura3d11/cartoon-studio-visual-regression");

test.describe("Aura3D Cartoon Studio visual regression frames", () => {
  test.setTimeout(90_000);
  let server: ViteDevServer;
  let origin: string;

  test.beforeAll(async () => {
    await mkdir(screenshotDir, { recursive: true });
    ({ server, origin } = await startCartoonStudioServer());
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("captures first, dialogue, action, and final browser frames without route chrome", async ({ page }) => {
    const errors = captureErrors(page);
    await page.goto(`${origin}?capture=thumbnail`, { waitUntil: "networkidle" });
    await page.waitForSelector("canvas", { timeout: 10_000 });

    const frames = [
      { id: "first", time: 1 },
      { id: "dialogue", time: 10 },
      { id: "action", time: 32 },
      { id: "final", time: 55 }
    ] as const;
    const captures = [];

    for (const frame of frames) {
      await page.evaluate((time) => {
        const global = globalThis as unknown as {
          __AURA3D_CARTOON_EPISODE_SEEK__?: (time: number) => void;
        };
        global.__AURA3D_CARTOON_EPISODE_SEEK__?.(time);
      }, frame.time);
      await page.waitForTimeout(120);
      const path = resolve(screenshotDir, `${frame.id}.png`);
      const bytes = await page.locator("canvas").first().screenshot({ path });
      captures.push({ ...frame, path, byteLength: bytes.byteLength });
    }

    const proof = await page.evaluate(() => {
      const global = globalThis as unknown as {
        __AURA3D_CARTOON_EPISODE_PROOF__?: {
          readonly proofKind?: string;
          readonly sourceOnlyAcceptedAsPublishProof?: boolean;
          sampleAt(time: number): { readonly shotId?: string; readonly captionId?: string; readonly nodeUpdates?: readonly unknown[] };
        };
      };
      const proof = global.__AURA3D_CARTOON_EPISODE_PROOF__;
      return {
        proofKind: proof?.proofKind,
        sourceOnlyAcceptedAsPublishProof: proof?.sourceOnlyAcceptedAsPublishProof,
        samples: [1, 10, 32, 55].map((time) => proof?.sampleAt(time)),
        captionOverlayVisible: Boolean(document.querySelector("#caption-overlay") && getComputedStyle(document.querySelector("#caption-overlay") as Element).display !== "none"),
        studioPanelVisible: Boolean(document.querySelector("#cartoon-studio-panel"))
      };
    });

    expect(errors).toEqual([]);
    expect(proof.proofKind).toBe("aura3d-cartoon-episode-proof");
    expect(proof.sourceOnlyAcceptedAsPublishProof).toBe(false);
    expect(proof.captionOverlayVisible).toBe(false);
    expect(proof.studioPanelVisible).toBe(false);
    expect(new Set(proof.samples.map((sample) => sample?.shotId)).size).toBeGreaterThanOrEqual(3);
    expect(proof.samples.some((sample) => sample?.captionId)).toBe(true);
    expect(proof.samples.every((sample) => (sample?.nodeUpdates?.length ?? 0) > 0)).toBe(true);
    expect(captures.every((capture) => capture.byteLength > 2_048)).toBe(true);
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

function captureErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    const text = message.text();
    if (message.type() === "error" && !text.includes("favicon") && !text.includes("404 (Not Found)")) {
      errors.push(text);
    }
  });
  return errors;
}
