/**
 * 5.6.0 command group `generate` (artifacts/cli-gaps/REPORT.md A2 + A3): paid fal.ai generation.
 *   aura3d assets generate "<prompt>"|--image ref.png --provider idol --name key   (speridlabs/idol/max)
 *   aura3d animation generate "<prompt>" --onto rigged.glb --out hero.glb          (fal-ai/hunyuan-motion → animation import)
 * Shared signature for other packages: falQueueRun(model, input, { pendingFile?, ledger? }).
 */

import { registerCliCommand } from "../../contracts/commands.js";
import { ANIMATION_GENERATE_USAGE, ASSETS_GENERATE_USAGE, animationGenerateVerb, assetsGenerateVerb } from "./commands.js";

registerCliCommand({
  name: "assets generate",
  owner: "generate",
  summary: "Generate a game-ready GLB on fal.ai (Idol: prompt or reference image, optional rig + clips), post-process and admit it as a candidate.",
  usage: ASSETS_GENERATE_USAGE,
  run: (argv, io) => assetsGenerateVerb(argv, io)
});

registerCliCommand({
  name: "animation generate",
  owner: "generate",
  summary: "Generate motion-captured-quality clips from text on fal.ai (HY-Motion) and retarget them onto a rigged GLB.",
  usage: ANIMATION_GENERATE_USAGE,
  run: (argv, io) => animationGenerateVerb(argv, io)
});

export { appendFalLedger, falDownload, falQueueRun, FAL_QUEUE_BASE, FAL_TIMEOUT_MS, hashFalInput } from "./falClient.js";
export type { FalLedgerTarget, FalQueueOptions, FalQueueResult, FalTransportOptions } from "./falClient.js";
export { describeFalKeySource, FalKeyMissingError, loadFalKey, parseFalEnv, redactSecret } from "./falKey.js";
export type { FalKey, FalKeySource, LoadFalKeyOptions } from "./falKey.js";
export {
  admitIdolAsset, buildIdolPrompt, estimateIdolUsd, idolAdmitRole, idolRole, IDOL_IMAGE_MODEL, IDOL_LICENSE, IDOL_MODEL, IDOL_OPTIMIZE_ROLE,
  IDOL_PRICE, IDOL_ROLE_BUDGET, IDOL_ROLES, runIdolItem, runIdolSpec
} from "./idol.js";
export type { IdolItem, IdolItemResult, IdolKind, IdolRunContext, IdolSpec } from "./idol.js";
export { estimateMotionUsd, generateMotionClip, MOTION_MODEL, MOTION_PRICE, motionDictPath, motionWorkDir, runMotionSpec, validateMotionClip } from "./motion.js";
export type { MotionClipResult, MotionClipSpec, MotionRunContext, MotionSpec } from "./motion.js";
export { resolveGenerateDeps } from "./deps.js";
export type { GenerateDeps, RetargetResult } from "./deps.js";
export { ANIMATION_GENERATE_USAGE, ASSETS_GENERATE_USAGE, animationGenerateVerb, assetsGenerateVerb, retargetClips } from "./commands.js";
export type { GenerateIo, GenerateRuntime } from "./commands.js";
