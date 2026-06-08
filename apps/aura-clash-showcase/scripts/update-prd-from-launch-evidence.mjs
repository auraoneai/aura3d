#!/usr/bin/env node
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(__dirname, "..");
const repoRoot = resolve(appRoot, "../..");
const prdPath = resolve(repoRoot, "docs/project/aura-clash-showcase.md");

const localGatesPath = resolve(
  appRoot,
  process.env.AURA_CLASH_LOCAL_GATES_OUT ?? "launch-evidence/local-gates.json"
);
const screenshotMetaPath = resolve(
  appRoot,
  process.env.AURA_CLASH_SCREENSHOT_META_OUT ?? "launch-evidence/first-frame.json"
);
const deployedRoutesPath = resolve(
  appRoot,
  process.env.AURA_CLASH_LAUNCH_EVIDENCE_OUT ?? "launch-evidence/deployed-routes.json"
);
const vercelDeployPath = resolve(
  appRoot,
  process.env.AURA_CLASH_VERCEL_DEPLOY_OUT ?? "launch-evidence/vercel-deploy.json"
);
const launchAssetEvidencePath = resolve(
  appRoot,
  process.env.AURA_CLASH_LAUNCH_ASSET_EVIDENCE ?? "assets/source/aura-clash-launch-asset-evidence.json"
);
const visualApprovalEvidencePath = resolve(
  appRoot,
  process.env.AURA_CLASH_USER_VISUAL_APPROVAL_OUT ?? "launch-evidence/visual-approval.json"
);
const crossRuntimeEvidencePath = resolve(
  appRoot,
  process.env.AURA_CLASH_CROSS_RUNTIME_EVIDENCE_OUT ?? "launch-evidence/cross-runtime-evidence.json"
);
const prdEvidenceCoveragePath = resolve(
  appRoot,
  process.env.AURA_CLASH_PRD_EVIDENCE_COVERAGE_OUT ?? "launch-evidence/prd-evidence-coverage.json"
);

const dryRun = process.env.AURA_CLASH_PRD_UPDATE_DRY_RUN === "1";
const prd = readFileSync(prdPath, "utf8");
let next = prd;
const changes = [];

const localGates = readJsonIfPresent(localGatesPath);
const screenshotMeta = readJsonIfPresent(screenshotMetaPath);
const deployedRoutes = readJsonIfPresent(deployedRoutesPath);
const vercelDeploy = readJsonIfPresent(vercelDeployPath);
const launchAssetEvidence = readJsonIfPresent(launchAssetEvidencePath);
const visualApprovalEvidence = readJsonIfPresent(visualApprovalEvidencePath);
const crossRuntimeEvidence = readJsonIfPresent(crossRuntimeEvidencePath);
const prdEvidenceCoverage = readJsonIfPresent(prdEvidenceCoveragePath);
const reviewPackagePath = resolve(
  appRoot,
  process.env.AURA_CLASH_REVIEW_PACKAGE_OUT ?? "launch-evidence/review-package.md"
);
const reviewPackageExists = existsSync(reviewPackagePath);
const prdEvidenceCoverageOk =
  prdEvidenceCoverage?.ok === true &&
  Number(prdEvidenceCoverage?.uncoveredUnchecked ?? 1) === 0;
const requirePrdEvidenceCoverage =
  process.env.AURA_CLASH_REQUIRE_PRD_EVIDENCE_COVERAGE === "1" || !dryRun;

if (requirePrdEvidenceCoverage && !prdEvidenceCoverageOk) {
  throw new Error(
    `Refusing to update docs/project/aura-clash-showcase.md without passing PRD evidence coverage: ${prdEvidenceCoveragePath}`
  );
}

const localGatesOk = localGates?.ok === true;
const deployedRoutesOk = deployedRoutes?.ok === true;
const vercelDeployOk = vercelDeploy?.ok === true;
const deployFlag = process.env.AURA_CLASH_DEPLOYED_TO_VERCEL === "1";
const deploymentOk = vercelDeployOk;
const userVisualApprovalFlag = process.env.AURA_CLASH_USER_VISUAL_APPROVED === "1";
const screenshotPath =
  typeof screenshotMeta?.screenshot === "string"
    ? resolve(appRoot, screenshotMeta.screenshot)
    : resolve(appRoot, "launch-evidence/first-frame.png");
const screenshotFileExists = existsSync(screenshotPath);
const screenshotOk = screenshotMeta?.ok === true && screenshotFileExists;
const screenshotArtifactOk = screenshotOk && hasScreenshotArtifactEvidence();
const reviewPackageReady = reviewPackageExists && screenshotOk;
const sourceAssetEvidenceOk = launchAssetEvidenceOk();
const validateGameOk = validateGameGateOk();
const userVisualApprovalEvidenceOk = visualApprovalEvidenceOk();
const browserSmokeOk =
  localGateOk("playable-smoke") &&
  localGateOk("screenshot-smoke") &&
  localGateOk("route-health") &&
  localGateOk("deploy-check");
const coreLaunchEvidenceOk =
  localGatesOk &&
  screenshotOk &&
  deployedRoutesOk &&
  deploymentOk &&
  reviewPackageExists &&
  sourceAssetEvidenceOk;
const visualApprovalOk = reviewPackageReady && userVisualApprovalEvidenceOk;
const fullyApprovedLaunchEvidenceOk = coreLaunchEvidenceOk && visualApprovalOk;
const crossRuntimeGates = crossRuntimeEvidence?.gates ?? {};
const aura3dValidationSuiteOk = crossRuntimeGates.aura3dValidationSuiteOk === true;
const aura3dTypecheckOk = crossRuntimeGates.aura3dTypecheckOk === true;
const aura3dBuildOk = crossRuntimeGates.aura3dBuildOk === true;
const aura3dDistTypesOk = crossRuntimeGates.aura3dDistTypesOk === true;
const gameRuntimeUnitOk = crossRuntimeGates.gameRuntimeUnitOk === true;
const gameRuntimeBrowserOk = crossRuntimeGates.gameRuntimeBrowserOk === true;
const gameRuntimeTemplateOk = crossRuntimeGates.gameRuntimeTemplateOk === true;
const gameRuntimeDocsOk = crossRuntimeGates.gameRuntimeDocsOk === true;
const aura3dPackageSmokeOk = crossRuntimeGates.aura3dPackageSmokeOk === true;
const gameRuntimeReleaseOk = crossRuntimeGates.gameRuntimeReleaseOk === true;
const auraVoiceContractOk = crossRuntimeGates.auraVoiceContractOk === true;
const animationAssetValidationOk = crossRuntimeGates.animationAssetValidationOk === true;
const promptAnimationUnitOk = crossRuntimeGates.promptAnimationUnitOk === true;
const promptAnimationBrowserOk = crossRuntimeGates.promptAnimationBrowserOk === true;
const promptAnimationTemplateOk = crossRuntimeGates.promptAnimationTemplateOk === true;
const promptAnimationDocsOk = crossRuntimeGates.promptAnimationDocsOk === true;
const promptAnimationPackageOk = crossRuntimeGates.promptAnimationPackageOk === true;
const promptAnimationReleaseOk = crossRuntimeGates.promptAnimationReleaseOk === true;
const auraVoiceSampleRenderOk = crossRuntimeGates.auraVoiceSampleRenderOk === true;
const auraVoiceSamplePackageOk = crossRuntimeGates.auraVoiceSamplePackageOk === true;
const storyboardGalleryOk = crossRuntimeGates.storyboardGalleryOk === true;
const oneFrameSyncOk = crossRuntimeGates.oneFrameSyncOk === true;
const dubSyncOk = crossRuntimeGates.dubSyncOk === true;
const crossRuntimeFinalOk = crossRuntimeGates.finalLaunchOk === true;

if (localGatesOk) {
  mark("Build app and marketing site.", "local launch gates passed");
  mark("Gameplay smoke passes.", "local browser smoke gates passed");
  mark(
    "Gameplay smoke passes. Source strengthened in `apps/aura-clash-showcase/tests/playable-smoke.spec.ts` for runtime responsiveness and no-scene-reconstruction hooks, but no pass is claimed until executed evidence exists.",
    "local browser smoke gates passed"
  );
  mark(
    "`apps/aura-clash-showcase/launch-evidence/local-gates.json` reports `ok: true`.",
    "local launch gates evidence reports success"
  );
}

if (localGateOk("assets-check")) {
  mark(
    "`apps/aura-clash-showcase` asset gate output: `npm run assets:check` must pass and confirm only manifest-referenced GLBs are shipped.",
    "assets-check command passed in local gates evidence"
  );
}

if (localGateOk("routes-check")) {
  mark(
    "`apps/aura-clash-showcase` route metadata output: `npm run routes:check` must pass and confirm canonical, Open Graph, Twitter, sitemap, and final `/showcase/aura-clash/` routes.",
    "routes-check command passed in local gates evidence"
  );
}

if (localGateOk("aura-clash-build")) {
  mark(
    "Aura Clash production build output: `npm run build` must complete successfully from `apps/aura-clash-showcase`.",
    "Aura Clash app build passed in local gates evidence"
  );
}

if (localGateOk("marketing-build")) {
  mark(
    "Marketing production build output: `npm run build` must complete successfully from `marketing`.",
    "marketing build passed in local gates evidence"
  );
}

if (browserSmokeOk) {
  mark(
    "Aura Clash browser smoke evidence: playable, route-health, deploy-check, and screenshot specs must pass against the built app.",
    "browser smoke gates passed in local gates evidence"
  );
}

if (screenshotOk) {
  mark(
    "`apps/aura-clash-showcase/launch-evidence/first-frame.json` reports `ok: true`.",
    "first-frame screenshot metadata reports success"
  );
}

if (screenshotArtifactOk) {
  mark(
    "First-frame screenshot artifact: screenshot capture must produce a nonblank image showing the current Aura Clash route.",
    "first-frame metadata reports success"
  );
}

if (reviewPackageReady) {
  mark(
    "Capture and review first-frame screenshot.",
    "first-frame screenshot metadata exists and launch review package is generated"
  );
}

if (deployedRoutesOk) {
  mark("Confirm deployed route and GLB URLs return 200.", "deployed route evidence reports success");
  mark("Deployed route confirmed.", "deployed route evidence reports success");
  mark(
    "Deployed route proof: `/showcase/aura-clash/`, `/showcase/aura-clash/playable/`, `/showcase/aura-clash/evidence/`, `/showcase/aura-clash/accessibility/`, `/showcase/aura-clash/deploy-check/`, and `/showcase/aura-clash/poster/` must return successful responses.",
    "deployed route evidence reports success"
  );
  mark(
    "Deployed GLB proof: every manifest-referenced GLB under `/showcase/aura-clash/aura-assets/` or `/apps/aura-clash-showcase/aura-assets/` must return a successful response with a nonzero content length.",
    "deployed GLB evidence reports success"
  );
  mark(
    "`apps/aura-clash-showcase/launch-evidence/deployed-routes.json` reports `ok: true`.",
    "deployed route evidence reports success"
  );
}

if (deploymentOk) {
  mark(
    "Deploy to Vercel.",
    "vercel deploy evidence reports success"
  );
  mark(
    "Vercel production deployment evidence: deployment command must finish and return the production URL.",
    "vercel deploy evidence reports success"
  );
}

if (vercelDeployOk) {
  mark(
    "`apps/aura-clash-showcase/launch-evidence/vercel-deploy.json` reports `ok: true`.",
    "vercel deploy evidence reports success"
  );
}

if (reviewPackageExists) {
  mark(
    "`apps/aura-clash-showcase/launch-evidence/review-package.md` exists.",
    "launch review package exists"
  );
}

if (sourceAssetEvidenceOk) {
  mark(
    "Each playable fighter has a clean typed GLB with no primitive fighter fallback in the launch route.",
    "launch asset evidence documents typed GLB delivery, provenance, material, bounds, thumbnails, and no primitive fighter fallback"
  );
  mark(
    "Every launch GLB has provenance, license note, thumbnail, bounds, material summary, and intended route usage.",
    "launch asset evidence documents required GLB source-quality fields"
  );
}

if (validateGameOk) {
  mark(
    "Run `aura3d assets validate-game` against AuraClash production assets.",
    "validate-game result passed in local gates evidence"
  );
}

if (sourceAssetEvidenceOk && visualApprovalOk) {
  mark(
    "Quaternius-derived fighter visual validation proof remains pending until `apps/aura-clash-showcase/launch-evidence/first-frame.json`, `apps/aura-clash-showcase/launch-evidence/first-frame.png`, `apps/aura-clash-showcase/launch-evidence/review-package.md`, `apps/aura-clash-showcase/launch-evidence/visual-approval.json`, and `apps/aura-clash-showcase/assets/source/aura-clash-launch-asset-evidence.json` prove the fighters are visible, grounded, correctly oriented, readable, and free of detached hair/clothes/accessories in runtime/browser screenshots.",
    "typed GLB source evidence exists and explicit visual approval references the reviewed runtime screenshot"
  );
  mark(
    "Source manifests and typed asset declarations do not complete visual screenshot approval, deployed GLB reachability, or human visual quality approval; completion requires `first-frame.json`, `first-frame.png`, `review-package.md`, `deployed-routes.json`, and `visual-approval.json` with `ok: true`.",
    "separate screenshot approval, deployed GLB reachability, and human visual approval evidence are present"
  );
  mark(
    "Quaternius-derived fighter runtime visual validation remains pending until `apps/aura-clash-showcase/launch-evidence/first-frame.json`, `apps/aura-clash-showcase/launch-evidence/first-frame.png`, `apps/aura-clash-showcase/launch-evidence/review-package.md`, `apps/aura-clash-showcase/launch-evidence/visual-approval.json`, and `apps/aura-clash-showcase/assets/source/aura-clash-launch-asset-evidence.json` prove scale, pivot, facing, bounds, material readability, and attachment stability in browser/runtime context.",
    "typed GLB source evidence exists and explicit visual approval references the reviewed runtime screenshot"
  );
}

if (visualApprovalOk) {
  mark(
    "`apps/aura-clash-showcase/launch-evidence/first-frame.png` exists and is visually reviewed.",
    "first-frame screenshot metadata, review package, and explicit user visual approval evidence are present"
  );
  mark("Visual screenshot approved by user.", "explicit visual approval evidence references the reviewed screenshot and review package");
  mark(
    "User visual approval: the screenshot must be explicitly approved by the user before the `Visual screenshot approved by user` checkbox is marked complete.",
    "explicit visual approval evidence references the reviewed screenshot and review package"
  );
  mark(
    "User explicitly approves the visual screenshot.",
    "explicit visual approval evidence references the reviewed screenshot and review package"
  );
  mark(
    "AuraClash screenshot package is explicitly approved by the user.",
    "explicit visual approval evidence references the reviewed screenshot and review package"
  );
  mark(
    "Capture and approve an AuraClash screenshot after the runtime route fixes.",
    "explicit visual approval evidence references the reviewed screenshot and review package"
  );
  mark(
    "Visual identity is memorable enough for marketing screenshots.",
    "explicit visual approval evidence references the reviewed screenshot and review package"
  );
  mark(
    "Lighting provides readable silhouettes and premium screenshot contrast.",
    "explicit visual approval evidence references the reviewed screenshot and review package"
  );
  mark(
    "Lighting provides readable silhouettes and premium screenshot contrast; source review criteria now live in `apps/aura-clash-showcase/src/rendering/GameLighting.ts`, but screenshot evidence and human review remain pending.",
    "explicit visual approval evidence references the reviewed screenshot and review package"
  );
  mark(
    "Visual identity is memorable enough for marketing screenshots.",
    "explicit visual approval evidence references the reviewed screenshot and review package"
  );
  mark(
    "Human visual approval remains unchecked even if nonblank/composition machine evidence passes.",
    "durable visual-approval evidence is present"
  );
}

if (browserSmokeOk && visualApprovalOk) {
  mark(
    "AuraClash is not world-class until real runtime gameplay is implemented with responsive controls, animation states, camera direction, collision, effects, polish, and visual QA evidence.",
    "browser smoke gates passed and final screenshot package has explicit visual approval"
  );
  mark(
    "AuraClash is not world-class until real runtime gameplay is implemented with responsive controls, animation states, camera direction, collision, effects, polish, and visual QA evidence. Source hooks now cover responsiveness/no-scene-reconstruction evidence, but visual QA evidence is still missing.",
    "browser smoke gates passed and final screenshot package has explicit visual approval"
  );
  mark(
    "Screenshot evidence shows debug overlays, readable fighters, effects, HUD, and stage depth.",
    "browser screenshot smoke passed and final screenshot package has explicit visual approval"
  );
  mark(
    "Screenshot evidence shows debug overlays, readable fighters, effects, HUD, and stage depth. Browser spec source now attaches a debug-overlay screenshot when run, but no artifact or approval exists yet.",
    "browser screenshot smoke passed and final screenshot package has explicit visual approval"
  );
}

if (browserSmokeOk && visualApprovalOk && deployedRoutesOk) {
  mark(
    "Input feels responsive at 60 fps with input buffering and no visible scene reconstruction hitch.",
    "browser smoke, deployed evidence, and explicit visual approval are present"
  );
  mark(
    "Input feels responsive at 60 fps with input buffering and no visible scene reconstruction hitch. Runtime/source evidence now exposes a 60 fps target, consumed input-buffer data, and no-frame-`setScene` proof hooks; this remains unchecked until browser capture confirms the feel and no visible hitch.",
    "browser smoke, deployed evidence, and explicit visual approval are present"
  );
  mark(
    "Character scale, pivot, facing direction, bounds, material readability, and thumbnail validation has source manifest coverage, but executed Quaternius-derived fighter validation evidence remains pending.",
    "source asset evidence, browser smoke, deployed evidence, and visual approval are present"
  );
  mark(
    "Hair/clothes/accessories do not float or detach in playable states; runtime/browser visual evidence is still required before this proof can be checked.",
    "browser smoke, source asset evidence, and explicit visual approval are present"
  );
  mark(
    "Materials avoid flat debug colors; palette, bloom, rim lighting, fog, and shadows are intentional; source review criteria now live in `apps/aura-clash-showcase/src/rendering/GamePostProcess.ts`, but visual approval remains pending.",
    "browser smoke and explicit visual approval are present"
  );
  mark(
    "At least three screenshot compositions look good: match start, combat impact, super move/result; capture metadata/review criteria now live in `apps/aura-clash-showcase/src/capture/PosterScenarios.ts` and `apps/aura-clash-showcase/scripts/capture-first-frame.mjs`, but actual screenshot proof remains pending.",
    "browser smoke, deployed evidence, and explicit visual approval are present"
  );
}

if (visualApprovalOk && hasThreeScreenshotCompositions()) {
  mark(
    "At least three screenshot compositions look good: match start, combat impact, super move/result.",
    "screenshot metadata records at least three reviewed compositions and explicit visual approval is set"
  );
}

if (localGatesOk && deployedRoutesOk) {
  mark(
    "AuraClash playable route passes local gates and deployed route/GLB proof.",
    "local and deployed route evidence report success"
  );
}

if (aura3dPackageSmokeOk) {
  mark(
    "Aura3D `1.0.5` package smoke passes in a fresh external Vite app.",
    "cross-runtime evidence reports Aura3D package smoke success"
  );
  mark(
    "External consumer can install package tarball and build a fighting-game example.",
    "cross-runtime evidence reports Aura3D game-runtime package smoke success"
  );
}

if (aura3dDistTypesOk) {
  mark(
    "Confirm generated `dist/engine/agent-api/index.d.ts` exposes the new public types.",
    "cross-runtime evidence reports generated public type declarations"
  );
}

if (aura3dValidationSuiteOk) {
  mark(
    "Run unit/browser/build validation for the new APIs and CLI commands.",
    "cross-runtime evidence reports Aura3D 1.0.5 validation-suite success"
  );
  mark(
    "Execute the newly added unit/browser tests and attach passing output.",
    "cross-runtime evidence reports Aura3D 1.0.5 validation-suite success"
  );
}

if (aura3dTypecheckOk) {
  mark("`pnpm typecheck`", "cross-runtime evidence reports typecheck success");
  mark("`pnpm typecheck` passes.", "cross-runtime evidence reports typecheck success");
}

if (aura3dBuildOk) {
  mark("`pnpm build`", "cross-runtime evidence reports build success");
  mark("`pnpm build` passes.", "cross-runtime evidence reports build success");
}

if (gameRuntimeUnitOk) {
  mark("`pnpm game-runtime:unit`", "cross-runtime evidence reports game-runtime unit success");
}

if (gameRuntimeBrowserOk) {
  mark("`pnpm game-runtime:browser`", "cross-runtime evidence reports game-runtime browser success");
  mark(
    "Browser tests verify real rendered movement, controls, physics, collision, animation state changes, and visual nonblank output.",
    "cross-runtime evidence reports game-runtime browser success"
  );
  mark(
    "Browser test shows hitbox debug overlay and health decrease after input replay.",
    "cross-runtime evidence reports game-runtime browser success"
  );
  mark(
    "Camera framing is stable in screenshot tests.",
    "cross-runtime evidence reports game-runtime browser success"
  );
}

if (gameRuntimeTemplateOk) {
  mark("`pnpm game-runtime:template`", "cross-runtime evidence reports game-runtime template success");
  mark(
    "A `create-aura3d` fighting-game template builds and runs without private APIs.",
    "cross-runtime evidence reports game-runtime template success"
  );
  mark("Fresh scaffold builds with `npm run build`.", "cross-runtime evidence reports fighting-game scaffold build success");
  mark(
    "`npm run test` in scaffold verifies route loads and input replay causes a hit.",
    "cross-runtime evidence reports fighting-game scaffold test success"
  );
}

if (gameRuntimeDocsOk) {
  mark("`pnpm game-runtime:docs`", "cross-runtime evidence reports game-runtime docs success");
}

if (gameRuntimeReleaseOk) {
  mark("`pnpm game-runtime:release` passes.", "cross-runtime evidence reports game-runtime release success");
  mark("`pnpm game-runtime:release`", "cross-runtime evidence reports game-runtime release success");
}

if (animationAssetValidationOk) {
  mark(
    "Run `aura3d assets validate-animation` against an AuraVoice-backed animation sample.",
    "cross-runtime evidence reports validate-animation success"
  );
}

if (storyboardGalleryOk) {
  mark(
    "Browser screenshot gallery contains at least one title-safe thumbnail and three storyboard frames.",
    "cross-runtime evidence reports title-safe thumbnail and storyboard frame screenshots"
  );
}

if (promptAnimationUnitOk) {
  mark("`pnpm prompt-animation:unit`", "cross-runtime evidence reports prompt-animation unit success");
}

if (promptAnimationBrowserOk) {
  mark("`pnpm prompt-animation:browser`", "cross-runtime evidence reports prompt-animation browser success");
  mark(
    "Browser tests verify storyboard shot playback, character performance state changes, caption timing, camera cuts, and visually nonblank animation frames; required artifacts are `pnpm prompt-animation:browser` output plus `tests/reports/prompt-animation/storyboard-gallery/title-safe-thumbnail.png` and three storyboard frame screenshots.",
    "cross-runtime evidence reports prompt-animation browser success"
  );
  mark(
    "Aura3D can render a visually rich animated episode route from the shared contract; required artifacts are `pnpm prompt-animation:browser` output and storyboard frame screenshots under `tests/reports/prompt-animation/storyboard-gallery/`.",
    "cross-runtime evidence reports prompt-animation browser success"
  );
}

if (promptAnimationTemplateOk) {
  mark("`pnpm prompt-animation:template`", "cross-runtime evidence reports prompt-animation template success");
  mark("Fresh scaffold builds.", "cross-runtime evidence reports prompt-animation scaffold build success");
}

if (promptAnimationDocsOk) {
  mark("Prompt animation docs readiness passes.", "cross-runtime evidence reports prompt-animation docs success");
}

if (promptAnimationPackageOk) {
  mark("External consumer package smoke passes.", "cross-runtime evidence reports prompt-animation package smoke success");
}

if (promptAnimationReleaseOk) {
  mark("`pnpm prompt-animation:release` passes.", "cross-runtime evidence reports prompt-animation release success");
}

if (auraVoiceContractOk) {
  mark(
    "`auravoice-contract-proof.json` proves AuraVoice artifacts validate against Aura3D schemas.",
    "cross-runtime evidence reports AuraVoice contract proof"
  );
}

if (oneFrameSyncOk) {
  mark(
    "Character mouth movement stays within one frame at 30 fps of AuraVoice viseme timing.",
    "cross-runtime evidence reports one-frame viseme sync"
  );
  mark(
    "Caption display stays within one frame at 30 fps of AuraVoice dialogue timing.",
    "cross-runtime evidence reports one-frame caption timing"
  );
  mark(
    "Executed proof JSON shows caption display and character mouth movement within one frame at 30 fps using rendered frame/video evidence.",
    "cross-runtime evidence reports one-frame caption and viseme sync"
  );
  mark(
    "`viseme-sync-proof.json` proves primitive and GLB mouth timing stays within one frame at 30 fps.",
    "cross-runtime evidence reports one-frame viseme sync"
  );
}

if (auraVoiceSampleRenderOk) {
  mark(
    "AuraVoice plus Aura3D is not world-class for YouTube animation until a prompt can produce script, voiceover, captions, visemes, storyboard, shot timeline, animation performance, deterministic render frames, audio/video package, and review evidence.",
    "cross-runtime evidence reports prompt animation, AuraVoice timing, captions, visemes, storyboard, and deterministic render proof"
  );
  mark(
    "At least one 60-second sample episode renders from prompt to audio to Aura3D animation without manual timing edits.",
    "cross-runtime evidence reports AuraVoice sample render success"
  );
  mark(
    "AuraVoice sample episode renders from prompt to audio to Aura3D animation with synchronized captions and visemes.",
    "cross-runtime evidence reports AuraVoice sample render success"
  );
  mark(
    "Run an AuraVoice/animation-channel sample render or equivalent deterministic render package.",
    "cross-runtime evidence reports AuraVoice sample render success"
  );
  mark(
    "`prompt-animation-evidence.json` proves storyboard, captions, shot timing, and screenshots.",
    "cross-runtime evidence reports prompt-animation evidence success"
  );
  mark(
    "AuraVoice-to-Aura3D prompt animation contract has at least one end-to-end sample render.",
    "cross-runtime evidence reports AuraVoice sample render success"
  );
  mark(
    "Aura3D can produce deterministic screenshots from exact AuraVoice timestamps; required artifact `tests/reports/prompt-animation/prompt-animation-evidence.json` with screenshot hashes.",
    "cross-runtime evidence reports prompt-animation deterministic screenshot evidence"
  );
  mark(
    "AuraVoice can regenerate a voice track and Aura3D can re-render the affected shots without rebuilding the whole episode manually; required artifact `tests/reports/prompt-animation/auravoice-sample-render-package-gates.json`.",
    "cross-runtime evidence reports AuraVoice sample rerender workflow evidence"
  );
}

if (auraVoiceSamplePackageOk) {
  mark(
    "Actual 60-second sample episode video render exists with path, hash, byte size, duration, frame rate, resolution, and render queue id.",
    "cross-runtime evidence reports AuraVoice sample render package success"
  );
  mark(
    "Actual thumbnail exists and is proven to come from the same Aura3D scene state as the video source frame.",
    "cross-runtime evidence reports AuraVoice sample thumbnail success"
  );
  mark(
    "Actual caption, timeline, audio-stem, and evidence JSON artifacts exist with hashes, byte sizes, and stable ids.",
    "cross-runtime evidence reports AuraVoice sample render package artifacts"
  );
  mark(
    "AuraVoice sample episode render package includes video, thumbnail, captions, timeline, audio stems, and evidence JSON.",
    "cross-runtime evidence reports AuraVoice sample render package success"
  );
}

if (auraVoiceSampleRenderOk && auraVoiceSamplePackageOk && visualApprovalOk) {
  mark(
    "Human review confirms the animation is visually acceptable for a kids/channel-style YouTube pilot.",
    "cross-runtime evidence reports AuraVoice render package success and explicit visual approval is present"
  );
  mark(
    "Human review remains unchecked until a person approves the rendered AuraVoice sample.",
    "cross-runtime evidence reports AuraVoice render package success and explicit visual approval is present"
  );
  mark(
    "Capture and approve an AuraVoice prompt-to-animation sample render if included in the same launch claim.",
    "cross-runtime evidence reports AuraVoice render package success and explicit visual approval is present"
  );
  mark(
    "User visually approves the final AuraClash screenshot and the first AuraVoice animation sample if that sample is part of the same launch claim.",
    "cross-runtime evidence reports AuraVoice render package success and explicit visual approval is present"
  );
}

if (dubSyncOk) {
  mark(
    "`dub-sync-proof.json` proves a dubbed language render keeps stable shot ids.",
    "cross-runtime evidence reports dub sync success"
  );
}

if (crossRuntimeFinalOk && fullyApprovedLaunchEvidenceOk) {
  mark(
    "Actual AuraClash screenshot proof, deployed route/GLB proof, and explicit user visual approval remain pending.",
    "AuraClash launch evidence reports screenshot, deployed route/GLB, and explicit user approval success"
  );
  mark(
    "All evidence artifacts are generated, attached, and reflected in the PRD checklist.",
    "AuraClash launch evidence and cross-runtime evidence report success"
  );
}

if (fullyApprovedLaunchEvidenceOk) {
  mark(
    "Actual AuraClash screenshot proof, deployed route/GLB proof, and explicit user visual approval remain pending.",
    "AuraClash launch evidence reports screenshot, deployed route/GLB, and explicit user approval success"
  );
}

if (localGatesOk && screenshotOk) {
  mark(
    "Run a browser visual capture after the gameplay-source updates.",
    "local gates and first-frame capture evidence report success"
  );
}

if (localGatesOk && deployedRoutesOk && deploymentOk) {
  mark(
    "Deploy and verify public route, sitemap, robots, and GLB URLs.",
    "deployment and deployed route evidence report success"
  );
}

if (fullyApprovedLaunchEvidenceOk) {
  mark("Existing Aura Clash launch gates pass with evidence.", "launch evidence files report success and final visual approval is explicit");
  mark(
    "All evidence artifacts are generated, attached, and reflected in the PRD checklist.",
    "launch evidence files report success, source evidence is present, and PRD updater is applying evidence-backed marks"
  );
  mark("PRD updater marks only evidence-backed checkboxes.", "this updater only marks boxes from parsed evidence files and explicit approval flags");
}

const uncheckedReconciliation = reconcileActiveUnchecked(next);
const report = {
  ok: true,
  dryRun,
  prdPath,
  evidence: {
    localGatesPath,
    localGatesOk: localGates?.ok === true,
    screenshotMetaPath,
    screenshotOk,
    screenshotFileExists,
    screenshotArtifactOk,
    deployedRoutesPath,
    deployedRoutesOk,
    vercelDeployPath,
    vercelDeployOk,
    deploymentOk,
    deployFlagIgnoredForDeployment: deployFlag,
    launchAssetEvidencePath,
    launchAssetEvidenceOk: sourceAssetEvidenceOk,
    validateGameOk,
    reviewPackagePath,
    reviewPackageExists,
    reviewPackageReady,
    visualApprovalEvidencePath,
    userVisualApprovalEvidenceOk,
    crossRuntimeEvidencePath,
    crossRuntimeEvidenceOk: crossRuntimeEvidence?.ok === true,
    prdEvidenceCoveragePath,
    prdEvidenceCoverageOk,
    requirePrdEvidenceCoverage,
    aura3dValidationSuiteOk,
    aura3dTypecheckOk,
    aura3dBuildOk,
    aura3dDistTypesOk,
    gameRuntimeUnitOk,
    gameRuntimeBrowserOk,
    gameRuntimeTemplateOk,
    gameRuntimeDocsOk,
    aura3dPackageSmokeOk,
    gameRuntimeReleaseOk,
    auraVoiceContractOk,
    animationAssetValidationOk,
    promptAnimationUnitOk,
    promptAnimationBrowserOk,
    promptAnimationTemplateOk,
    promptAnimationDocsOk,
    promptAnimationPackageOk,
    promptAnimationReleaseOk,
    auraVoiceSampleRenderOk,
    auraVoiceSamplePackageOk,
    storyboardGalleryOk,
    oneFrameSyncOk,
    dubSyncOk,
    crossRuntimeFinalOk,
    deployFlag,
    userVisualApprovalFlagIgnoredForApproval: userVisualApprovalFlag,
    visualApprovalOk
  },
  reconciliation: uncheckedReconciliation,
  changes
};

if (!dryRun && next !== prd) {
  writeFileSync(prdPath, next);
}

console.log(JSON.stringify(report, null, 2));

function readJsonIfPresent(path) {
  if (!existsSync(path)) {
    return null;
  }

  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`Failed to parse ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function mark(label, reason) {
  const unchecked = `- [ ] ${label}`;
  const checked = `- [x] ${label}`;

  if (next.includes(checked)) {
    return;
  }

  if (!next.includes(unchecked)) {
    changes.push({
      label,
      changed: false,
      reason,
      warning: "unchecked checkbox not found"
    });
    return;
  }

  next = next.replace(unchecked, checked);
  changes.push({
    label,
    changed: true,
    reason
  });
}

function localGateOk(id) {
  if (!Array.isArray(localGates?.results)) {
    return false;
  }

  return localGates.results.some((result) => result.id === id && result.ok === true);
}

function reconcileActiveUnchecked(markdown) {
  const active = markdown.split("\n# Legacy World War X PRD Archive")[0];
  const unchecked = [...active.matchAll(/^\s*- \[ \] (.+)$/gm)].map((match) => {
    const label = match[1];
    const gate = gateReconciliation(label);

    return {
      label,
      category: gate.category,
      sourceBacked: gate.category === "source",
      evidenceRequired: gate.evidenceRequired,
      command: gate.command
    };
  });
  const categories = [
    "source",
    "evidence",
    "deploy",
    "screenshot",
    "visual approval",
    "package",
    "AuraVoice render",
    "user approval"
  ];
  const byCategory = Object.fromEntries(categories.map((category) => [category, 0]));

  for (const item of unchecked) {
    byCategory[item.category] = (byCategory[item.category] ?? 0) + 1;
  }

  return {
    uncheckedCount: unchecked.length,
    sourceUncheckedCount: unchecked.filter((item) => item.category === "source").length,
    evidenceGateUncheckedCount: unchecked.filter((item) => item.category !== "source").length,
    byCategory,
    unchecked
  };
}

function gateReconciliation(label) {
  switch (label) {
    case "Quaternius-derived fighter visual validation proof remains pending until `apps/aura-clash-showcase/launch-evidence/first-frame.json`, `apps/aura-clash-showcase/launch-evidence/first-frame.png`, `apps/aura-clash-showcase/launch-evidence/review-package.md`, `apps/aura-clash-showcase/launch-evidence/visual-approval.json`, and `apps/aura-clash-showcase/assets/source/aura-clash-launch-asset-evidence.json` prove the fighters are visible, grounded, correctly oriented, readable, and free of detached hair/clothes/accessories in runtime/browser screenshots.":
      return {
        category: "visual approval",
        command:
          "Run launch asset evidence, first-frame capture, review-package generation, and visual approval recording.",
        evidenceRequired:
          "apps/aura-clash-showcase/assets/source/aura-clash-launch-asset-evidence.json, launch-evidence/first-frame.json, launch-evidence/first-frame.png, launch-evidence/review-package.md, and launch-evidence/visual-approval.json."
      };
    case "Source manifests and typed asset declarations do not complete visual screenshot approval, deployed GLB reachability, or human visual quality approval; completion requires `first-frame.json`, `first-frame.png`, `review-package.md`, `deployed-routes.json`, and `visual-approval.json` with `ok: true`.":
      return {
        category: "visual approval",
        command:
          "Generate screenshot/review evidence, deployed-route and deployed-GLB evidence, and explicit visual approval evidence.",
        evidenceRequired:
          "apps/aura-clash-showcase/launch-evidence/first-frame.json, first-frame.png, review-package.md, deployed-routes.json, and visual-approval.json with ok:true where applicable."
      };
    case "Quaternius-derived fighter runtime visual validation remains pending until `apps/aura-clash-showcase/launch-evidence/first-frame.json`, `apps/aura-clash-showcase/launch-evidence/first-frame.png`, `apps/aura-clash-showcase/launch-evidence/review-package.md`, `apps/aura-clash-showcase/launch-evidence/visual-approval.json`, and `apps/aura-clash-showcase/assets/source/aura-clash-launch-asset-evidence.json` prove scale, pivot, facing, bounds, material readability, and attachment stability in browser/runtime context.":
      return {
        category: "visual approval",
        command:
          "Run launch asset evidence, first-frame capture, review-package generation, and visual approval recording.",
        evidenceRequired:
          "apps/aura-clash-showcase/assets/source/aura-clash-launch-asset-evidence.json, launch-evidence/first-frame.json, launch-evidence/first-frame.png, launch-evidence/review-package.md, and launch-evidence/visual-approval.json."
      };
    case "Capture and review first-frame screenshot.":
      return {
        category: "screenshot",
        command:
          "Run the Aura Clash screenshot capture flow and generate apps/aura-clash-showcase/launch-evidence/first-frame.{json,png} plus launch-evidence/review-package.md.",
        evidenceRequired:
          "apps/aura-clash-showcase/launch-evidence/first-frame.json with ok:true, a referenced first-frame.png file, nonblank screenshot evidence, and apps/aura-clash-showcase/launch-evidence/review-package.md."
      };
    case "Build app and marketing site.":
      return {
        category: "evidence",
        command:
          "Run npm run build from apps/aura-clash-showcase and npm run build from marketing, then record both results in apps/aura-clash-showcase/launch-evidence/local-gates.json.",
        evidenceRequired:
          "apps/aura-clash-showcase/launch-evidence/local-gates.json with ok:true and successful aura-clash-build and marketing-build result ids."
      };
    case "Deploy to Vercel.":
      return {
        category: "deploy",
        command:
          "Run the production Vercel deploy flow and write apps/aura-clash-showcase/launch-evidence/vercel-deploy.json.",
        evidenceRequired:
          "apps/aura-clash-showcase/launch-evidence/vercel-deploy.json with ok:true and the production deployment URL."
      };
    case "Confirm deployed route and GLB URLs return 200.":
      return {
        category: "deploy",
        command:
          "Probe deployed Aura Clash routes and manifest-referenced GLB URLs, then write apps/aura-clash-showcase/launch-evidence/deployed-routes.json.",
        evidenceRequired:
          "apps/aura-clash-showcase/launch-evidence/deployed-routes.json with ok:true, successful route responses, successful GLB responses, and nonzero GLB content lengths."
      };
    case "Gameplay smoke passes.":
      return {
        category: "evidence",
        command:
          "Run the Aura Clash playable smoke, route health, deploy-check, and screenshot browser specs and record their results in local-gates.json.",
        evidenceRequired:
          "apps/aura-clash-showcase/launch-evidence/local-gates.json with successful playable-smoke, screenshot-smoke, route-health, and deploy-check result ids."
      };
    case "Visual screenshot approved by user.":
      return {
        category: "user approval",
        command:
          "After screenshot review, write apps/aura-clash-showcase/launch-evidence/visual-approval.json with explicit approval metadata.",
        evidenceRequired:
          "apps/aura-clash-showcase/launch-evidence/visual-approval.json with ok:true, approved:true, approvedBy, approvedAt, gate:'Visual screenshot approved by user.', and references to the reviewed first-frame screenshot and review package."
      };
    case "Deployed route confirmed.":
      return {
        category: "deploy",
        command:
          "Probe the production /showcase/aura-clash route set and manifest-referenced GLB URLs, then write deployed-routes.json.",
        evidenceRequired:
          "apps/aura-clash-showcase/launch-evidence/deployed-routes.json with ok:true and successful production route and GLB checks."
      };
    default:
      return inferGateReconciliation(label);
  }
}

function inferGateReconciliation(label) {
  const normalized = label.toLowerCase();

  if (normalized.includes("auravoice") || normalized.includes("voice render")) {
    return {
      category: "AuraVoice render",
      command: "Run the applicable AuraVoice render flow and attach its render evidence artifact.",
      evidenceRequired: "Durable AuraVoice render evidence with ok:true and referenced output media."
    };
  }

  if (normalized.includes("deploy") || normalized.includes("deployed") || normalized.includes("vercel")) {
    return {
      category: "deploy",
      command: "Run the applicable deploy or deployed-route verification command and attach its evidence artifact.",
      evidenceRequired: "Durable deploy evidence with ok:true and route/asset response details."
    };
  }

  if (normalized.includes("screenshot") || normalized.includes("capture")) {
    return {
      category: "screenshot",
      command: "Run the applicable screenshot capture command and attach screenshot metadata plus the image artifact.",
      evidenceRequired: "Durable screenshot evidence with ok:true and a referenced nonblank image artifact."
    };
  }

  if (normalized.includes("approve") || normalized.includes("approval")) {
    return {
      category: "user approval",
      command: "Record explicit user approval in a durable approval artifact.",
      evidenceRequired: "Durable approval evidence with ok:true, approved:true, approver, approval timestamp, and referenced review artifact."
    };
  }

  if (normalized.includes("package") || normalized.includes("publish") || normalized.includes("smoke")) {
    return {
      category: "package",
      command: "Run the applicable package/publish smoke gate and attach its evidence artifact.",
      evidenceRequired: "Durable package evidence with ok:true and the checked package artifact/version."
    };
  }

  if (
    normalized.includes("test") ||
    normalized.includes("browser") ||
    normalized.includes("build") ||
    normalized.includes("pass") ||
    normalized.includes("evidence")
  ) {
    return {
      category: "evidence",
      command: "Run the applicable validation gate and attach its evidence artifact.",
      evidenceRequired: "Durable validation evidence with ok:true and command/result details."
    };
  }

  return {
    category: "source",
    command: "Inspect current source files and mark only when direct source evidence proves the checkbox.",
    evidenceRequired:
      "Direct current source files proving the implementation requirement without relying on validation, deploy, screenshot, package, render, or approval evidence."
  };
}

function validateGameGateOk() {
  return [
    "assets-validate-game",
    "aura3d-assets-validate-game",
    "validate-game"
  ].some((id) => localGateOk(id));
}

function hasScreenshotArtifactEvidence() {
  if (localGateOk("screenshot-smoke")) {
    return true;
  }

  return [
    screenshotMeta?.nonblank,
    screenshotMeta?.nonBlank,
    screenshotMeta?.checks?.nonblank,
    screenshotMeta?.image?.nonblank,
    screenshotMeta?.visualChecks?.nonblank
  ].some((value) => value === true);
}

function hasThreeScreenshotCompositions() {
  const explicitCount = [
    screenshotMeta?.compositionCount,
    screenshotMeta?.screenshotCount,
    screenshotMeta?.visualReview?.compositionCount,
    screenshotMeta?.review?.compositionCount
  ].find((value) => Number.isFinite(Number(value)));

  if (Number(explicitCount) >= 3) {
    return true;
  }

  const arrays = [
    screenshotMeta?.screenshots,
    screenshotMeta?.captures,
    screenshotMeta?.compositions,
    screenshotMeta?.visualReview?.screenshots,
    screenshotMeta?.visualReview?.compositions,
    screenshotMeta?.review?.screenshots,
    screenshotMeta?.review?.compositions
  ];

  return arrays.some((value) => Array.isArray(value) && value.length >= 3);
}

function visualApprovalEvidenceOk() {
  if (!visualApprovalEvidence || typeof visualApprovalEvidence !== "object") {
    return false;
  }

  const approvedScreenshot = visualApprovalEvidence.screenshot ?? visualApprovalEvidence.screenshotPath;
  const approvedReviewPackage = visualApprovalEvidence.reviewPackage ?? visualApprovalEvidence.reviewPackagePath;
  const approvedScreenshotMeta = visualApprovalEvidence.screenshotMeta ?? visualApprovalEvidence.screenshotMetaPath;
  const approvedScreenshotPath =
    typeof approvedScreenshot === "string" ? resolve(appRoot, approvedScreenshot) : null;
  const approvedReviewPackagePath =
    typeof approvedReviewPackage === "string" ? resolve(appRoot, approvedReviewPackage) : null;
  const approvedScreenshotMetaPath =
    typeof approvedScreenshotMeta === "string" ? resolve(appRoot, approvedScreenshotMeta) : null;
  const gate = visualApprovalEvidence.gate ?? visualApprovalEvidence.prdGate;

  return (
    visualApprovalEvidence.ok === true &&
    visualApprovalEvidence.approved === true &&
    typeof visualApprovalEvidence.approvedBy === "string" &&
    visualApprovalEvidence.approvedBy.trim().length > 0 &&
    typeof visualApprovalEvidence.approvedAt === "string" &&
    !Number.isNaN(Date.parse(visualApprovalEvidence.approvedAt)) &&
    (gate === "Visual screenshot approved by user." || gate === "Visual screenshot approved by user") &&
    approvedScreenshotPath === screenshotPath &&
    approvedScreenshotMetaPath === screenshotMetaPath &&
    approvedReviewPackagePath === reviewPackagePath &&
    existsSync(approvedScreenshotPath) &&
    existsSync(approvedScreenshotMetaPath) &&
    existsSync(approvedReviewPackagePath) &&
    fileHashMatches(approvedScreenshotPath, visualApprovalEvidence.screenshotSha256, visualApprovalEvidence.screenshotSizeBytes) &&
    fileHashMatches(approvedScreenshotMetaPath, visualApprovalEvidence.screenshotMetaSha256, visualApprovalEvidence.screenshotMetaSizeBytes) &&
    fileHashMatches(approvedReviewPackagePath, visualApprovalEvidence.reviewPackageSha256, visualApprovalEvidence.reviewPackageSizeBytes)
  );
}

function fileHashMatches(path, expectedSha256, expectedSizeBytes) {
  if (typeof expectedSha256 !== "string" || expectedSha256.length !== 64) {
    return false;
  }

  if (!Number.isFinite(Number(expectedSizeBytes))) {
    return false;
  }

  return (
    statSync(path).size === Number(expectedSizeBytes) &&
    createHash("sha256").update(readFileSync(path)).digest("hex") === expectedSha256
  );
}

function launchAssetEvidenceOk() {
  if (!launchAssetEvidence || typeof launchAssetEvidence !== "object") {
    return false;
  }

  const launchGlbs = Array.isArray(launchAssetEvidence.launchGlbs)
    ? launchAssetEvidence.launchGlbs
    : [];
  const playableSummary = launchAssetEvidence.playableFighterEvidenceSummary;
  const playableFighterIds = Array.isArray(playableSummary?.playableFighterIds)
    ? playableSummary.playableFighterIds
    : [];
  const approvedPrimitiveFallbacks = Array.isArray(playableSummary?.approvedPrimitiveFallbacks)
    ? playableSummary.approvedPrimitiveFallbacks
    : [];

  if (launchGlbs.length === 0 || playableFighterIds.length === 0 || approvedPrimitiveFallbacks.length > 0) {
    return false;
  }

  const glbById = new Map(launchGlbs.map((item) => [item?.id, item]));
  const everyLaunchGlbHasSourceQualityEvidence = launchGlbs.every((item) => {
    return (
      item &&
      typeof item === "object" &&
      item.provenance &&
      typeof item.licenseNote === "string" &&
      item.licenseNote.length > 0 &&
      (typeof item.thumbnailPath === "string" || typeof item.thumbnailUrl === "string") &&
      Array.isArray(item.bounds) &&
      item.bounds.length === 3 &&
      item.bounds.every((value) => Number.isFinite(Number(value)) && Number(value) > 0) &&
      typeof item.materialSummary === "string" &&
      item.materialSummary.length > 0 &&
      Array.isArray(item.intendedRouteUsage) &&
      item.intendedRouteUsage.length > 0
    );
  });
  const everyPlayableFighterHasTypedGlbEvidence = playableFighterIds.every((id) => {
    const item = glbById.get(id);
    const validation = item?.sourceValidationEvidence;

    return (
      item &&
      item.role === "fighter" &&
      item.deliveryMode === "typed-glb" &&
      typeof item.assetKey === "string" &&
      typeof item.typedAsset === "string" &&
      validation &&
      Array.isArray(validation.scale) &&
      typeof validation.pivotPolicy === "string" &&
      typeof validation.facingPolicy === "string" &&
      typeof validation.boundsEvidence === "string" &&
      typeof validation.materialReadabilityEvidence === "string" &&
      typeof validation.thumbnailEvidence === "string" &&
      validation.fallbackApproval === "none - clean typed GLB required"
    );
  });

  return everyLaunchGlbHasSourceQualityEvidence && everyPlayableFighterHasTypedGlbEvidence;
}
