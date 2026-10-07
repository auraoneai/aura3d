/**
 * §6.5 generated-asset pre-stage — remesh side.
 *
 * Two halves:
 *
 *  - `generatedPreStage` (byte-level, runs BEFORE the normal §6.3 step list in
 *    `optimizeGLB` when `--from-generated` is set): measures the sliver ratio
 *    and rejects collapse-decimated input (fraction of triangles with min
 *    angle < 10° > 15 % — the banned DECIMATE.md pattern, §6.5 item 1), then
 *    invokes Blender LTS headless `blender/remesh_quadriflow.py` and
 *    `blender/bake_highpoly.py` when running on a remote worker
 *    (`options.remote === true` and `blender` on PATH / `A3D_BLENDER_BINARY`).
 *    Locally the Blender calls are skipped with explicit flags — the
 *    pre-stage never silently claims geometry or bake work it did not do.
 *  - `stepSliverCheck` + `stepSingleSided` (in-pipeline, run everywhere):
 *    re-measure the sliver ratio for the record and apply §6.5 item 4
 *    (clear `doubleSided` unless a mesh has open shells).
 *
 * The Meshy remesh API path is documented as contract fact F-05-03 instead of
 * a code path: the remesh operation lives on the remote worker, covered by
 * the meshy-cli skill.
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Document, NodeIO } from "@gltf-transform/core";
import { recordStep } from "./common.js";
import { runBlenderBake } from "./bake.js";
import type { OptimizeStepContext, OptimizeStepRecord } from "../types.js";

/** §6.5 sliver threshold: fraction of triangles with min angle < 10°. */
export const SLIVER_MIN_ANGLE_DEG = 10;
export const SLIVER_RATIO_MAX = 0.15;

interface Vec3 { x: number; y: number; z: number }

function triangleMinAngleDeg(a: Vec3, b: Vec3, c: Vec3): number {
  const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z;
  const vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
  const wx = c.x - b.x, wy = c.y - b.y, wz = c.z - b.z;
  const lu = Math.hypot(ux, uy, uz);
  const lv = Math.hypot(vx, vy, vz);
  const lw = Math.hypot(wx, wy, wz);
  if (lu === 0 || lv === 0 || lw === 0) return 0; // degenerate = worst sliver
  const cosA = (ux * vx + uy * vy + uz * vz) / (lu * lv);
  const cosB = (-ux * wx - uy * wy - uz * wz) / (lu * lw);
  const cosC = (-vx * wx - vy * wy - vz * wz) / (lv * lw);
  // cos is monotone decreasing on [0, π]: the LARGEST cos belongs to the SMALLEST angle.
  const cosMin = Math.max(cosA, cosB, cosC);
  return (Math.acos(Math.min(1, Math.max(-1, cosMin))) * 180) / Math.PI;
}

/** Fraction of triangles whose minimum interior angle is below `limitDeg`. */
export function sliverRatio(doc: Document, limitDeg = SLIVER_MIN_ANGLE_DEG): number {
  let slivers = 0;
  let total = 0;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute("POSITION");
      const indices = prim.getIndices();
      if (!pos) continue;
      const p = pos.getArray() as ArrayLike<number> | undefined;
      if (!p) continue;
      const idx = indices?.getArray() as ArrayLike<number> | undefined;
      const triCount = idx ? idx.length / 3 : p.length / (3 * 3);
      for (let t = 0; t < triCount; t++) {
        const vi = (corner: number) => (idx ? idx[t * 3 + corner]! : t * 3 + corner);
        const a = { x: p[vi(0) * 3]!, y: p[vi(0) * 3 + 1]!, z: p[vi(0) * 3 + 2]! };
        const b = { x: p[vi(1) * 3]!, y: p[vi(1) * 3 + 1]!, z: p[vi(1) * 3 + 2]! };
        const c = { x: p[vi(2) * 3]!, y: p[vi(2) * 3 + 1]!, z: p[vi(2) * 3 + 2]! };
        total += 1;
        if (triangleMinAngleDeg(a, b, c) < limitDeg) slivers += 1;
      }
    }
  }
  return total === 0 ? 0 : slivers / total;
}

/** True when any mesh has boundary edges (open shells) → doubleSided must stay. */
function hasOpenShells(doc: Document): boolean {
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const indices = prim.getIndices()?.getArray() as ArrayLike<number> | undefined;
      const pos = prim.getAttribute("POSITION")?.getArray() as ArrayLike<number> | undefined;
      if (!pos) continue;
      const vertCount = pos.length / 3;
      const edgeUse = new Map<string, number>();
      const triCount = indices ? indices.length / 3 : vertCount / 3;
      const vi = (t: number, c: number) => (indices ? indices[t * 3 + c]! : t * 3 + c);
      for (let t = 0; t < triCount; t++) {
        for (let e = 0; e < 3; e++) {
          const a = vi(t, e);
          const b = vi(t, (e + 1) % 3);
          const key = a < b ? `${a}:${b}` : `${b}:${a}`;
          edgeUse.set(key, (edgeUse.get(key) ?? 0) + 1);
        }
      }
      for (const uses of edgeUse.values()) if (uses === 1) return true;
    }
  }
  return false;
}

/** §6.5 item 4 — clear `doubleSided` unless a mesh has boundary edges. */
export function applySingleSided(doc: Document): { cleared: number; keptOpenShells: boolean } {
  if (hasOpenShells(doc)) return { cleared: 0, keptOpenShells: true };
  let cleared = 0;
  for (const mat of doc.getRoot().listMaterials()) {
    if (mat.getDoubleSided()) {
      mat.setDoubleSided(false);
      cleared += 1;
    }
  }
  return { cleared, keptOpenShells: false };
}

/** G9 pre-check record: re-measure the sliver ratio on the (possibly remeshed) doc. */
export const stepSliverCheck = recordStep("sliver-check", async (doc, ctx) => {
  const ratio = sliverRatio(doc);
  ctx.flags.push(`sliver-ratio:${(ratio * 100).toFixed(2)}%`);
  if (ratio > SLIVER_RATIO_MAX) {
    ctx.flags.push("sliver-ratio-fail");
    ctx.log(
      `sliver-check: ${(ratio * 100).toFixed(1)}% of triangles < ${SLIVER_MIN_ANGLE_DEG}° ` +
      `> ${SLIVER_RATIO_MAX * 100}% — collapse-decimated input fails the G9 pre-check (§6.5)`,
    );
  }
});

/** §6.5 item 4 — record the single-sided decision as a step. */
export const stepSingleSided = recordStep("single-sided", async (doc, ctx) => {
  const { cleared, keptOpenShells } = applySingleSided(doc);
  if (keptOpenShells) ctx.flags.push("single-sided:kept-doubleSided-open-shells");
  else if (cleared > 0) ctx.flags.push(`single-sided:cleared-${cleared}-materials`);
});

function blenderBinary(explicit?: string): string | undefined {
  if (explicit && existsSync(explicit)) return explicit;
  const env = process.env.A3D_BLENDER_BINARY;
  if (env && existsSync(env)) return env;
  try {
    execFileSync("blender", ["--version"], { stdio: "pipe" });
    return "blender";
  } catch {
    return undefined;
  }
}

const BLENDER_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "blender");

export interface GeneratedPreStageOptions {
  readonly remote?: boolean;
  readonly blenderBinary?: string;
  readonly profileTargetTriangles: number;
  readonly log?: (line: string) => void;
}

export interface GeneratedPreStageResult {
  /** Bytes to feed the normal §6.3 pipeline (unchanged when remote steps were skipped). */
  readonly bytes: Uint8Array;
  /** Step records prepended to `derived.steps`. */
  readonly steps: readonly OptimizeStepRecord[];
  readonly flags: readonly string[];
}

/**
 * Byte-level pre-stage for `--from-generated` (§6.5). Sliver check always
 * runs; remesh + bake run only when `remote === true` and Blender resolves.
 */
export async function generatedPreStage(
  source: Uint8Array,
  io: NodeIO,
  workDir: string,
  options: GeneratedPreStageOptions,
): Promise<GeneratedPreStageResult> {
  const log = options.log ?? (() => {});
  const steps: OptimizeStepRecord[] = [];
  const flags: string[] = [];

  const started = Date.now();
  const inDoc = await io.readBinary(source);
  const ratio = sliverRatio(inDoc);
  flags.push(`sliver-ratio:${(ratio * 100).toFixed(2)}%`);
  steps.push({ step: "sliver-check", ms: Date.now() - started, bytesBefore: source.byteLength, bytesAfter: source.byteLength });
  if (ratio > SLIVER_RATIO_MAX) {
    throw new Error(
      `--from-generated sliver pre-check failed: ${(ratio * 100).toFixed(1)}% of triangles have min angle < ${SLIVER_MIN_ANGLE_DEG}° ` +
      `(> ${SLIVER_RATIO_MAX * 100}%). Collapse-decimated input (DECIMATE.md pattern) is banned by §6.5 — re-export from the generator.`,
    );
  }

  const blender = blenderBinary(options.blenderBinary);
  let bytes = source;

  if (!options.remote || !blender) {
    flags.push("remesh-skipped:remote-only", "bake-skipped:remote-only");
    log(`pre-stage: ${options.remote ? "no blender binary" : "not remote"} — remesh/bake skipped (§6.5 runs them on the remote worker)`);
  } else {
    const inPath = join(workDir, "generated-input.glb");
    const remeshOut = join(workDir, "generated-remeshed.glb");
    const bakedOut = join(workDir, "generated-baked.glb");
    const sourceDoc = inDoc;

    let t0 = Date.now();
    const bytesBeforeRemesh = bytes.byteLength;
    await io.write(inPath, sourceDoc);
    execFileSync(
      blender,
      ["--background", "--python", join(BLENDER_DIR, "remesh_quadriflow.py"), "--", inPath, remeshOut, "--target-faces", String(options.profileTargetTriangles)],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    if (!existsSync(remeshOut)) throw new Error("remesh_quadriflow.py produced no output — remote worker failure");
    const remeshDoc = await io.read(remeshOut);
    steps.push({ step: "remesh", ms: Date.now() - t0, bytesBefore: bytesBeforeRemesh, bytesAfter: remeshOut ? (await io.writeBinary(remeshDoc)).byteLength : bytesBeforeRemesh });
    flags.push("remesh:quadriflow");

    t0 = Date.now();
    const remeshBytes = await io.writeBinary(remeshDoc);
    await io.write(remeshOut, remeshDoc);
    runBlenderBake(blender, inPath, remeshOut, bakedOut);
    const bakedDoc = await io.read(bakedOut);
    bytes = await io.writeBinary(bakedDoc);
    steps.push({ step: "bake", ms: Date.now() - t0, bytesBefore: remeshBytes.byteLength, bytesAfter: bytes.byteLength });
    flags.push("bake:cycles-orm");
  }

  return { bytes, steps, flags };
}
