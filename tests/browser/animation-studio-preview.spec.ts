import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const reportPath = resolve(process.cwd(), "tests/reports/animation-studio/preview-render.json");

test.describe("animation studio preview render", () => {
  test.setTimeout(90_000);
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });
  test.afterAll(async () => {
    await server.close();
  });

  test("Studio renders a rigged character driven by the locomotion kit (skinned, motion across clips)", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await page.goto(`${server.origin}/tests/browser/animation-studio-preview-harness.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean(window.__AURA3D_ANIMATION_STUDIO_PREVIEW__), undefined, { timeout: 80_000 });
    const proof = await page.evaluate(() => window.__AURA3D_ANIMATION_STUDIO_PREVIEW__!);

    expect(proof.status, proof.error).toBe("ready");
    expect(proof.assetClips).toEqual(expect.arrayContaining(["Idle_Loop", "Walk_Loop", "Sprint_Loop"]));
    expect(proof.frames.length).toBe(2);

    // the kit selected different clips for idle vs run speed
    expect(proof.frames[0]!.clip).toBe("Idle_Loop");
    expect(proof.frames[0]!.state).toBe("idle");
    expect(proof.frames[1]!.clip).toBe("Sprint_Loop");
    expect(proof.frames[1]!.state).toBe("run");

    // the skinned character actually rendered (non-trivial lit pixels) with a real joint palette
    for (const frame of proof.frames) {
      expect(frame.skinnedPixels, `frame ${frame.clip} should render skinned pixels`).toBeGreaterThan(50);
      expect(frame.jointCount).toBeGreaterThan(0);
      expect(frame.trackCount).toBeGreaterThan(0);
    }
    // idle vs run poses differ on screen (motion across clips)
    expect(proof.changedPixels).toBeGreaterThan(50);
    expect(errors).toEqual([]);

    await mkdir(dirname(reportPath), { recursive: true });
    await writeFile(reportPath, `${JSON.stringify({ ok: errors.length === 0, generatedAt: new Date().toISOString(), proof }, null, 2)}\n`);
  });
});
