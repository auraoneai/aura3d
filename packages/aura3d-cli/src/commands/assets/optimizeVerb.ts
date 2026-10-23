import { isOptimizeRole, optimizeGlbFile, optimizeUsage, type OptimizeRole } from "./optimize.js";

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

/** CLI wrapper for direct-file optimize; the prd05 `assets optimize` verb delegates here when `--file` is present. */
export async function optimizeFileVerb(argv: readonly string[], io: VerbIo): Promise<number> {
  const file = flag(argv, "--file");
  const out = flag(argv, "--out");
  if (!file || !out) {
    io.stderr(`Usage: ${optimizeUsage()}`);
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
