/**
 * C-39 lane command registrations — prd06 registers its `aura3d` commands
 * here via registerCliCommand (CONTRACTS.md).
 */

import { readFileSync } from "node:fs";
import { registerCliCommand } from "../../contracts/commands.js";
import { inspectAnimationClips, readGlbDocument } from "./inspectAnimationClips.js";

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
