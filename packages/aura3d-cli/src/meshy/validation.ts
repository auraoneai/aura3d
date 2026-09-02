import { closeSync, existsSync, openSync, readSync, realpathSync, readdirSync, statSync } from "node:fs";
import { extname, isAbsolute, relative, resolve } from "node:path";

export const MAX_MESHY_GLB_BYTES = 100 * 1024 * 1024;

export function resolveConfinedPath(allowedRoot: string, candidate: string, label: string): string {
  if (!existsSync(allowedRoot)) throw new Error(`Meshy allowed root does not exist: ${allowedRoot}`);
  const lexicalRoot = resolve(allowedRoot);
  const target = resolve(isAbsolute(candidate) ? candidate : resolve(lexicalRoot, candidate));
  const lexicalRelative = relative(lexicalRoot, target);
  if (lexicalRelative === ".." || lexicalRelative.startsWith("../") || isAbsolute(lexicalRelative)) {
    throw new Error(`Meshy ${label} escapes the allowed root: ${candidate}`);
  }
  if (!existsSync(target)) throw new Error(`Meshy ${label} does not exist: ${candidate}`);
  const root = realpathSync(lexicalRoot);
  const realTarget = realpathSync(target);
  const realRelative = relative(root, realTarget);
  if (realRelative === ".." || realRelative.startsWith("../") || isAbsolute(realRelative)) {
    throw new Error(`Meshy ${label} escapes the allowed root through a symbolic link: ${candidate}`);
  }
  return realTarget;
}
export function selectMeshyGlb(inputDir: string, file: string | undefined): string {
  if (!statSync(inputDir).isDirectory()) throw new Error(`Meshy input must be a directory: ${inputDir}`);
  if (file) {
    const selected = resolveConfinedPath(inputDir, file, "selected GLB");
    validateMeshyGlb(selected);
    return selected;
  }
  const glbs = readdirSync(inputDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && extname(entry.name).toLowerCase() === ".glb")
    .map((entry) => resolve(inputDir, entry.name));
  if (glbs.length === 0) throw new Error("Meshy output contains no GLB. Supply a completed local output directory.");
  if (glbs.length > 1) throw new Error("Meshy output contains multiple GLBs. Select exactly one with --file <relative.glb>.");
  validateMeshyGlb(glbs[0]!);
  return glbs[0]!;
}

export function validateMeshyGlb(path: string): void {
  const stat = statSync(path);
  if (!stat.isFile()) throw new Error(`Meshy GLB is not a regular file: ${path}`);
  if (extname(path).toLowerCase() !== ".glb") throw new Error(`Meshy selected file must use the .glb extension: ${path}`);
  if (stat.size < 20) throw new Error(`Meshy GLB is too small to be valid: ${path}`);
  if (stat.size > MAX_MESHY_GLB_BYTES) throw new Error(`Meshy GLB exceeds ${MAX_MESHY_GLB_BYTES} bytes: ${path}`);
  const bytes = Buffer.alloc(12);
  const handle = openSync(path, "r");
  try { readSync(handle, bytes, 0, 12, 0); } finally { closeSync(handle); }
  if (bytes.toString("utf8", 0, 4) !== "glTF") throw new Error(`Meshy GLB has invalid magic bytes: ${path}`);
  if (bytes.readUInt32LE(8) !== stat.size) throw new Error(`Meshy GLB declared length does not match its file size: ${path}`);
}
