#!/usr/bin/env node
// Idol motion lane: text -> motion-captured-quality clips for Idol characters, through fal.ai `fal-ai/hunyuan-motion`.
//
//   node tools/idol/motion.mjs --spec tools/idol/motion-specs/<game>.json [--only a,b] [--force] [--fbx] [--concurrency 8]
//                              [--dry-run] [--convert-only]
//
// Spec:
//   { "game": "<slug>", "out": "apps/<app>/src/<dir>/motion.generated.ts",
//     "clips": [ { "key": "Run", "prompt": "<what the body does, no names/brands>", "duration": 2.0, "loop": true,
//                  "seed": 7, "guidance": 5, "window": [0.2, 1.9], "faceForward": true } ] }
//   duration 0.5-12 s (fal limit), guidance_scale 1-10 (default 5). `window` trims seconds before conversion; loops get
//   their last 0.2 s cross-faded into the start; `faceForward: false` keeps a clip's own turn (spins, pivots).
//
// The fal half is a thin wrapper over the CLI's `aura3d animation generate` engine (packages/aura3d-cli/src/commands/
// generate/motion.ts); the TypeScript-module conversion below stays here because it targets the showcase runtime.
// Per clip: fal request (resume-safe: the request id is saved to artifacts/idol/motion/<game>/<key>/pending-dict.json before
// polling and every submit is ledgered to artifacts/idol/ledger.jsonl, $0.08 each; rerunning the same command resumes
// a queued request instead of paying again) -> motion.json (HY-Motion dict: SMPL 22-joint local rot6d, transl,
// keypoints3d, 30 fps) [+ motion.fbx with --fbx, a second $0.08 request] under artifacts/idol/motion/<game>/<key>/ ->
// apps/showcase-port-shared/idol/smplMotion.ts converts it to the canonical humanoid frame (root motion off, hip bob kept,
// timing facts in clip.meta) -> one TypeScript module `out` exporting `MOTION_CLIPS` for the game.
// Play them with apps/showcase-port-shared/idol/motion.ts (createMotionAnimator, cross-fades, distance / event sync) and
// drive any Idol GLB through humanoid.ts (`driver.pose(...)` -> `handle.setAnimationPose`).
// FAL_KEY: environment, ~/.config/aura3d/fal.env or ~/.config/auraone/fal.env (never printed).
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { registerHooks } from "node:module";
import { loadGenerateImpl, root } from "./cli-impl.mjs";

// The shared converter is TypeScript with extensionless relative imports (bundler style): resolve them to .ts.
registerHooks({ resolve(spec, ctx, next) {
  try { return next(spec, ctx); } catch (e) { if (spec.startsWith(".") && !/\.[cm]?[jt]s$/.test(spec)) return next(`${spec}.ts`, ctx); throw e; }
} });

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : d; };
const flag = (n) => args.includes(`--${n}`);

async function main() {
  const specPath = opt("spec");
  if (!specPath) { console.error("usage: motion.mjs --spec tools/idol/motion-specs/<game>.json [--only a,b] [--force] [--fbx] [--dry-run] [--convert-only]"); process.exit(2); }
  const spec = JSON.parse(readFileSync(resolve(root, specPath), "utf8"));
  const only = opt("only", "").split(",").filter(Boolean);
  const ctx = { force: flag("force"), fbx: flag("fbx"), dryRun: flag("dry-run") };
  const results = [];
  if (!flag("convert-only")) {
    // Fal generation (resume-safe pending files, ledger at submit time) is the CLI's `animation generate` engine.
    const impl = await loadGenerateImpl();
    results.push(...await impl.runMotionSpec(spec, {
      projectDir: root, workRoot: "artifacts/idol", ledgerFile: join(root, "artifacts/idol/ledger.jsonl"),
      force: ctx.force, fbx: ctx.fbx, dryRun: ctx.dryRun, generator: "tools/idol/motion.mjs (aura3d animation generate)"
    }, { only, concurrency: Number(opt("concurrency", "8")), onResult: (r) => console.log(JSON.stringify(r)) }));
  }
  if (ctx.dryRun) { console.log(`dry run: est. $${results.reduce((s, r) => s + (r.estUsd ?? 0), 0).toFixed(2)}`); return; }
  // Convert every clip of the spec that has a dict (all of them, not just --only, so `out` is complete).
  const { smplMotionToClip } = await import(join(root, "apps/showcase-port-shared/idol/smplMotion.ts"));
  const clips = {};
  const missing = [];
  for (const c of spec.clips) {
    const dictFile = join(root, "artifacts/idol/motion", spec.game, c.key, "motion.json");
    if (!existsSync(dictFile)) { missing.push(c.key); continue; }
    const { clip } = smplMotionToClip(c.key, JSON.parse(readFileSync(dictFile, "utf8")), { loop: Boolean(c.loop), window: c.window, faceForward: c.faceForward });
    clips[c.key] = clip;
  }
  const names = Object.keys(clips);
  if (spec.out && names.length) {
    const outFile = resolve(root, spec.out);
    mkdirSync(dirname(outFile), { recursive: true });
    const sharedRel = relative(dirname(outFile), join(root, "apps/showcase-port-shared/idol/humanoid")).split("\\").join("/");
    writeFileSync(outFile, `// Generated by tools/idol/motion.mjs from ${specPath} — do not edit.
// Text-to-motion clips (fal.ai fal-ai/hunyuan-motion, SMPL 22 joints, 30 fps) retargeted to the canonical humanoid frame
// (apps/showcase-port-shared/idol/smplMotion.ts). Root motion removed, hip bob kept. Provenance: artifacts/idol/motion/${spec.game}/<key>/.
import type { HumanoidClip } from "${sharedRel.startsWith(".") ? sharedRel : `./${sharedRel}`}";

export type MotionClipName = ${names.map((n) => JSON.stringify(n)).join(" | ")};

export const MOTION_CLIPS: Readonly<Record<MotionClipName, HumanoidClip>> = ${JSON.stringify(clips, null, 1)};
`);
    console.log(`wrote ${relative(root, outFile)} (${names.length} clips${missing.length ? `; missing: ${missing.join(", ")}` : ""})`);
  }
  const failed = results.filter((r) => r.error);
  if (failed.length) process.exit(1);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
