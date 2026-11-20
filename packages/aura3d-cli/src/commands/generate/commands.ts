/**
 * `aura3d assets generate` (A3, Idol on fal.ai) and `aura3d animation generate` (A2, HY-Motion on fal.ai → animation import).
 * Exit 0 ok / 1 failure / 2 usage. `--help` prints usage and writes nothing. The fal key is never printed.
 */

import { existsSync, readFileSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { listValue, numberValue, parseArgs, parseSize, parseWindow, slug, type ParsedArgs } from "./args.js";
import { describeFalKeySource, FAL_KEY_FIX, loadFalKey, redactSecret } from "./falKey.js";
import type { FalTransportOptions } from "./falClient.js";
import { resolveGenerateDeps, type GenerateDeps, type RetargetResult } from "./deps.js";
import {
  IDOL_KINDS, IDOL_OPTIMIZE_ROLE, IDOL_ROLES, runIdolSpec,
  type IdolItem, type IdolItemResult, type IdolKind, type IdolSpec
} from "./idol.js";
import { MOTION_PRICE, motionDictPath, runMotionSpec, validateMotionClip, type MotionClipResult, type MotionClipSpec, type MotionSpec } from "./motion.js";

export interface GenerateIo {
  readonly cwd: string;
  stdout(line: string): void;
  stderr(line: string): void;
}

/** Test seam: inject fetch/sleep timing and WP1/WP3 functions without touching the CLI surface. */
export interface GenerateRuntime {
  readonly fal?: FalTransportOptions;
  readonly deps?: Partial<GenerateDeps>;
  readonly env?: NodeJS.ProcessEnv;
  readonly home?: string;
}

const DEFAULT_WORK = ".aura3d/fal";

export const ASSETS_GENERATE_USAGE = `aura3d assets generate "<prompt>" --name key [--provider idol] [--kind object|character|creature|vehicle] [--rig [--animations idle,walk,run,jump]] [--role ${IDOL_ROLES.join("|")}] [--size height=1.8|length=4|width=2|maxDim=2] [--front +x|-x|+z|-z] [--yaw deg] [--max-verts N] [--tex N] [--no-simplify] [--no-slim] [--seed N] [--style realistic|"<style words>"] [--out-dir assets/idol] [--no-admit] [--force] [--dry-run] [--work ${DEFAULT_WORK}] [--game slug] [--key-file file] [--json]
aura3d assets generate --image ref.png --name key [same flags]
aura3d assets generate --spec idol-spec.json [--only a,b] [--concurrency 6] [--force] [--dry-run] [--no-admit] [--no-slim] [--json]
aura3d assets generate --name key --renormalize [--size ...] [--front ...] [--yaw ...] [--tex ...] [--max-verts ...] [--no-slim]   ($0: redo optimise/normalise/slim/preview from the raw downloads)
  Paid fal.ai lane: reference still (openai/gpt-image-2.6, $0.17; skipped with --image) -> speridlabs/idol/max ($0.20, $0.25 with --rig)
  -> skin refit (rigs) -> role-budget optimise -> scale/ground/face +Z -> slim normals (glossy materials keep PNG normals;
  --no-slim skips the step) -> CPU base-colour preview ->
  <out-dir>/<key>.glb + <key>.idol.json, admitted as quality "candidate" with the fal licence (skip with --no-admit).
  Key: FAL_KEY env, --key-file, ~/.config/aura3d/fal.env, ~/.config/auraone/fal.env (never printed). Every submit is ledgered
  to <work>/ledger.jsonl; a rerun resumes pending requests instead of paying twice. --dry-run prints the estimate only.
  --provider meshy points at the existing Meshy flow (assets resolve --allow meshy / assets import-meshy).
  Spec: { "game": "<slug>", "outDir": "assets/idol", "items": [ { "key": "hero", "subject": "...", "kind": "character", "rig": true, "size": { "height": 1.8 } } ] }`;

export const ANIMATION_GENERATE_USAGE = `aura3d animation generate "<prompt>" --onto rigged.glb --out hero.glb [--name Clip] [--duration 2] [--seed 7] [--guidance 5] [--loop] [--window a,b] [--keep-turn] [--fbx] [--keep-base-animations] [--force] [--dry-run] [--work ${DEFAULT_WORK}] [--game slug] [--key-file file] [--json]
aura3d animation generate --spec motion-spec.json --onto rigged.glb --out hero.glb [--only a,b] [--concurrency 8] [same flags]
  Text-to-motion on fal.ai (fal-ai/hunyuan-motion, $${MOTION_PRICE.toFixed(2)} per clip, +$${MOTION_PRICE.toFixed(2)} with --fbx): motion.json per clip under
  <work>/motion/<game>/<clip>/, then retargeted onto the rig with the \`animation import\` engine into --out.
  duration 0.5-12 s, guidance 1-10. --keep-turn keeps a clip's own turn (spins, pivots); loops cross-fade their end.
  Key: FAL_KEY env, --key-file, ~/.config/aura3d/fal.env, ~/.config/auraone/fal.env (never printed). Submits are ledgered to
  <work>/ledger.jsonl and resume from pending files without paying twice. --dry-run prints the estimate only.
  Spec: { "game": "<slug>", "onto": "rigged.glb", "outGlb": "hero.glb", "clips": [ { "key": "Run", "prompt": "...", "duration": 2, "loop": true } ] }`;

const COMMON_VALUES = ["--work", "--game", "--key-file", "--spec", "--only", "--concurrency"];
const COMMON_BOOLEANS = ["--dry-run", "--force", "--json", "--help", "-h"];

function redactingIo(io: GenerateIo, secrets: () => readonly (string | undefined)[]): GenerateIo {
  const clean = (line: string): string => secrets().reduce<string>((text, secret) => redactSecret(text, secret), line);
  return { cwd: io.cwd, stdout: (line) => io.stdout(clean(line)), stderr: (line) => io.stderr(clean(line)) };
}

function usageError(io: GenerateIo, usage: string, problems: readonly string[]): number {
  io.stderr(`${problems.join("; ")}.`);
  io.stderr(`Usage: ${usage}`);
  return 2;
}

function readJsonFile<T>(path: string, what: string): T {
  if (!existsSync(path)) throw new Error(`${what} ${path} does not exist.`);
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch (error) {
    throw new Error(`${what} ${path} is not valid JSON: ${(error as Error).message}`);
  }
}

interface Session {
  readonly io: GenerateIo;
  readonly projectDir: string;
  readonly work: string;
  readonly ledgerFile: string;
  fal: FalTransportOptions;
  readonly json: boolean;
  key: string | undefined;
}

function openSession(io: GenerateIo, args: ParsedArgs, runtime: GenerateRuntime): Session {
  const projectDir = resolve(io.cwd);
  const work = args.values.get("--work") ?? DEFAULT_WORK;
  const session: Session = {
    io, projectDir, work, ledgerFile: join(resolve(projectDir, work), "ledger.jsonl"), json: args.flags.has("--json"), key: undefined,
    fal: {
      ...runtime.fal, cwd: projectDir, ...(runtime.env ? { env: runtime.env } : {}), ...(runtime.home ? { home: runtime.home } : {}),
      ...(args.values.get("--key-file") ? { keyFile: args.values.get("--key-file") } : {})
    }
  };
  return session;
}

/** Load the key once (only for paid work) and pin it into the transport options so it is never re-read or printed. */
function bindKey(session: Session): void {
  if (session.key || session.fal.key) return;
  const loaded = loadFalKey(session.fal);
  session.key = loaded.key;
  session.fal = { ...session.fal, key: loaded.key };
}

function keyReport(session: Session): { keySource?: string; keyHint?: string } {
  const source = describeFalKeySource(session.fal);
  return source ? { keySource: source } : { keyHint: `no fal key found; a real run needs one. ${FAL_KEY_FIX}` };
}

const money = (value: number): string => `$${value.toFixed(2)}`;

// ---------------------------------------------------------------------------------------------- assets generate

const ASSETS_VALUES = [...COMMON_VALUES, "--provider", "--name", "--image", "--kind", "--animations", "--role", "--size", "--front", "--yaw", "--max-verts", "--tex", "--seed", "--style", "--out-dir"];
const ASSETS_BOOLEANS = [...COMMON_BOOLEANS, "--rig", "--renormalize", "--no-admit", "--no-simplify", "--no-slim"];

export async function assetsGenerateVerb(argv: readonly string[], rawIo: GenerateIo, runtime: GenerateRuntime = {}): Promise<number> {
  const env = runtime.env ?? process.env;
  let session: Session | undefined;
  const io = redactingIo(rawIo, () => [session?.key, env.FAL_KEY]);
  const args = parseArgs(argv, { values: ASSETS_VALUES, booleans: ASSETS_BOOLEANS });
  if (args.flags.has("--help") || args.flags.has("-h")) {
    io.stdout(ASSETS_GENERATE_USAGE);
    return 0;
  }
  const problems = [...args.errors];
  const provider = args.values.get("--provider") ?? "idol";
  if (provider === "meshy") {
    io.stderr("assets generate --provider meshy is not a lane of this command: Meshy runs through the existing flow.");
    io.stderr("  aura3d assets resolve \"<need>\" --name key --allow meshy [--dry-run]   (catalog first, Meshy only when allowed)");
    io.stderr("  aura3d assets import-meshy <download-dir> --name key ...               (admit a finished Meshy download)");
    return 2;
  }
  if (provider !== "idol") problems.push(`--provider ${provider} is not supported (use idol, or meshy for the existing Meshy flow)`);
  if (args.positionals.length > 1) problems.push(`expected one quoted prompt, got ${args.positionals.length} words (quote the prompt)`);
  const specPath = args.values.get("--spec");
  const renormalize = args.flags.has("--renormalize");
  const name = args.values.get("--name");
  const prompt = args.positionals[0];
  const image = args.values.get("--image");
  if (!specPath && !name) problems.push("--name <key> is required (it becomes assets.<key>)");
  if (!specPath && !renormalize && !prompt && !image) problems.push("give a prompt or --image ref.png");
  if (specPath && (prompt || name || image)) problems.push("--spec runs the spec's items; do not combine it with a prompt, --name or --image");
  const kind = args.values.get("--kind");
  if (kind !== undefined && !IDOL_KINDS.includes(kind as IdolKind)) problems.push(`--kind must be ${IDOL_KINDS.join("|")}`);
  const role = args.values.get("--role");
  if (role !== undefined && !IDOL_OPTIMIZE_ROLE[role]) problems.push(`--role must be one of ${IDOL_ROLES.join(", ")}`);
  const sizeRaw = args.values.get("--size");
  const size = sizeRaw === undefined ? undefined : parseSize(sizeRaw);
  if (sizeRaw !== undefined && !size) problems.push(`--size must be height=N, length=N, width=N or maxDim=N (got "${sizeRaw}")`);
  const front = args.values.get("--front")?.toLowerCase();
  if (front !== undefined && !["+x", "-x", "+z", "-z"].includes(front)) problems.push("--front must be +x, -x, +z or -z (the axis the model faces in the raw download)");
  const yawDeg = numberValue(args, "--yaw", problems);
  const maxVerts = numberValue(args, "--max-verts", problems, (v) => Number.isInteger(v) && v >= 100);
  const tex = numberValue(args, "--tex", problems, (v) => Number.isInteger(v) && v >= 16 && v <= 4096);
  const seed = numberValue(args, "--seed", problems, Number.isInteger);
  const concurrency = numberValue(args, "--concurrency", problems, (v) => Number.isInteger(v) && v >= 1 && v <= 32);
  const animations = listValue(args, "--animations");
  if (animations && !args.flags.has("--rig")) problems.push("--animations needs --rig");
  if (problems.length) return usageError(io, ASSETS_GENERATE_USAGE, problems);

  try {
    session = openSession(io, args, runtime);
    const s = session;
    const dryRun = args.flags.has("--dry-run");
    let spec: IdolSpec;
    if (specPath) {
      spec = readJsonFile<IdolSpec>(resolve(s.projectDir, specPath), "--spec");
      if (args.flags.has("--no-slim")) spec = { ...spec, items: spec.items.map((item) => ({ ...item, noSlim: true })) };
    } else {
      const outDir = args.values.get("--out-dir") ?? "assets/idol";
      const previous = renormalize ? previousIdolSettings(resolve(s.projectDir, outDir, `${name}.idol.json`)) : {};
      const item: IdolItem = {
        ...(previous as Partial<IdolItem>),
        key: name!,
        ...(prompt ? { subject: prompt } : {}),
        ...(image ? { image } : {}),
        ...(kind ? { kind: kind as IdolKind } : {}),
        ...(args.flags.has("--rig") ? { rig: true } : {}),
        ...(animations ? { animations } : {}),
        ...(role ? { role } : {}),
        ...(size ? { size } : {}),
        ...(front ? { front } : {}),
        ...(yawDeg !== undefined ? { yawDeg } : {}),
        ...(maxVerts !== undefined ? { maxVerts } : {}),
        ...(tex !== undefined ? { tex } : {}),
        ...(seed !== undefined ? { seed } : {}),
        ...(args.values.get("--style") ? { style: args.values.get("--style") } : {}),
        ...(args.flags.has("--no-simplify") ? { noSimplify: true } : {}),
        ...(args.flags.has("--no-slim") ? { noSlim: true } : {})
      };
      const previousGame = renormalize ? previousIdolGame(resolve(s.projectDir, outDir, `${name}.idol.json`)) : undefined;
      spec = { game: args.values.get("--game") ?? previousGame ?? slug(basename(s.projectDir)), outDir, items: [item] };
    }
    const paid = !dryRun && !renormalize;
    if (paid) bindKey(s);
    const only = listValue(args, "--only");
    const lines: IdolItemResult[] = [];
    const results = await runIdolSpec(spec, {
      projectDir: s.projectDir, workRoot: s.work, ledgerFile: s.ledgerFile, force: args.flags.has("--force"), dryRun, renormalize,
      admit: !args.flags.has("--no-admit"), generator: "aura3d assets generate", fal: s.fal,
      ...(args.values.get("--out-dir") ? { defaultOutDir: args.values.get("--out-dir") } : {}), ...(runtime.deps ? { deps: runtime.deps } : {})
    }, {
      ...(only ? { only } : {}), ...(concurrency ? { concurrency } : {}),
      onResult: (result) => {
        lines.push(result);
        if (!s.json) io.stdout(describeIdolResult(result));
      }
    });
    const failed = results.filter((r) => r.error || (r.admitted && !r.admitted.ok));
    const estUsd = results.reduce((sum, r) => sum + (r.estUsd ?? 0), 0);
    const usd = results.reduce((sum, r) => sum + (r.usd ?? 0), 0);
    const summary = {
      ok: failed.length === 0, command: "assets generate", provider: "idol", dryRun, renormalize,
      ...(dryRun ? { estUsd: Math.round(estUsd * 100) / 100, ...keyReport(s) } : { usd: Math.round(usd * 100) / 100 }),
      ledger: relative(s.projectDir, s.ledgerFile) || s.ledgerFile, results
    };
    if (s.json) io.stdout(JSON.stringify(summary, null, 2));
    else if (dryRun) {
      io.stdout(`dry run: est. ${money(estUsd)} for ${results.filter((r) => r.dryRun).length} item(s); no paid call made.`);
      const key = keyReport(s);
      io.stdout(key.keySource ? `fal key: found (${key.keySource}).` : String(key.keyHint));
    } else io.stdout(`done: ${results.length - failed.length}/${results.length} ok, ${money(usd)} this run (ledger ${summary.ledger}).`);
    return failed.length ? 1 : 0;
  } catch (error) {
    io.stderr(`assets generate failed: ${(error as Error).message ?? error}`);
    return 1;
  }
}

function previousIdolSettings(provFile: string): Record<string, unknown> {
  if (!existsSync(provFile)) return {};
  try {
    const prov = JSON.parse(readFileSync(provFile, "utf8")) as { settings?: Record<string, unknown>; role?: string; rig?: boolean };
    return { ...(prov.role ? { role: prov.role } : {}), ...(prov.rig ? { rig: true } : {}), ...(prov.settings ?? {}) };
  } catch {
    return {};
  }
}

function previousIdolGame(provFile: string): string | undefined {
  try {
    return (JSON.parse(readFileSync(provFile, "utf8")) as { game?: string }).game;
  } catch {
    return undefined;
  }
}

function describeIdolResult(r: IdolItemResult): string {
  if (r.error) return `${r.key}: FAILED ${r.error}`;
  if (r.skipped) return `${r.key}: exists at ${r.finalGlb} (use --force to regenerate, --renormalize to redo post-processing for $0)`;
  if (r.dryRun) return r.renormalized ? `${r.key}: would renormalise from the raw downloads ($0)` : `${r.key}: would generate${r.rig ? " (rigged)" : ""} as ${r.role}, est. ${money(r.estUsd ?? 0)}`;
  const parts = [`${r.key}: ${r.renormalized ? "renormalised" : "wrote"} ${r.finalGlb} (${r.sizeMB} MB${r.dims ? `, ${r.dims.join(" x ")} m` : ""}${r.skin ? `, skin ${r.skin}` : ""}, ${money(r.usd ?? 0)})`];
  if (r.slim) parts.push(r.slim.disabled ? "slim skipped (--no-slim)" : `slim re-encoded ${r.slim.reencoded} normal map(s)${r.slim.keptLossless.length ? `, kept ${r.slim.keptLossless.length} PNG (glossy)` : ""}`);
  if (r.preview) parts.push(`preview ${r.preview} (CPU base-colour)`);
  if (r.admitted) parts.push(r.admitted.ok ? `admitted as assets.${r.admitted.id} (${r.admitted.quality})` : `NOT admitted: ${r.admitted.messages.join(" ")}`);
  return parts.join("; ");
}

// ------------------------------------------------------------------------------------------- animation generate

const ANIMATION_VALUES = [...COMMON_VALUES, "--onto", "--out", "--name", "--duration", "--seed", "--guidance", "--window"];
const ANIMATION_BOOLEANS = [...COMMON_BOOLEANS, "--loop", "--keep-turn", "--fbx", "--keep-base-animations"];

export async function animationGenerateVerb(argv: readonly string[], rawIo: GenerateIo, runtime: GenerateRuntime = {}): Promise<number> {
  const env = runtime.env ?? process.env;
  let session: Session | undefined;
  const io = redactingIo(rawIo, () => [session?.key, env.FAL_KEY]);
  const args = parseArgs(argv, { values: ANIMATION_VALUES, booleans: ANIMATION_BOOLEANS });
  if (args.flags.has("--help") || args.flags.has("-h")) {
    io.stdout(ANIMATION_GENERATE_USAGE);
    return 0;
  }
  const problems = [...args.errors];
  const specPath = args.values.get("--spec");
  const prompt = args.positionals[0];
  if (args.positionals.length > 1) problems.push(`expected one quoted prompt, got ${args.positionals.length} words (quote the prompt)`);
  if (!specPath && !prompt) problems.push("give a prompt (what the body does) or --spec motion-spec.json");
  if (specPath && prompt) problems.push("--spec runs the spec's clips; do not combine it with a prompt");
  const duration = numberValue(args, "--duration", problems, (v) => v >= 0.5 && v <= 12);
  const seed = numberValue(args, "--seed", problems, Number.isInteger);
  const guidance = numberValue(args, "--guidance", problems, (v) => v >= 1 && v <= 10);
  const concurrency = numberValue(args, "--concurrency", problems, (v) => Number.isInteger(v) && v >= 1 && v <= 32);
  const windowRaw = args.values.get("--window");
  const window = windowRaw === undefined ? undefined : parseWindow(windowRaw);
  if (windowRaw !== undefined && !window) problems.push(`--window must be a,b seconds with a < b (got "${windowRaw}")`);
  const dryRun = args.flags.has("--dry-run");
  if (problems.length) return usageError(io, ANIMATION_GENERATE_USAGE, problems);

  try {
    session = openSession(io, args, runtime);
    const s = session;
    let spec: MotionSpec;
    if (specPath) spec = readJsonFile<MotionSpec>(resolve(s.projectDir, specPath), "--spec");
    else {
      const clip: MotionClipSpec = {
        key: args.values.get("--name") ?? "Clip", prompt: prompt!,
        ...(duration !== undefined ? { duration } : {}), ...(seed !== undefined ? { seed } : {}), ...(guidance !== undefined ? { guidance } : {}),
        ...(args.flags.has("--loop") ? { loop: true } : {}), ...(window ? { window } : {}), ...(args.flags.has("--keep-turn") ? { faceForward: false } : {})
      };
      spec = { game: args.values.get("--game") ?? slug(basename(s.projectDir)), clips: [clip] };
    }
    if (!spec || !Array.isArray(spec.clips)) throw new Error("--spec needs { \"game\": \"<slug>\", \"clips\": [ ... ] }.");
    for (const clip of spec.clips) validateMotionClip(clip);
    const onto = args.values.get("--onto") ?? spec.onto;
    const out = args.values.get("--out") ?? spec.outGlb;
    if (!dryRun && (!onto || !out)) return usageError(io, ANIMATION_GENERATE_USAGE, ["--onto rigged.glb and --out hero.glb are required (the clips are retargeted onto that rig)"]);
    if (onto && !existsSync(resolve(s.projectDir, onto))) throw new Error(`--onto ${onto} does not exist (pass the rigged GLB the clips should play on).`);
    if (onto && out && resolve(s.projectDir, onto) === resolve(s.projectDir, out) && !args.flags.has("--force")) {
      throw new Error("--out is the same file as --onto: write to a new file, or pass --force to replace the rig in place.");
    }
    if (!dryRun) bindKey(s);
    const only = listValue(args, "--only");
    const ctx = { projectDir: s.projectDir, workRoot: s.work, ledgerFile: s.ledgerFile, force: args.flags.has("--force"), dryRun, fbx: args.flags.has("--fbx"), generator: "aura3d animation generate", fal: s.fal };
    const results = await runMotionSpec(spec, ctx, {
      ...(only ? { only } : {}), ...(concurrency ? { concurrency } : {}),
      onResult: (r) => {
        if (s.json) return;
        if (r.error) io.stdout(`${r.key}: FAILED ${r.error}`);
        else if (r.dryRun) io.stdout(`${r.key}: would generate ${r.input?.duration}s, est. ${money(r.estUsd ?? 0)}`);
        else io.stdout(`${r.key}: ${r.cached ? "reused" : "generated"} ${r.dict} (${money(r.usd ?? 0)})`);
      }
    });
    const failed = results.filter((r) => r.error);
    if (dryRun) {
      const estUsd = Math.round(results.reduce((sum, r) => sum + (r.estUsd ?? 0), 0) * 100) / 100;
      const report = { ok: true, command: "animation generate", dryRun: true, estUsd, ...keyReport(s), clips: results, ...(onto ? { onto } : {}), ...(out ? { out } : {}) };
      if (s.json) io.stdout(JSON.stringify(report, null, 2));
      else {
        io.stdout(`dry run: est. ${money(estUsd)} for ${results.length} clip(s); no paid call made.`);
        io.stdout(report.keySource ? `fal key: found (${report.keySource}).` : String(report.keyHint));
      }
      return 0;
    }
    // Retarget every spec clip that has a motion.json (not just --only), so --out is complete.
    const available = spec.clips.filter((clip) => existsSync(motionDictPath(ctx, spec.game, clip.key)));
    const missing = spec.clips.filter((clip) => !available.includes(clip)).map((clip) => clip.key);
    let imported: RetargetResult | undefined;
    let importError: string | undefined;
    if (available.length) {
      try {
        imported = await retargetClips(resolveGenerateDeps(runtime.deps), {
          projectDir: s.projectDir, onto: onto!, out: out!, keepBaseAnimations: args.flags.has("--keep-base-animations"),
          clips: available.map((clip) => ({ clip, file: motionDictPath(ctx, spec.game, clip.key) }))
        });
        if (!imported.ok) {
          const failures = (imported.failures ?? []).join("; ") || "failure";
          importError = /skin/i.test(failures)
            ? `${out} was written, but its skin check fails: ${failures} This is a mesh/rig defect of ${onto}, not of the motion: repair it with \`aura3d assets repair-skin\`, or record the known defect with a reason in aura.skin-allow.json.`
            : `retarget onto ${onto} reported: ${failures}`;
        }
      } catch (error) {
        importError = `retarget onto ${onto} failed: ${(error as Error).message}. The motion.json files are kept; rerun (no fal cost) after fixing the rig, or use \`aura3d animation import\` directly.`;
      }
    }
    const usd = Math.round(results.reduce((sum, r) => sum + (r.usd ?? 0), 0) * 100) / 100;
    const ok = failed.length === 0 && !importError && Boolean(imported);
    const report = {
      ok, command: "animation generate", usd, ledger: relative(s.projectDir, s.ledgerFile) || s.ledgerFile, clips: results as MotionClipResult[],
      ...(imported ? { output: imported.output, imported: imported.clips, ...(imported.skin !== undefined ? { skin: imported.skin } : {}), ...(imported.warnings?.length ? { warnings: imported.warnings } : {}) } : {}),
      ...(missing.length ? { missing } : {}), ...(importError ? { importError } : {})
    };
    if (s.json) io.stdout(JSON.stringify(report, null, 2));
    else {
      if (imported) io.stdout(`wrote ${imported.output}: ${imported.clips.map((clip) => `${clip.name} ${clip.duration.toFixed(2)}s/${clip.channels}ch`).join(", ")}`);
      if (missing.length) io.stdout(`not retargeted (no motion.json yet): ${missing.join(", ")}`);
      if (importError) io.stderr(importError);
      io.stdout(`done: ${results.length - failed.length}/${results.length} clip(s) ok, ${money(usd)} this run (ledger ${report.ledger}).`);
    }
    return ok ? 0 : 1;
  } catch (error) {
    io.stderr(`animation generate failed: ${(error as Error).message ?? error}`);
    return 1;
  }
}

/**
 * importClipsOntoRig takes loop/window/faceForward per call, so clips are grouped by those settings: the first group
 * goes onto the rig, later groups onto the growing output (keeping the clips already written).
 */
export async function retargetClips(
  deps: Pick<GenerateDeps, "importClipsOntoRig">,
  opts: { projectDir: string; onto: string; out: string; keepBaseAnimations: boolean; clips: readonly { clip: MotionClipSpec; file: string }[] }
): Promise<RetargetResult> {
  const groups = new Map<string, { clip: MotionClipSpec; file: string }[]>();
  for (const entry of opts.clips) {
    const key = JSON.stringify([entry.clip.loop ?? false, entry.clip.window ?? null, entry.clip.faceForward ?? true]);
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }
  const clips: RetargetResult["clips"][number][] = [];
  const failures: string[] = [];
  const warnings: string[] = [];
  let last: RetargetResult | undefined;
  let first = true;
  for (const entries of groups.values()) {
    const { loop, window, faceForward } = entries[0]!.clip;
    last = await deps.importClipsOntoRig({
      projectDir: opts.projectDir,
      onto: first ? opts.onto : opts.out,
      output: opts.out,
      clips: entries.map((entry) => ({ name: entry.clip.key, file: entry.file })),
      ...(loop ? { loop: true } : {}),
      ...(window ? { window: [window[0], window[1]] as const } : {}),
      ...(faceForward === false ? { faceForward: false } : {}),
      keepBaseAnimations: first ? opts.keepBaseAnimations : true
    });
    first = false;
    clips.push(...last.clips.map((clip) => ({ name: clip.name, duration: clip.duration, channels: clip.channels })));
    failures.push(...(last.failures ?? []));
    warnings.push(...(last.warnings ?? []));
    if (!last.ok) break;
  }
  return { ok: Boolean(last?.ok) && failures.length === 0, output: last?.output ?? opts.out, clips, failures, warnings, ...(last?.skin !== undefined ? { skin: last.skin } : {}) };
}
