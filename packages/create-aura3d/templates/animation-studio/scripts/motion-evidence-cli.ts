/**
 * motion-evidence-cli.ts — write the Phase B4/B5 motion-evidence artifacts to disk.
 *
 * Produces:
 *   B4  tests/reports/standard-clips/<intent>.png   (8 strips, one per standard intent)
 *       tests/reports/standard-clips/summary.json    (per-intent bones/maxRot/firstFinalDiff)
 *   B5  tests/reports/rig-overlays/<rigName>.png      (5 retargeting-overlay strips)
 *       tests/reports/rig-overlays/summary.json       (per-rig grade + coverage + refusal flag)
 *
 * Standalone (no Playwright/GPU): reuses `buildSkeletonStrip`'s FK projection and `sharp` for PNG
 * encoding only. Deterministic. Emits a final machine-readable JSON line the test parses.
 *
 * Usage:
 *   tsx scripts/motion-evidence-cli.ts --out tests/reports [--clip gesture]
 */
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import {
  buildAllIntentEvidence,
  buildAllRigEvidence,
  type IntentEvidence,
  type RigEvidence
} from "./motion-evidence.js";

interface SharpModule {
  (input: Buffer | Uint8Array, options?: { raw: { width: number; height: number; channels: number } }): {
    png(): { toBuffer(): Promise<Buffer> };
  };
}
function loadSharp(): SharpModule {
  try {
    return createRequire(import.meta.url)("sharp") as SharpModule;
  } catch {
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

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

async function main(): Promise<void> {
  const outRoot = resolve(arg("out", "tests/reports"));
  const clipIntent = arg("clip", "gesture");

  // --- B4: per-intent strips + summary ----------------------------------------------------------
  const intentDir = join(outRoot, "standard-clips");
  mkdirSync(intentDir, { recursive: true });
  const intents: IntentEvidence[] = buildAllIntentEvidence();
  const intentSummary: Record<string, unknown> = {};
  for (const ev of intents) {
    const png = await rawRgbaToPng(ev.strip.rgba, ev.strip.width, ev.strip.height);
    const file = join(intentDir, `${ev.intent}.png`);
    writeFileSync(file, png);
    intentSummary[ev.intent] = {
      png: file,
      bonesTouched: ev.bonesTouched,
      bonesTouchedCount: ev.bonesTouched.length,
      maxRotAmplitudeRad: round(ev.maxRotAmplitudeRad),
      firstFinalDiff: ev.firstFinalDiff,
      panelJointCounts: ev.panelJointCounts,
      pngBytes: png.byteLength
    };
  }
  writeFileSync(
    join(intentDir, "summary.json"),
    JSON.stringify({ generated: "B4 standard-clip visual regression", intents: intentSummary }, null, 2)
  );

  // --- B5: per-rig retargeting overlays + summary -----------------------------------------------
  const rigDir = join(outRoot, "rig-overlays");
  mkdirSync(rigDir, { recursive: true });
  const rigs: RigEvidence[] = buildAllRigEvidence(clipIntent);
  const rigSummary: Record<string, unknown> = {};
  for (const ev of rigs) {
    const png = await rawRgbaToPng(ev.strip.rgba, ev.strip.width, ev.strip.height);
    const file = join(rigDir, `${ev.name}.png`);
    writeFileSync(file, png);
    rigSummary[ev.name] = {
      png: file,
      convention: ev.convention,
      grade: ev.grade,
      mappedBoneCount: ev.mappedBoneCount,
      retargetCoverage: round(ev.retargetCoverage),
      retargetedBoneCount: ev.retargetedBones.length,
      refusesBodyActing: ev.refusesBodyActing,
      clip: ev.clip,
      firstFinalDiff: ev.firstFinalDiff,
      gradeReasons: ev.gradeReasons,
      pngBytes: png.byteLength
    };
  }
  writeFileSync(
    join(rigDir, "summary.json"),
    JSON.stringify({ generated: "B5 5-rig retargeting overlays", clip: clipIntent, rigs: rigSummary }, null, 2)
  );

  console.log(
    JSON.stringify({
      ok: true,
      outRoot,
      clip: clipIntent,
      intents: intents.map((ev) => ({
        intent: ev.intent,
        bonesTouched: ev.bonesTouched.length,
        maxRotAmplitudeRad: round(ev.maxRotAmplitudeRad),
        firstFinalDiff: ev.firstFinalDiff
      })),
      rigs: rigs.map((ev) => ({
        name: ev.name,
        grade: ev.grade,
        mappedBoneCount: ev.mappedBoneCount,
        refusesBodyActing: ev.refusesBodyActing,
        firstFinalDiff: ev.firstFinalDiff
      }))
    })
  );
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: (err as Error).message, stack: (err as Error).stack }));
  process.exitCode = 1;
});
