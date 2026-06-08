/**
 * skeleton-overlay-cli.ts — standalone runner for the B2 skeleton-overlay strip.
 *
 * Produces a 3-frame (first/mid/final) bone-projection PNG strip for a given intent and writes it to
 * `--out`. This is the same `buildSkeletonStrip` render-live.ts calls; isolating it in a tiny CLI
 * lets a unit test produce + validate the REAL artifact without spinning up Playwright/the GPU.
 *
 * Usage: tsx scripts/skeleton-overlay-cli.ts --intent walk --out <path.png>
 */
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { buildSkeletonStrip } from "./skeleton-overlay.js";

// sharp directly (the render-core helper pulls in @aura3d/engine, which only resolves under the vite
// alias used by the full render — this CLI stays standalone/Playwright-free).
interface SharpModule {
  (input: Buffer | Uint8Array, options?: { raw: { width: number; height: number; channels: number } }): {
    png(): { toBuffer(): Promise<Buffer> };
  };
}
function loadSharp(): SharpModule {
  try {
    return createRequire(import.meta.url)("sharp") as SharpModule;
  } catch {
    // pnpm hoists sharp to the workspace root .pnpm store; search up from both cwd and this file.
    const roots = [process.cwd(), dirname(fileURLToPath(import.meta.url))];
    for (const start of roots) {
      let dir = start;
      for (let up = 0; up < 8; up += 1) {
        const storePkg = resolve(dir, "node_modules/.pnpm/sharp@0.33.5/node_modules/sharp/package.json");
        if (existsSync(storePkg)) return createRequire(storePkg)("sharp") as SharpModule;
        const parent = dirname(dir);
        if (parent === dir) break;
        dir = parent;
      }
    }
    throw new Error("Could not load `sharp`. Install it: pnpm add -D sharp");
  }
}
async function rawRgbaToPng(pixels: Uint8Array, width: number, height: number): Promise<Uint8Array> {
  const sharp = loadSharp();
  const buffer = await sharp(Buffer.from(pixels.buffer, pixels.byteOffset, pixels.byteLength), {
    raw: { width, height, channels: 4 }
  })
    .png()
    .toBuffer();
  return new Uint8Array(buffer);
}

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}

async function main(): Promise<void> {
  const intent = arg("intent", "walk");
  const out = arg("out", `dist/skeleton-overlays/${intent}.png`);
  const strip = buildSkeletonStrip({ intent });
  const png = await rawRgbaToPng(strip.rgba, strip.width, strip.height);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, png);
  // Emit a machine-readable line the test can parse.
  console.log(
    JSON.stringify({
      ok: true,
      out,
      intent: strip.intent,
      width: strip.width,
      height: strip.height,
      panelJointCounts: strip.panelJointCounts,
      firstFinalMaxDiff: strip.firstFinalMaxDiff,
      pngBytes: png.byteLength
    })
  );
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: (err as Error).message }));
  process.exitCode = 1;
});
