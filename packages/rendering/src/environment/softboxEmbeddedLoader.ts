import { buildProbeFromLevels } from "./probeBuild.js";
import { readRgb9e5Cube } from "./Rgb9e5Cube.js";
import type { EnvironmentProbe } from "../contracts/environment.js";

async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  const Decompression = (globalThis as { DecompressionStream?: new (format: "gzip") => TransformStream<Uint8Array, Uint8Array> }).DecompressionStream;
  if (!Decompression) throw new Error("ENV_EMBEDDED_UNSUPPORTED: DecompressionStream is not available");
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new Decompression("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function fromBase64(text: string): Uint8Array {
  const binary = atob(text);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

/** The baked `softbox` preset probe without any network fetch: identical bytes to /aura-environments/softbox.*. */
export async function loadEmbeddedSoftboxProbe() {
  const { SOFTBOX_SPECULAR_GZIP_BASE64, SOFTBOX_SH9, SOFTBOX_FACE_SIZE } = await import("./softboxEmbedded.js");
  const cube = readRgb9e5Cube(await gunzip(fromBase64(SOFTBOX_SPECULAR_GZIP_BASE64)));
  const levels = cube.levels.map((faces, i) => ({ faceSize: Math.max(1, cube.faceSize >> i), faces }));
  return buildProbeFromLevels(levels, SOFTBOX_FACE_SIZE as EnvironmentProbe["faceSize"], {
    source: "preset",
    sh9: new Float32Array(SOFTBOX_SH9),
    label: "env-preset-softbox"
  });
}
