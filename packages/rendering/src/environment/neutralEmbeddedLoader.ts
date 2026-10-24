import { NEUTRAL_FLOOR_SH9, buildProbeFromLevels } from "./probeBuild.js";
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

/** KTX2 bytes of the baked neutral specular cube, decoded from the embedded module (loaded lazily, its own chunk). */
export async function readEmbeddedNeutralKtx2(): Promise<Uint8Array> {
  const { NEUTRAL_SPECULAR_GZIP_BASE64 } = await import("./neutralEmbedded.js");
  return gunzip(fromBase64(NEUTRAL_SPECULAR_GZIP_BASE64));
}

/** The baked `neutral` preset probe without any network fetch: identical bytes to /aura-environments/neutral.*. */
export async function loadEmbeddedNeutralProbe() {
  const cube = readRgb9e5Cube(await readEmbeddedNeutralKtx2());
  const levels = cube.levels.map((faces, i) => ({ faceSize: Math.max(1, cube.faceSize >> i), faces }));
  return buildProbeFromLevels(levels, 256 as EnvironmentProbe["faceSize"], {
    source: "preset",
    sh9: new Float32Array(NEUTRAL_FLOOR_SH9),
    label: "env-preset-neutral"
  });
}
