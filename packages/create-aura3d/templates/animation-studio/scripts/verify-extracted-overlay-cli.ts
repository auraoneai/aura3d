/**
 * verify-extracted-overlay-cli.ts — HONEST visual proof that the reconciled EXTRACTED clips render
 * UPRIGHT (M6 / B3).
 *
 * Unlike `skeleton-overlay-cli.ts` / `motion-evidence-cli.ts` (which visualize the PROCEDURAL
 * standard library), this CLI loads the on-disk `public/clip-library/*.json` EXTRACTED clips via
 * `loadExtractedClipLibrary`, drives the canonical rest skeleton with them through the SAME FK
 * projection `buildSkeletonStrip` uses (which is equivalent to retargeting onto an identity-rest
 * standard rig — `Rt = Rt0·Rs0⁻¹·Ra` collapses to applying the clip rotation directly), and:
 *
 *   1. writes a first/mid/final skeleton-overlay PNG strip per extracted clip, and
 *   2. measures UPRIGHTNESS from the projected world bone positions — head above hips above feet,
 *      head near the top of the figure, feet near the ground — plus per-frame motion.
 *
 * It reports, per clip: worstFloor (gate metric), upright?, head/hip/foot heights, motion present.
 * This is the proof the PRD's M6 acceptance demands: extracted mocap is only usable if it renders
 * UPRIGHT, not merely if it passes the numeric gate.
 *
 * Usage: tsx scripts/verify-extracted-overlay-cli.ts [--out dist/extracted-overlays]
 */
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — resolved at runtime to the freshly-built monorepo dist (has co-located .d.ts).
import type { AnimationClipRegistry } from "@aura3d/animation";
import { buildSkeletonStrip } from "./skeleton-overlay.js";
import { loadExtractedClipLibrary, worstRestFloor } from "./build-clip-library.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLIP_DIR = resolve(__dirname, "..", "public", "clip-library");
const INTENTS = ["idle", "talk", "gesture", "point", "nod", "walk", "run", "react"] as const;

// --- sharp loader (same standalone resolution as the sibling CLIs) -------------------------------
interface SharpModule {
  (input: Buffer | Uint8Array, options?: { raw: { width: number; height: number; channels: number } }): {
    png(): { toBuffer(): Promise<Buffer> };
  };
}
function loadSharp(): SharpModule | null {
  try {
    return createRequire(import.meta.url)("sharp") as SharpModule;
  } catch {
    const roots = [process.cwd(), __dirname];
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
    return null; // PNG is optional evidence; numeric uprightness is the load-bearing proof.
  }
}
async function rawRgbaToPng(pixels: Uint8Array, width: number, height: number): Promise<Uint8Array | null> {
  const sharp = loadSharp();
  if (!sharp) return null;
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

// --- FK uprightness measurement (mirrors skeleton-overlay's REST_SKELETON + FK) -------------------
type Vec3 = readonly [number, number, number];
type Quat = readonly [number, number, number, number];
const REST: Readonly<Record<string, { parent: string | null; offset: Vec3 }>> = {
  hips: { parent: null, offset: [0, 0.95, 0] },
  spine: { parent: "hips", offset: [0, 0.12, 0] },
  chest: { parent: "spine", offset: [0, 0.14, 0] },
  upperChest: { parent: "chest", offset: [0, 0.1, 0] },
  neck: { parent: "upperChest", offset: [0, 0.08, 0] },
  head: { parent: "neck", offset: [0, 0.12, 0] },
  leftShoulder: { parent: "upperChest", offset: [0.06, 0.05, 0] },
  leftUpperArm: { parent: "leftShoulder", offset: [0.14, 0, 0] },
  leftLowerArm: { parent: "leftUpperArm", offset: [0.26, 0, 0] },
  leftHand: { parent: "leftLowerArm", offset: [0.24, 0, 0] },
  rightShoulder: { parent: "upperChest", offset: [-0.06, 0.05, 0] },
  rightUpperArm: { parent: "rightShoulder", offset: [-0.14, 0, 0] },
  rightLowerArm: { parent: "rightUpperArm", offset: [-0.26, 0, 0] },
  rightHand: { parent: "rightLowerArm", offset: [-0.24, 0, 0] },
  leftUpperLeg: { parent: "hips", offset: [0.09, -0.04, 0] },
  leftLowerLeg: { parent: "leftUpperLeg", offset: [0, -0.42, 0] },
  leftFoot: { parent: "leftLowerLeg", offset: [0, -0.42, 0.04] },
  rightUpperLeg: { parent: "hips", offset: [-0.09, -0.04, 0] },
  rightLowerLeg: { parent: "rightUpperLeg", offset: [0, -0.42, 0] },
  rightFoot: { parent: "rightLowerLeg", offset: [0, -0.42, 0.04] }
};
const I: Quat = [0, 0, 0, 1];
function qMulV(q: Quat, v: Vec3): Vec3 {
  const [x, y, z, w] = q;
  const tx = 2 * (y * v[2] - z * v[1]);
  const ty = 2 * (z * v[0] - x * v[2]);
  const tz = 2 * (x * v[1] - y * v[0]);
  return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)];
}
function qMul(a: Quat, b: Quat): Quat {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]
  ];
}
interface SampledClip {
  duration: number;
  loop: boolean;
  tracks: readonly { target: string; sample(t: number): readonly number[] }[];
}
function solveWorld(clip: SampledClip, t: number): Record<string, Vec3> {
  const dur = clip.duration > 0 ? clip.duration : 1;
  const local = clip.loop ? t % dur : Math.min(t, dur);
  const rot: Record<string, Quat> = {};
  let hips: Vec3 = [0, 0, 0];
  for (const tr of clip.tracks) {
    const d = tr.target.lastIndexOf(".");
    if (d < 0) continue;
    const bone = tr.target.slice(0, d);
    const path = tr.target.slice(d + 1);
    const v = tr.sample(local);
    if (path === "rotation" && v.length >= 4) rot[bone] = [v[0]!, v[1]!, v[2]!, v[3]!];
    else if (path === "translation" && bone === "hips" && v.length >= 3) hips = [v[0]!, v[1]!, v[2]!];
  }
  const wp: Record<string, Vec3> = {};
  const wr: Record<string, Quat> = {};
  for (const [bone, r] of Object.entries(REST)) {
    const lr = rot[bone] ?? I;
    if (r.parent === null) {
      wr[bone] = lr;
      wp[bone] = [r.offset[0] + hips[0], r.offset[1] + hips[1], r.offset[2] + hips[2]];
    } else {
      const pr = wr[r.parent] ?? I;
      const pp = wp[r.parent] ?? [0, 0, 0];
      const ro = qMulV(pr, r.offset);
      wp[bone] = [pp[0] + ro[0], pp[1] + ro[1], pp[2] + ro[2]];
      wr[bone] = qMul(pr, lr);
    }
  }
  return wp;
}

interface UprightReport {
  upright: boolean;
  minHeadY: number;
  maxFootY: number;
  headAboveHipsPct: number;
  hipsAboveFeetPct: number;
  headTravel: number;
}
function measureUpright(clip: SampledClip): UprightReport {
  const dur = clip.duration > 0 ? clip.duration : 1;
  const N = 24;
  let minHeadY = Infinity;
  let maxFootY = -Infinity;
  let headAbove = 0;
  let hipsAbove = 0;
  let samples = 0;
  let headTravel = 0;
  const head0 = solveWorld(clip, 0).head!;
  for (let i = 0; i <= N; i += 1) {
    const w = solveWorld(clip, (dur * i) / N);
    const head = w.head!;
    const hips = w.hips!;
    const footY = Math.min(w.leftFoot?.[1] ?? 99, w.rightFoot?.[1] ?? 99);
    minHeadY = Math.min(minHeadY, head[1]);
    maxFootY = Math.max(maxFootY, footY);
    headTravel = Math.max(headTravel, Math.hypot(head[0] - head0[0], head[1] - head0[1], head[2] - head0[2]));
    if (head[1] > hips[1]) headAbove += 1;
    if (hips[1] > footY) hipsAbove += 1;
    samples += 1;
  }
  const headAboveHipsPct = headAbove / samples;
  const hipsAboveFeetPct = hipsAbove / samples;
  return {
    upright: headAboveHipsPct > 0.9 && hipsAboveFeetPct > 0.9 && minHeadY > 1.0,
    minHeadY,
    maxFootY,
    headAboveHipsPct,
    hipsAboveFeetPct,
    headTravel
  };
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

async function main(): Promise<void> {
  const outRoot = resolve(arg("out", "dist/extracted-overlays"));
  mkdirSync(outRoot, { recursive: true });
  const registry = loadExtractedClipLibrary(CLIP_DIR) as unknown as AnimationClipRegistry;

  const rows: Record<string, unknown> = {};
  let allUpright = true;
  let allAccepted = true;
  for (const intent of INTENTS) {
    const clip = (registry.get?.(intent) ?? registry.require?.(intent)) as SampledClip | undefined;
    const extracted = Boolean((clip as { metadata?: { extracted?: boolean } } | undefined)?.metadata?.extracted);
    if (!clip) continue;
    const upright = measureUpright(clip);
    const floor = worstRestFloor(
      clip.tracks.map((tr) => ({
        target: tr.target,
        keyframes: (tr as unknown as { keyframes: { value: number[] }[] }).keyframes
      }))
    );
    const accepted = floor.value < 0.15;
    allUpright &&= upright.upright;
    if (extracted) allAccepted &&= accepted;

    const strip = buildSkeletonStrip({ intent, registry });
    const png = await rawRgbaToPng(strip.rgba, strip.width, strip.height);
    let pngPath: string | null = null;
    if (png) {
      pngPath = join(outRoot, `${intent}.png`);
      writeFileSync(pngPath, png);
    }
    rows[intent] = {
      extracted,
      worstFloor: round(floor.value),
      worstFloorBone: floor.bone,
      gate: accepted ? "ACCEPT" : "REJECT",
      upright: upright.upright,
      minHeadY: round(upright.minHeadY),
      maxFootY: round(upright.maxFootY),
      headAboveHipsPct: round(upright.headAboveHipsPct),
      hipsAboveFeetPct: round(upright.hipsAboveFeetPct),
      headTravel: round(upright.headTravel),
      firstFinalDiff: strip.firstFinalMaxDiff,
      png: pngPath
    };
    // eslint-disable-next-line no-console
    console.error(
      `  [${intent.padEnd(8)}] ${extracted ? "EXTRACTED" : "procedural"}  worstFloor=${round(floor.value)
        .toString()
        .padEnd(5)} ${accepted ? "ACCEPT" : "REJECT"}  ${upright.upright ? "UPRIGHT" : "CONTORTED"}  ` +
        `head>=${round(upright.minHeadY)}m foot<=${round(upright.maxFootY)}m travel=${round(upright.headTravel)}m`
    );
  }

  writeFileSync(
    join(outRoot, "summary.json"),
    JSON.stringify({ generated: "M6 reconciled-extracted-clip uprightness proof", allUpright, allAccepted, clips: rows }, null, 2)
  );
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ ok: true, outRoot, allUpright, allAccepted, clips: rows }));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(JSON.stringify({ ok: false, error: (err as Error).message, stack: (err as Error).stack }));
  process.exitCode = 1;
});
