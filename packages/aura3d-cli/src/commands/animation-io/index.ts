/**
 * 5.6.0 command group `animation-io` (see artifacts/cli-gaps/REPORT.md A1): `aura3d animation import`.
 * Registered with registerCliCommand; this barrel is imported by ../registry.ts.
 */
import { registerCliCommand } from "../../contracts/commands.js";
import { AnimationImportError, importClipsOntoRig, type ImportClipSource, type ImportClipsResult } from "./importClips.js";

export { AnimationImportError, importClipsOntoRig } from "./importClips.js";
export type { ImportClipSource, ImportClipsOntoRigOptions, ImportClipsResult, ImportedClipReport, RoleMap } from "./importClips.js";
export { readGltfSkeleton, readSourceClips, sourceFormatOf } from "./sources.js";

export const ANIMATION_IMPORT_USAGE = `aura3d animation import <src> --onto rigged.glb --out hero.glb [--name Jab] [name=src[#clip] ...]
    [--clips a,b] [--map auto|map.json] [--root-motion in-place|keep|strip] [--window a,b] [--loop] [--fps 30]
    [--face-forward|--keep-turn] [--source-facing auto|+z|-z|+x|-x] [--target-facing auto|+z|-z|+x|-x]
    [--keep-base-animations] [--strict] [--dry-run] [--json]

  Retarget motion onto a rigged humanoid GLB and write real glTF animation clips.
  Sources: .bvh, .fbx, .glb/.gltf clips, HY-Motion motion.json (fal-ai/hunyuan-motion "motion_json").
  Roles are mapped automatically (named rigs and Idol's unnamed bone_N rigs); --map takes
  {"target":{"hips":"bone_0",...},"source":{...}} to override. Default root motion is in-place (vertical bob kept).
  Every clip is checked before writing (limb flips, retarget error, frozen T-pose) and the output gets
  "assets validate --skin --clips": skin defects the base rig already shows in its own clips (or that
  aura.skin-allow.json allows for the output or the admitted --onto asset) are warnings unless the new clips
  make them materially worse (new code, or > 1.5x the stretched/flap triangles); --strict fails on any
  skin error that is not allow-listed for the output. Exit 0 ok, 1 failed check, 2 usage error.`;

const VALUE_FLAGS = new Set(["--onto", "--out", "--name", "--clips", "--map", "--root-motion", "--window", "--fps", "--source-facing", "--target-facing"]);
const BOOL_FLAGS = new Set(["--strict", "--loop", "--face-forward", "--keep-turn", "--keep-base-animations", "--dry-run", "--json", "--help", "-h"]);
const FACINGS = new Set(["auto", "+z", "-z", "+x", "-x"]);

class UsageError extends Error {}

interface ParsedArgs {
  readonly values: Map<string, string>;
  readonly flags: Set<string>;
  readonly positional: string[];
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  const values = new Map<string, string>();
  const flags = new Set<string>();
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    const eq = arg.startsWith("--") ? arg.indexOf("=") : -1;
    const key = eq > 0 ? arg.slice(0, eq) : arg;
    if (VALUE_FLAGS.has(key)) {
      const value = eq > 0 ? arg.slice(eq + 1) : argv[++i];
      // Facing values start with "+"/"-" but never "--".
      if (value === undefined || value.startsWith("--")) throw new UsageError(`${key} needs a value.`);
      values.set(key, value);
    } else if (BOOL_FLAGS.has(arg)) flags.add(arg);
    else if (arg.startsWith("--")) throw new UsageError(`Unknown flag ${arg}.`);
    else positional.push(arg);
  }
  return { values, flags, positional };
}

function parseSpec(spec: string): ImportClipSource {
  const eq = spec.indexOf("=");
  const named = eq > 0 && !/[\\/]/.test(spec.slice(0, eq));
  const name = named ? spec.slice(0, eq) : undefined;
  const rest = named ? spec.slice(eq + 1) : spec;
  const hash = rest.lastIndexOf("#");
  const file = hash > 0 ? rest.slice(0, hash) : rest;
  const clip = hash > 0 ? rest.slice(hash + 1) : undefined;
  if (!file) throw new UsageError(`Clip spec "${spec}" must look like src, name=src or name=src#clip.`);
  return { file, ...(name ? { name } : {}), ...(clip ? { clip } : {}) };
}

function parseWindow(raw: string): readonly [number, number] {
  const parts = raw.split(",").map((x) => Number(x.trim()));
  if (parts.length !== 2 || parts.some((x) => !Number.isFinite(x)) || parts[0]! < 0 || parts[1]! <= parts[0]!) {
    throw new UsageError(`--window must be "start,end" seconds with end > start >= 0 (got "${raw}").`);
  }
  return [parts[0]!, parts[1]!];
}

function formatText(result: ImportClipsResult): string[] {
  const lines: string[] = [];
  lines.push(`target ${result.target.file}: facing ${result.target.facing} (${result.target.facingMethod}), hips ${result.target.roles.hips}`);
  for (const c of result.clips) {
    lines.push(`${c.name} <- ${c.source}${c.sourceClip !== c.name ? `#${c.sourceClip}` : ""} [${c.format}]: ${c.duration.toFixed(2)} s, ${c.frames} keys @ ${c.fps} fps, ${c.channels} channels, limb error ${c.limbErrorDeg.max.toFixed(2)}° (written ${c.verifiedErrorDeg.toFixed(2)}°), motion ${c.motionDeg.toFixed(0)}°, flips ${c.flips}`);
  }
  if (result.skin) {
    lines.push(`skin check (${result.skin.mode}): ${result.skin.ok ? "passed" : "FAILED"}${result.skin.failures.length ? `\n  ${result.skin.failures.join("\n  ")}` : ""}`);
    for (const w of result.skin.warnings) lines.push(`  skin warning: ${w}`);
  }
  for (const w of result.warnings) lines.push(`warning: ${w}`);
  lines.push(result.dryRun
    ? `dry run: would write ${result.output} (${result.bytes} bytes), animations: ${result.animations.join(", ")}`
    : `wrote ${result.output} (${result.bytes} bytes), animations: ${result.animations.join(", ")}`);
  if (!result.ok) lines.push(`FAILED: ${result.failures.map((f) => f.replace(/\.$/, "")).join("; ")}. Fix the rig (aura3d assets repair-skin), record a known defect in aura.skin-allow.json, or use a gentler clip.`);
  return lines;
}

registerCliCommand({
  name: "animation import",
  owner: "animation-io",
  summary: "Retarget .bvh/.fbx/.glb clips or HY-Motion motion.json onto a rigged GLB as real glTF animation clips.",
  usage: ANIMATION_IMPORT_USAGE,
  run: async (argv, io) => {
    const json = argv.includes("--json");
    const fail = (code: number, message: string, extra: Record<string, unknown> = {}): number => {
      if (json) io.stdout(JSON.stringify({ ok: false, error: message, ...extra }));
      else io.stderr(message);
      return code;
    };
    if (argv.includes("--help") || argv.includes("-h")) {
      io.stdout(ANIMATION_IMPORT_USAGE);
      return 0;
    }
    let args: ParsedArgs;
    let specs: ImportClipSource[];
    try {
      args = parseArgs(argv);
      specs = args.positional.map(parseSpec);
      if (!args.values.get("--onto") || !args.values.get("--out") || specs.length === 0) throw new UsageError("animation import needs a source, --onto rigged.glb and --out hero.glb.");
      const name = args.values.get("--name");
      if (name) {
        if (specs.length !== 1 || specs[0]!.name) throw new UsageError("--name names a single unnamed source; use name=src for several clips.");
        specs = [{ ...specs[0]!, name }];
      }
      if (args.flags.has("--face-forward") && args.flags.has("--keep-turn")) throw new UsageError("--face-forward and --keep-turn are exclusive.");
      const rm = args.values.get("--root-motion");
      if (rm && rm !== "in-place" && rm !== "keep" && rm !== "strip") throw new UsageError(`--root-motion must be in-place, keep or strip (got "${rm}").`);
      for (const f of ["--source-facing", "--target-facing"]) {
        const v = args.values.get(f);
        if (v && !FACINGS.has(v)) throw new UsageError(`${f} must be auto, +z, -z, +x or -x (got "${v}").`);
      }
      const fps = args.values.get("--fps");
      if (fps !== undefined && !(Number(fps) >= 1 && Number(fps) <= 240)) throw new UsageError(`--fps must be a number from 1 to 240 (got "${fps}").`);
    } catch (error) {
      if (error instanceof UsageError) return fail(2, `${error.message}\nUsage: ${ANIMATION_IMPORT_USAGE}`);
      throw error;
    }
    const v = args.values;
    const windowRaw = v.get("--window");
    let window: readonly [number, number] | undefined;
    try { window = windowRaw ? parseWindow(windowRaw) : undefined; } catch (error) {
      return fail(2, `${(error as Error).message}\nUsage: ${ANIMATION_IMPORT_USAGE}`);
    }
    try {
      const result = await importClipsOntoRig({
        projectDir: io.cwd,
        onto: v.get("--onto")!,
        output: v.get("--out")!,
        clips: specs,
        ...(v.get("--clips") ? { sourceClips: v.get("--clips")!.split(",").map((x) => x.trim()).filter(Boolean) } : {}),
        ...(v.get("--map") ? { map: v.get("--map")! } : {}),
        ...(v.get("--root-motion") ? { rootMotion: v.get("--root-motion") as "in-place" | "keep" | "strip" } : {}),
        ...(window ? { window } : {}),
        ...(args.flags.has("--loop") ? { loop: true } : {}),
        ...(v.get("--fps") ? { fps: Number(v.get("--fps")) } : {}),
        ...(args.flags.has("--keep-turn") ? { faceForward: false } : {}),
        ...(v.get("--source-facing") ? { sourceFacing: v.get("--source-facing") as "auto" } : {}),
        ...(v.get("--target-facing") ? { targetFacing: v.get("--target-facing") as "auto" } : {}),
        ...(args.flags.has("--keep-base-animations") ? { keepBaseAnimations: true } : {}),
        ...(args.flags.has("--dry-run") ? { dryRun: true } : {}),
        ...(args.flags.has("--strict") ? { strict: true } : {})
      });
      if (json) {
        const { skin, ...rest } = result;
        io.stdout(JSON.stringify({ ...rest, ...(skin ? { skin: { ok: skin.ok, mode: skin.mode, failures: skin.failures, warnings: skin.warnings, allowed: skin.allowed, allowedBy: skin.allowedBy, ...(skin.base ? { base: skin.base } : {}), imported: skin.imported } } : {}) }));
      } else for (const line of formatText(result)) (result.ok ? io.stdout : io.stderr)(line);
      return result.ok ? 0 : 1;
    } catch (error) {
      if (error instanceof AnimationImportError) {
        const usage = error.code === "ANIMATION_IMPORT_USAGE";
        return fail(usage ? 2 : 1, usage ? `${error.message}\nUsage: ${ANIMATION_IMPORT_USAGE}` : error.message, { code: error.code });
      }
      return fail(1, error instanceof Error ? error.message : String(error));
    }
  }
});
