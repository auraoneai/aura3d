/**
 * §6.5 generated-asset pre-stage — bake side.
 *
 * `runBlenderBake` shells to `blender/bake_highpoly.py` (Blender LTS headless,
 * Cycles): bakes base colour, MikkTSpace tangent-space normal (OpenGL +Y), and
 * ORM (AO→R, roughness→G, metallic→B) from the high-poly source onto the
 * remeshed low-poly, assigns the maps, and exports the final GLB. Cage
 * extrusion is bounds × 0.01 per §6.5 item 3.
 *
 * The step runs only on the remote worker (`remote === true` with a Blender
 * binary): it is invoked from `generatedPreStage` (remesh.ts) at byte level
 * because it pairs TWO documents — the generated high-poly and the remeshed
 * low-poly — which an in-pipeline document step cannot express. `stepBake`
 * here is the record-keeping mirror for the normal pipeline path: when the
 * pre-stage did not run it records `bake:not-requested` so `derived.steps`
 * still shows the decision.
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { recordStep } from "./common.js";

const BLENDER_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "blender");

/** Run bake_highpoly.py: `high` = generated source, `low` = remeshed target; writes `out`. */
export function runBlenderBake(blender: string, highPath: string, lowPath: string, outPath: string): void {
  execFileSync(
    blender,
    ["--background", "--python", join(BLENDER_DIR, "bake_highpoly.py"), "--", highPath, lowPath, outPath],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  if (!existsSync(outPath)) {
    throw new Error("bake_highpoly.py produced no output — remote worker failure");
  }
}

/**
 * In-pipeline bake record. Real baking is byte-level in generatedPreStage;
 * this step documents the decision in `derived.steps` for non-generated runs.
 */
export const stepBake = recordStep("bake", async (_doc, ctx) => {
  ctx.flags.push("bake:not-requested");
});
