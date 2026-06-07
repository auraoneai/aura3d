import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { expect, test } from "@playwright/test";

test("2.5D concept route shows layered parallax from the moon garden source frame", async ({ page, request }) => {
  await page.setViewportSize({ width: 1440, height: 900 });

  const sourceResponse = await request.get("/aura-assets/moon-garden-feature-frame.png");
  expect(sourceResponse.ok()).toBe(true);
  expect(sourceResponse.headers()["content-type"]).toContain("image/png");

  const reportDir = resolve(findWorkspaceRoot(process.cwd()), "tests/reports/prompt-animation");
  mkdirSync(reportDir, { recursive: true });

  for (const [label, parallax] of [
    ["left", -0.78],
    ["center", 0],
    ["right", 0.78]
  ] as const) {
    await page.goto(`/?view=concept-2-5d&sampleTime=24&parallax=${parallax}`);

    const frame = page.locator("#concept-episode-2-5d");
    await expect(frame).toBeVisible();
    await expect(page.locator("[data-concept-caption]")).toContainText(/tiny circle|stones|cleanup/i);

    const proof = await page.evaluate(() => window.__AURA3D_CARTOON_2_5D_PROOF__);
    expect(proof?.episodeId).toBe("moon-garden-cleanup-001");
    expect(proof?.mode).toBe("2.5d-parallax-concept");
    expect(proof?.sourceImage).toBe("/aura-assets/moon-garden-feature-frame.png");
    expect(proof?.notTrue3D).toBe(true);
    expect(proof?.screenshotTarget).toBe("#concept-episode-2-5d");
    expect(proof?.layers.map((layer) => layer.id)).toEqual(["far-background", "midground-set", "character-plane", "foreground-garden"]);
    expect(proof?.aura3dRole).toContain("episode contract and shot timing");
    expect(proof?.limitations.join(" ")).toMatch(/not mesh reconstruction/i);
    expect(proof?.parallax).toBeCloseTo(parallax, 2);

    const screenshot = await page.locator(".concept-2-5d__frame").screenshot({ animations: "disabled" });
    expect(screenshot.byteLength).toBeGreaterThan(90_000);
    writeFileSync(resolve(reportDir, `cartoon-2-5d-concept-${label}.png`), screenshot);
  }
});

function findWorkspaceRoot(start: string) {
  let current = start;
  for (let depth = 0; depth < 8; depth += 1) {
    if (existsSync(resolve(current, "pnpm-workspace.yaml"))) return current;
    const parent = resolve(current, "..");
    if (parent === current) break;
    current = parent;
  }
  return start;
}
