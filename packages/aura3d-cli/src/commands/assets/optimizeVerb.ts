import {
  isHdriSize,
  isOptimizeRole,
  optimizeGlbFile,
  optimizeHdriFile,
  optimizeHdriUsage,
  optimizeUsage,
  type OptimizeRole
} from "./optimize.js";

interface VerbIo {
  readonly cwd: string;
  readonly stdout: (line: string) => void;
  readonly stderr: (line: string) => void;
}

function flag(argv: readonly string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  const value = index >= 0 ? argv[index + 1] : undefined;
  return value && !value.startsWith("--") ? value : undefined;
}

/** GU47 E-A: `--file in.hdr --out out_1k.hdr --hdri 1k|2k [--rgb9e5-cube]` (downsized `.hdr`, optional RGB9E5 cube). */
async function optimizeHdriVerb(argv: readonly string[], io: VerbIo, file: string, out: string): Promise<number> {
  const size = flag(argv, "--hdri");
  if (size === undefined || !isHdriSize(size)) {
    io.stderr(`Unsupported --hdri "${size ?? ""}". Use 1k or 2k. Usage: ${optimizeHdriUsage()}`);
    return 2;
  }
  const result = await optimizeHdriFile({ projectDir: io.cwd, input: file, output: out, size, rgb9e5Cube: argv.includes("--rgb9e5-cube") });
  if (argv.includes("--json")) {
    io.stdout(JSON.stringify(result, null, 2));
    return 0;
  }
  io.stdout(`${result.output}: ${result.bytesIn} -> ${result.bytesOut} bytes, ${result.widthIn}x${result.heightIn} -> ${result.width}x${result.height}${result.resized ? "" : " (source at or below target, not upsampled)"}`);
  if (result.cube) io.stdout(`${result.cube.output}: RGB9E5 cube ${result.cube.faceSize}px x ${result.cube.mipCount} mips, ${result.cube.bytes} bytes`);
  return 0;
}

/** CLI wrapper for direct-file optimize; the prd05 `assets optimize` verb delegates here when `--file` is present. */
export async function optimizeFileVerb(argv: readonly string[], io: VerbIo): Promise<number> {
  const file = flag(argv, "--file");
  const out = flag(argv, "--out");
  const hdri = argv.includes("--hdri");
  if (!file || !out) {
    io.stderr(`Usage: ${optimizeUsage()}`);
    io.stderr(`       ${optimizeHdriUsage()}`);
    return 2;
  }
  if (hdri) return optimizeHdriVerb(argv, io, file, out);
  if (argv.includes("--rgb9e5-cube")) {
    io.stderr(`--rgb9e5-cube needs --hdri. Usage: ${optimizeHdriUsage()}`);
    return 2;
  }
  const role = flag(argv, "--role");
  if (role !== undefined && !isOptimizeRole(role)) {
    io.stderr(`Unsupported --role "${role}". Use hero, vehicle, character, prop or background.`);
    return 2;
  }
  const maxVerts = flag(argv, "--max-verts");
  const tex = flag(argv, "--tex");
  const error = flag(argv, "--error");
  const result = await optimizeGlbFile({
    projectDir: io.cwd,
    input: file,
    output: out,
    ...(role ? { role: role as OptimizeRole } : {}),
    ...(maxVerts ? { maxVerts: Number(maxVerts) } : {}),
    ...(tex ? { tex: Number(tex) } : {}),
    ...(error ? { error: Number(error) } : {}),
    simplify: !argv.includes("--no-simplify"),
    meshopt: argv.includes("--meshopt")
  });
  if (argv.includes("--json")) io.stdout(JSON.stringify(result, null, 2));
  else io.stdout(`${result.output}: ${result.bytesIn} -> ${result.bytesOut} bytes, vertices ${result.vertsBefore} -> ${result.vertsAfter} (${result.role} budget ${result.maxVerts}, textures <= ${result.tex}px)${result.skinned ? ", skinned" : ""}`);
  return 0;
}
