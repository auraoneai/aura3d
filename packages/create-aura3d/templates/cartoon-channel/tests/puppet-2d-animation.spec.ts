import { existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { expect, test } from "@playwright/test";

test("records the 2D puppet cartoon route as a short WebM animation", async ({ page }) => {
  test.setTimeout(120_000);
  const ffmpeg = spawnSync("ffmpeg", ["-version"], { encoding: "utf8" });
  test.skip(ffmpeg.status !== 0, "ffmpeg is required to encode the 2D puppet animation proof");

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?view=puppet-2d&sampleTime=24");
  await page.locator("#puppet-episode-2d").waitFor({ state: "visible" });

  const proof = await page.evaluate(() => window.__AURA3D_CARTOON_2D_PUPPET_PROOF__);
  expect(proof?.mode).toBe("2d-puppet-animation-over-concept-art");
  expect(proof?.animatedParts).toContain("blue robot broom sweep");
  expect(proof?.animatedParts).toContain("blue robot eyes blink");

  const reportDir = resolve(findWorkspaceRoot(process.cwd()), "tests/reports/prompt-animation");
  const frameDir = resolve(reportDir, ".cartoon-2d-puppet-animation-frames");
  const outputPath = resolve(reportDir, "cartoon-2d-puppet-animation.webm");
  rmSync(frameDir, { recursive: true, force: true });
  mkdirSync(frameDir, { recursive: true });
  mkdirSync(dirname(outputPath), { recursive: true });

  const frame = page.locator(".puppet-episode__frame");
  const box = await frame.boundingBox();
  expect(box).not.toBeNull();
  await page.waitForTimeout(300);
  for (let index = 0; index < 120; index += 1) {
    await page.screenshot({
      path: resolve(frameDir, `frame-${String(index).padStart(4, "0")}.png`),
      clip: box ?? undefined,
      animations: "allow"
    });
    await page.waitForTimeout(1000 / 24);
  }

  const encode = spawnSync(
    "ffmpeg",
    [
      "-y",
      "-framerate",
      "24",
      "-i",
      resolve(frameDir, "frame-%04d.png"),
      "-c:v",
      "libvpx-vp9",
      "-pix_fmt",
      "yuv420p",
      "-b:v",
      "0",
      "-crf",
      "32",
      outputPath
    ],
    { encoding: "utf8" }
  );
  expect(encode.status, encode.stderr).toBe(0);
  expect(existsSync(outputPath)).toBe(true);
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
