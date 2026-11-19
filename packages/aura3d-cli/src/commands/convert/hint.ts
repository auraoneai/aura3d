/**
 * `assets add` hint: a non-glTF model can be turned into a GLB with `aura3d assets convert` first. Dependency-free so
 * src/index.ts can import it without a cycle.
 */

import { basename, extname } from "node:path";

/** Source extensions `assets convert` accepts (A5). */
export const CONVERT_INPUT_EXTENSIONS: readonly string[] = ["fbx", "obj", "dae", "usd", "usda", "usdz", "ply", "stl", "3mf", "vox", "bvh"];

/** The one-line suggestion for a non-glTF model path, or undefined for glTF/GLB and non-model files. */
export function convertHintForModel(file: string): string | undefined {
  const format = extname(file).slice(1).toLowerCase();
  if (!CONVERT_INPUT_EXTENSIONS.includes(format)) return undefined;
  const stem = basename(file, extname(file)) || "model";
  return `Hint: .${format} is not glTF. \`aura3d assets convert ${file} --out ${stem}.glb\` writes a GLB through Aura3D's bounded ${format.toUpperCase()} importer (partial parity; read its diagnostics), which then gets the full GLB inspect/optimize/validate path.`;
}

/** Run an `assets add` admission and attach the convert hint to its messages, or to its error. */
export async function withConvertHint<T extends { readonly messages: readonly string[] }>(file: string, run: () => Promise<T>): Promise<T> {
  const hint = convertHintForModel(file);
  if (!hint) return run();
  let result: T;
  try {
    result = await run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${message}\n${hint}`, { cause: error });
  }
  return { ...result, messages: [...result.messages, hint] };
}
