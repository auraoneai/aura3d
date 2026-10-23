/**
 * `aura3d assets optimize --file in.glb --out out.glb [--role hero|vehicle|character|prop|background]`
 *
 * Direct-file mode of the `assets optimize` verb (the id-based admission pipeline stays in prd05). Dedup, weld,
 * budgeted simplify, prune, texture downscale (colour/ORM -> jpeg, normal -> png) and a stable vertex order. Geometry
 * stays float32 by default: meshopt quantisation moves scale into a node transform, which skews the grounding and
 * bounds checks `assets import-meshy` runs, so `meshopt: true` is for static background props you will not measure.
 */

import { mkdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createGltfIo, loadGltfToolkit, type GltfToolkit, type Loose } from "./gltfToolkit.js";

export type OptimizeRole = "hero" | "vehicle" | "character" | "prop" | "background";

/** Vertex and texture budgets by role (Meshy meshes weld to roughly half as many vertices as triangles). */
export const OPTIMIZE_BUDGETS: Readonly<Record<OptimizeRole, { readonly maxVerts: number; readonly tex: number }>> = {
  hero: { maxVerts: 40000, tex: 2048 },
  vehicle: { maxVerts: 40000, tex: 2048 },
  character: { maxVerts: 30000, tex: 2048 },
  prop: { maxVerts: 6000, tex: 1024 },
  background: { maxVerts: 15000, tex: 1024 }
};

export const MAX_OPTIMIZE_TEXTURE = 4096;

export interface OptimizeGlbOptions {
  readonly input: string;
  readonly output: string;
  readonly projectDir?: string;
  readonly role?: OptimizeRole;
  readonly maxVerts?: number;
  readonly tex?: number;
  /** false skips simplification even when over budget. */
  readonly simplify?: boolean;
  readonly meshopt?: boolean;
  /** Simplifier error tolerance, 0..1 (default 0.05). */
  readonly error?: number;
  readonly toolkit?: GltfToolkit;
}

export interface OptimizePlan {
  readonly role: OptimizeRole;
  readonly maxVerts: number;
  readonly tex: number;
  readonly simplify: boolean;
  readonly meshopt: boolean;
  readonly error: number;
}

export interface OptimizeGlbResult extends OptimizePlan {
  readonly input: string;
  readonly output: string;
  readonly bytesIn: number;
  readonly bytesOut: number;
  readonly vertsBefore: number;
  readonly vertsAfter: number;
  readonly skinned: boolean;
  readonly simplified: boolean;
}

export function isOptimizeRole(value: string): value is OptimizeRole {
  return value in OPTIMIZE_BUDGETS;
}

/** Pure planning step: resolve role budgets and validate overrides (no files, no toolkit). */
export function planOptimize(options: Pick<OptimizeGlbOptions, "role" | "maxVerts" | "tex" | "simplify" | "meshopt" | "error">): OptimizePlan {
  const role = options.role ?? "prop";
  if (!isOptimizeRole(role)) throw new Error(`Unknown optimize role "${String(role)}". Use ${Object.keys(OPTIMIZE_BUDGETS).join(", ")}.`);
  const budget = OPTIMIZE_BUDGETS[role];
  const maxVerts = options.maxVerts ?? budget.maxVerts;
  const tex = options.tex ?? budget.tex;
  const error = options.error ?? 0.05;
  if (!Number.isInteger(maxVerts) || maxVerts < 100) throw new Error(`--max-verts must be an integer >= 100 (got ${maxVerts}).`);
  if (!Number.isInteger(tex) || tex < 16 || tex > MAX_OPTIMIZE_TEXTURE) throw new Error(`--tex must be an integer from 16 to ${MAX_OPTIMIZE_TEXTURE} (got ${tex}).`);
  if (!(error > 0 && error <= 1)) throw new Error(`--error must be in (0, 1] (got ${error}).`);
  return { role, maxVerts, tex, simplify: options.simplify !== false, meshopt: options.meshopt === true, error };
}

function countVerts(doc: Loose): number {
  return doc
    .getRoot()
    .listMeshes()
    .reduce((sum: number, mesh: Loose) => sum + mesh.listPrimitives().reduce((acc: number, prim: Loose) => acc + (prim.getAttribute("POSITION")?.getCount() ?? 0), 0), 0);
}

export async function optimizeGlbFile(options: OptimizeGlbOptions): Promise<OptimizeGlbResult> {
  const plan = planOptimize(options);
  const projectDir = resolve(options.projectDir ?? process.cwd());
  const input = resolve(projectDir, options.input);
  const output = resolve(projectDir, options.output);
  if (input === output) throw new Error("--out must differ from --file: optimize never overwrites its input.");
  const toolkit = options.toolkit ?? loadGltfToolkit(projectDir);
  const { dedup, weld, simplify, prune, textureCompress, meshopt, resample, reorder } = toolkit.functions;
  const io = await createGltfIo(toolkit);
  const doc = await io.read(input);
  const vertsBefore = countVerts(doc);
  const skinned = doc.getRoot().listSkins().length > 0;
  await doc.transform(dedup(), weld());
  let simplified = false;
  if (plan.simplify && vertsBefore > plan.maxVerts) {
    await doc.transform(simplify({ simplifier: toolkit.MeshoptSimplifier, ratio: Math.max(0.02, plan.maxVerts / vertsBefore), error: plan.error, lockBorder: skinned }));
    simplified = true;
  }
  await doc.transform(
    resample(),
    prune(),
    textureCompress({ encoder: toolkit.sharp, resize: [plan.tex, plan.tex], targetFormat: "jpeg", slots: /^(?!normal)/, quality: 86 }),
    textureCompress({ encoder: toolkit.sharp, resize: [plan.tex, plan.tex], slots: /^normal/ }),
    reorder({ encoder: toolkit.MeshoptEncoder })
  );
  if (plan.meshopt) await doc.transform(meshopt({ encoder: toolkit.MeshoptEncoder, level: "medium" }));
  mkdirSync(dirname(output), { recursive: true });
  await io.write(output, doc);
  return { ...plan, input, output, bytesIn: statSync(input).size, bytesOut: statSync(output).size, vertsBefore, vertsAfter: countVerts(doc), skinned, simplified };
}

export function optimizeUsage(): string {
  return "aura3d assets optimize --file in.glb --out out.glb [--role hero|vehicle|character|prop|background] [--max-verts N] [--tex N] [--no-simplify] [--meshopt] [--error 0.05] [--json]";
}
