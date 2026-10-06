/**
 * `aura3d environments bake` (PRD-02 §13 / C-39). Bakes an environment probe
 * asset: samples the source scene to cube faces, runs the CPU GGX prefilter
 * (workers/cpuPrefilter.ts — no average blend), projects SH9, and writes
 * `<out>/<name>.{specular.ktx2, sh9.f32, manifest.json}`.
 *
 * Day-0 sources: `room` (the r185 neutral-room scene). Later phases add
 * `.hdr`/`.ktx2` inputs through the same path.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";

/**
 * Lane-02 math lives in `packages/rendering/src/environment/**`. aura3d-cli
 * may not depend on `@aura3d/rendering` (lane-05 package.json) and the
 * package's exports map has no `./lanes` subpath (lane-15), so the bake
 * runner resolves the lane barrel relative to the source tree — identical
 * layout under `packages/` in src and the tsc-emitted dist mirror.
 */
type Lanes = typeof import("../../../../rendering/src/lanes/prd02.js");
const lanes = (): Promise<Lanes> => import("../../../../rendering/src/lanes/prd02.js");

interface BakeArgs {
  source: "room" | "hdr";
  hdrPath?: string;
  intensity: number;
  rotateYawDeg: number;
  faceSize: number;
  samples: number;
  outDir: string;
  name: string;
  tags: string[];
}

function parseArgs(argv: readonly string[], cwd: string): BakeArgs {
  const args: BakeArgs = { source: "room", faceSize: 256, samples: 128, outDir: cwd, name: "room-neutral", intensity: 1, rotateYawDeg: 0, tags: ["neutral", "stand-in"] };
  for (let i = 0; i < argv.length; i += 1) {
    const v = argv[i + 1];
    if (argv[i] === "--source" && v) { args.source = v as BakeArgs["source"]; i += 1; }
    else if (argv[i] === "--hdr" && v) { args.source = "hdr"; args.hdrPath = resolve(cwd, v); i += 1; }
    else if (argv[i] === "--intensity" && v) { args.intensity = Number(v); i += 1; }
    else if (argv[i] === "--rotate" && v) { args.rotateYawDeg = Number(v); i += 1; }
    else if (argv[i] === "--face-size" && v) { args.faceSize = Number(v); i += 1; }
    else if (argv[i] === "--samples" && v) { args.samples = Number(v); i += 1; }
    else if (argv[i] === "--out" && v) { args.outDir = resolve(cwd, v); i += 1; }
    else if (argv[i] === "--name" && v) { args.name = v; i += 1; }
    else if (argv[i] === "--tags" && v) { args.tags = v.split(","); i += 1; }
  }
  return args;
}

function sampleSourceToCube(L: Lanes, args: BakeArgs, faceSize: number): Float32Array[] {
  const { faceUvToDir, sampleRoomEnvironment, decodeHdrEquirect, sampleEquirect } = L;
  let img: { width: number; height: number; data: Float32Array } | undefined;
  if (args.source === "hdr") {
    if (!args.hdrPath) throw new Error("--hdr requires a path");
    img = decodeHdrEquirect(readFileSync(args.hdrPath));
  } else if (args.source !== "room") {
    throw new Error(`unsupported source ${args.source}`);
  }
  const yaw = (args.rotateYawDeg * Math.PI) / 180;
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const faces: Float32Array[] = [];
  const step = 2 / faceSize;
  for (let f = 0; f < 6; f += 1) {
    const face = new Float32Array(faceSize * faceSize * 4);
    for (let y = 0; y < faceSize; y += 1) {
      for (let x = 0; x < faceSize; x += 1) {
        const dir = faceUvToDir(f, (x + 0.5) * step - 1, (y + 0.5) * step - 1);
        const rd: [number, number, number] = [dir[0] * cy + dir[2] * sy, dir[1], -dir[0] * sy + dir[2] * cy];
        const [r, g, b] = img ? sampleEquirect(img, rd) : sampleRoomEnvironment(rd);
        const i = (y * faceSize + x) * 4;
        face[i] = r * args.intensity; face[i + 1] = g * args.intensity; face[i + 2] = b * args.intensity; face[i + 3] = 1;
      }
    }
    faces.push(face);
  }
  return faces;
}

/** Serialize the mip chain as a minimal KTX2 RGB9E5 container (reader: Rgb9e5Cube.ts). */
function encodeKtx2Rgb9e5Cube(L: Lanes, faceSize: number, levels: readonly { readonly faceSize: number; readonly faces: readonly Float32Array[] }[]): Uint8Array {
  const { packRgb9e5 } = L;
  const header = 68;
  const index = header + levels.length * 24;
  let dataOff = index;
  const levelBytes = levels.map((l) => 6 * l.faceSize * l.faceSize * 4);
  const total = levelBytes.reduce((a, b) => a + b, 0);
  const bytes = new Uint8Array(dataOff + total);
  bytes.set([0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const v = new DataView(bytes.buffer);
  v.setUint32(12, 142, true);           // VK_FORMAT_E5B9G9R9_UFLOAT_PACK32
  v.setUint32(16, 4, true);             // typeSize
  v.setUint32(20, faceSize, true);
  v.setUint32(24, faceSize, true);
  v.setUint32(28, 0, true);             // depth
  v.setUint32(32, 0, true);             // layers
  v.setUint32(36, 6, true);             // faces
  v.setUint32(40, levels.length, true);
  v.setUint32(44, 0, true);             // supercompression
  v.setUint32(48, 68, true); v.setUint32(52, 0, true);  // dfd
  v.setUint32(56, 68, true); v.setUint32(60, 0, true);  // kvd
  levels.forEach((level, li) => {
    const size = level.faceSize;
    const bytesL = levelBytes[li]!;
    v.setBigUint64(header + li * 24, BigInt(dataOff), true);
    v.setBigUint64(header + li * 24 + 8, BigInt(bytesL), true);
    v.setBigUint64(header + li * 24 + 16, BigInt(bytesL), true);
    const u32 = new Uint32Array(bytes.buffer, dataOff, size * size * 6);
    let w = 0;
    for (let f = 0; f < 6; f += 1) {
      const face = level.faces[f]!;
      for (let t = 0; t < size * size; t += 1) {
        u32[w++] = packRgb9e5(face[t * 4]!, face[t * 4 + 1]!, face[t * 4 + 2]!);
      }
    }
    dataOff += bytesL;
  });
  return bytes;
}

export async function runEnvironmentsBake(argv: readonly string[], io: { readonly cwd: string; stdout(s: string): void; stderr(s: string): void }): Promise<number> {
  const args = parseArgs(argv, io.cwd);
  const L = await lanes();
  const faceCount = L.mipCountForFaceSize(args.faceSize);
  io.stdout(`baking ${args.source} @ ${args.faceSize}px, ${faceCount} mips, ${args.samples} samples/texel`);
  const faces = sampleSourceToCube(L, args, args.faceSize);
  const result = L.prefilterCubeGGX({ faceSize: args.faceSize, faces }, {
    samples: args.samples,
    onProgress: (level, face) => io.stdout(`mip ${level} face ${face}`)
  });
  const sh9 = L.projectCubeToSH9(faces, args.faceSize);
  const ktx2 = encodeKtx2Rgb9e5Cube(L, args.faceSize, result.levels);
  mkdirSync(args.outDir, { recursive: true });
  const specPath = join(args.outDir, `${args.name}.specular.ktx2`);
  const shPath = join(args.outDir, `${args.name}.sh9.f32`);
  const manifestPath = join(args.outDir, `${args.name}.manifest.json`);
  writeFileSync(specPath, Buffer.from(ktx2.buffer, ktx2.byteOffset, ktx2.byteLength));
  writeFileSync(shPath, Buffer.from(sh9.buffer, sh9.byteOffset, sh9.byteLength));
  const manifest = {
    name: args.name,
    source: args.source,
    faceSize: args.faceSize,
    mipCount: result.mipCount,
    format: "E5B9G9R9_UFLOAT_PACK32",
    specular: `${args.name}.specular.ktx2`,
    sh9: `${args.name}.sh9.f32`,
    sha256: {
      specular: createHash("sha256").update(ktx2).digest("hex"),
      sh9: createHash("sha256").update(Buffer.from(sh9.buffer, sh9.byteOffset, sh9.byteLength)).digest("hex")
    },
    license: "CC0",
    tags: args.tags,
    bakedBy: "aura3d environments bake",
    samplesPerTexel: args.samples
  };
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  io.stdout(`wrote ${specPath}`);
  io.stdout(`wrote ${shPath}`);
  io.stdout(`wrote ${manifestPath}`);
  return 0;
}
