/**
 * 5.6.0 command group `convert` (see artifacts/cli-gaps/REPORT.md A5): `aura3d assets convert`. Imported by
 * ../registry.ts; the `assets add` hint lives in ./hint.ts.
 */

import { registerCliCommand } from "../../contracts/commands.js";
import { ConvertUsageError, convertModel, convertUsage, type ConvertModelResult } from "./convert.js";

export { convertModel, convertUsage, loadConvertToolkit, ConvertUsageError } from "./convert.js";
export type { ConvertDiagnostic, ConvertModelOptions, ConvertModelResult, ConvertVerification } from "./convert.js";
export { CONVERT_INPUT_EXTENSIONS, convertHintForModel, withConvertHint } from "./hint.js";

const VALUE_FLAGS = new Set(["--out", "--unit-scale", "--up"]);
const BOOLEAN_FLAGS = new Set(["--embed-textures", "--json", "--help", "-h"]);

interface ParsedArgs {
  readonly input?: string;
  readonly values: ReadonlyMap<string, string>;
  readonly flags: ReadonlySet<string>;
  readonly error?: string;
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  const values = new Map<string, string>();
  const flags = new Set<string>();
  const positionals: string[] = [];
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]!;
    if (VALUE_FLAGS.has(arg)) {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) return { values, flags, error: `${arg} needs a value.` };
      values.set(arg, value);
      index++;
    } else if (BOOLEAN_FLAGS.has(arg)) {
      flags.add(arg);
    } else if (arg.startsWith("-")) {
      return { values, flags, error: `Unknown flag ${arg}.` };
    } else {
      positionals.push(arg);
    }
  }
  if (positionals.length > 1) return { values, flags, error: `Expected one input file, got ${positionals.length}: ${positionals.join(" ")}.` };
  return { ...(positionals[0] ? { input: positionals[0] } : {}), values, flags };
}

function printHuman(result: ConvertModelResult, stdout: (line: string) => void): void {
  const v = result.verification;
  stdout(`${result.ok ? "converted" : "converted with verification failures"}: ${result.input} -> ${result.output} (${result.bytes} bytes, ${result.format.toUpperCase()}, partial parity)`);
  stdout(`  meshes ${v.meshes}, vertices ${v.vertexCount ?? 0}, materials ${v.materials}, textures ${v.textures}, skins ${v.skins}, animations ${v.animations.length ? v.animations.join(", ") : "none"}`);
  if (v.bounds) stdout(`  bounds size ${v.bounds.size.map((n) => Number(n.toFixed(4))).join(" x ")} m (unit scale ${result.unitScale}, up ${result.up})`);
  if (result.embeddedTextures.length) stdout(`  embedded textures: ${result.embeddedTextures.join(", ")}`);
  if (result.droppedTextures.length) stdout(`  dropped textures: ${result.droppedTextures.join(", ")}`);
  stdout("diagnostics:");
  for (const item of result.diagnostics) {
    stdout(`  [${item.severity}] ${item.code} (${item.source}): ${item.message}${item.nextAction ? ` -> ${item.nextAction}` : ""}`);
  }
  for (const warning of v.warnings) stdout(`  [inspect] ${warning}`);
  stdout(`next: aura3d assets inspect ${result.output}  |  aura3d assets add ${result.output} --name <key>`);
}

registerCliCommand({
  name: "assets convert",
  owner: "convert",
  summary: "Convert FBX/OBJ/DAE/USD/PLY/STL/3MF/VOX/BVH to a verified GLB via Aura3D's bounded importers (partial parity, diagnostics reported).",
  usage: convertUsage(),
  run: async (argv, io) => {
    const parsed = parseArgs(argv);
    const json = parsed.flags.has("--json");
    if (parsed.flags.has("--help") || parsed.flags.has("-h")) {
      io.stdout(convertUsage());
      return 0;
    }
    const usageError = (message: string): number => {
      if (json) io.stdout(JSON.stringify({ ok: false, error: message, usage: convertUsage() }));
      else io.stderr(`${message}\nUsage: ${convertUsage()}`);
      return 2;
    };
    if (parsed.error) return usageError(parsed.error);
    const out = parsed.values.get("--out");
    if (!parsed.input || !out) return usageError("assets convert needs an input file and --out <file.glb>.");
    const scaleText = parsed.values.get("--unit-scale");
    const unitScale = scaleText === undefined ? undefined : Number(scaleText);
    const up = parsed.values.get("--up")?.toLowerCase();
    try {
      const result = await convertModel({
        input: parsed.input,
        output: out,
        cwd: io.cwd,
        ...(unitScale !== undefined ? { unitScale } : {}),
        ...(up !== undefined ? { up: up as "y" | "z" } : {}),
        embedTextures: parsed.flags.has("--embed-textures")
      });
      if (json) io.stdout(JSON.stringify(result, null, 2));
      else printHuman(result, io.stdout);
      return result.ok ? 0 : 1;
    } catch (error) {
      if (error instanceof ConvertUsageError) return usageError(error.message);
      const message = error instanceof Error ? error.message : String(error);
      if (json) io.stdout(JSON.stringify({ ok: false, input: parsed.input, output: out, error: message }));
      else io.stderr(`assets convert failed: ${message}`);
      return 1;
    }
  }
});
