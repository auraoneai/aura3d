/**
 * Lazy loader for the glTF-Transform stack used by `assets optimize` (file mode) and `assets merge-clips`.
 *
 * The CLI keeps zero hard dependencies on these packages: they resolve from the project (or from the CLI's own install)
 * the first time a command needs them, and a missing one produces an actionable error instead of a stack trace.
 */

import { createRequire } from "node:module";
import { resolve } from "node:path";

// The glTF-Transform types are only present when the optional packages are installed, so the toolkit is loosely typed.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Loose = any;

export interface GltfToolkit {
  readonly NodeIO: Loose;
  readonly Document: Loose;
  readonly ALL_EXTENSIONS: Loose;
  readonly functions: Loose;
  readonly MeshoptEncoder: Loose;
  readonly MeshoptDecoder: Loose;
  readonly MeshoptSimplifier: Loose;
  readonly sharp: Loose;
}

export const GLTF_TOOLKIT_PACKAGES = ["@gltf-transform/core", "@gltf-transform/extensions", "@gltf-transform/functions", "meshoptimizer", "sharp"] as const;

export class GltfToolkitMissingError extends Error {
  constructor(readonly missing: readonly string[]) {
    super(`This command needs ${missing.join(", ")}. Install them in your project: npm install --save-dev ${GLTF_TOOLKIT_PACKAGES.join(" ")}`);
    this.name = "GltfToolkitMissingError";
  }
}

export function loadGltfToolkit(projectDir: string = process.cwd()): GltfToolkit {
  const requirers = [createRequire(resolve(projectDir, "package.json")), createRequire(import.meta.url)];
  const missing: string[] = [];
  const load = (id: string): Loose => {
    for (const req of requirers) {
      try {
        return req(id);
      } catch {
        // try the next resolution root
      }
    }
    missing.push(id);
    return undefined;
  };
  const core = load("@gltf-transform/core");
  const extensions = load("@gltf-transform/extensions");
  const functions = load("@gltf-transform/functions");
  const meshopt = load("meshoptimizer");
  const sharp = load("sharp");
  if (missing.length > 0) throw new GltfToolkitMissingError(missing);
  return {
    NodeIO: core.NodeIO,
    Document: core.Document,
    ALL_EXTENSIONS: extensions.ALL_EXTENSIONS,
    functions,
    MeshoptEncoder: meshopt.MeshoptEncoder,
    MeshoptDecoder: meshopt.MeshoptDecoder,
    MeshoptSimplifier: meshopt.MeshoptSimplifier,
    sharp: sharp.default ?? sharp
  };
}

export async function createGltfIo(toolkit: GltfToolkit): Promise<Loose> {
  await toolkit.MeshoptEncoder.ready;
  await toolkit.MeshoptDecoder.ready;
  await toolkit.MeshoptSimplifier.ready;
  return new toolkit.NodeIO()
    .registerExtensions(toolkit.ALL_EXTENSIONS)
    .registerDependencies({ "meshopt.encoder": toolkit.MeshoptEncoder, "meshopt.decoder": toolkit.MeshoptDecoder });
}
