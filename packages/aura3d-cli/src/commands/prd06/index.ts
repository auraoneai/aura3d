/**
 * C-39 lane command registrations — prd06 registers its `aura3d` commands
 * here via registerCliCommand (CONTRACTS.md).
 */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { registerCliCommand, registerCodemod, type AuraCodemod } from "../../contracts/commands.js";
import { inspectAnimationClips, readGlbDocument } from "./inspectAnimationClips.js";
import { validateHeroGlb } from "./validateHero.js";
import { parseAnimationClipMap } from "../../animation-asset-validator.js";
import type { AnimationAssetHeroProfile } from "../../animation-asset-validator.js";

/**
 * T0.7 — `aura3d animation inspect-clips <model.glb>` prints the resolved
 * `{ name, duration, channelCount, hasRootMotionCandidate, frameRate? }[]`
 * an agent feeds to `model({ animationClips })` / `animation.resolveAnimationClips`.
 */
registerCliCommand({
  name: "animation inspect-clips",
  owner: "prd06",
  summary: "Print resolved GLB animation clip infos (duration, channels, root-motion) as JSON.",
  usage: "aura3d animation inspect-clips <model.glb>",
  run: async (argv, io) => {
    const file = argv.find((arg) => !arg.startsWith("--"));
    if (!file) {
      io.stderr("Usage: aura3d animation inspect-clips <model.glb>");
      return 1;
    }
    const { json, bin } = readGlbDocument(new Uint8Array(readFileSync(file)));
    io.stdout(JSON.stringify(inspectAnimationClips(json, bin), null, 2));
    return 0;
  }
});

/**
 * T4.6 — `aura3d animation validate-hero <model.glb> [--profile
 * hero-character|template-hero] [--map action=clip,...]` runs the §6.9 hero
 * bar: geometry (triangles/skins/joints), texture, and the profile's required
 * clip set with durations. Prints the report as JSON; exit 1 on any failure.
 */
registerCliCommand({
  name: "animation validate-hero",
  owner: "prd06",
  summary: "Validate a character GLB against the hero-character / template-hero bar (§6.9).",
  usage: "aura3d animation validate-hero <model.glb> [--profile hero-character|template-hero] [--map idle=Idle,run=Run]",
  run: async (argv, io) => {
    const file = argv.find((arg) => !arg.startsWith("--"));
    if (!file) {
      io.stderr("Usage: aura3d animation validate-hero <model.glb> [--profile hero-character|template-hero] [--map action=clip,...]");
      return 1;
    }
    const profileArg = argv.find((arg) => arg.startsWith("--profile="))?.slice("--profile=".length)
      ?? (argv.includes("--profile") ? argv[argv.indexOf("--profile") + 1] : undefined);
    const profile: AnimationAssetHeroProfile = profileArg === "template-hero" ? "template-hero" : "hero-character";
    const mapArg = argv.find((arg) => arg.startsWith("--map="))?.slice("--map=".length)
      ?? (argv.includes("--map") ? argv[argv.indexOf("--map") + 1] : undefined);
    const clipMap = mapArg !== undefined ? parseAnimationClipMap(mapArg) : undefined;
    const report = validateHeroGlb(new Uint8Array(readFileSync(file)), {
      profile,
      ...(clipMap !== undefined ? { clipMap } : {})
    });
    io.stdout(JSON.stringify({ profile, ok: report.ok, reasonCodes: report.reasonCodes, failures: report.failures, messages: report.messages }, null, 2));
    return report.ok ? 0 : 1;
  }
});

/**
 * T1.13 — C-39 codemod `animation-3.1`. Implementation lives in
 * tools/codemods/animation-3.1.mjs; resolved lazily so the packaged CLI (which
 * does not ship `tools/`) does not crash at startup — same pattern as prd04's
 * pin-emissive-defaults.
 */
type CodemodTransform = AuraCodemod["transform"];

const requireFromHere = createRequire(import.meta.url);
let codemodImpl: CodemodTransform | undefined;

function loadCodemodTransform(): CodemodTransform {
  if (codemodImpl === undefined) {
    try {
      codemodImpl = (requireFromHere("../../../../../tools/codemods/animation-3.1.mjs") as { transform: CodemodTransform }).transform;
    } catch (error) {
      throw new Error(
        "aura3d codemod animation-3.1: implementation module " +
        `tools/codemods/animation-3.1.mjs is not reachable (${(error as Error).message}). ` +
        "This codemod is only available from the monorepo source tree."
      );
    }
  }
  return codemodImpl;
}

registerCodemod({
  name: "animation-3.1",
  owner: "prd06",
  description:
    "3.0 → 3.1 animation API drift: non-exact clip names at .animate/.play/resolveGLTFClipName call sites " +
    "(vs the app's aura-assets clip universe), every `speed:` property (now applied), and " +
    "bindRuntimeNode({applyPose}) bindings.",
  transform: (source, fileName) => loadCodemodTransform()(source, fileName)
});
