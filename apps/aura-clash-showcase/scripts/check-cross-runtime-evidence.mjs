#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(__dirname, "..");
const repoRoot = resolve(appRoot, "../..");
const outPath = resolve(
  appRoot,
  process.env.AURA_CLASH_CROSS_RUNTIME_EVIDENCE_OUT ?? "launch-evidence/cross-runtime-evidence.json"
);

const required = {
  aura3dPackageSmoke: resolve(
    repoRoot,
    process.env.AURA3D_GAME_RUNTIME_PACKAGE_SMOKE_OUT ?? "tests/reports/game-runtime/package-smoke.json"
  ),
  gameRuntimeRelease: resolve(
    repoRoot,
    process.env.AURA3D_GAME_RUNTIME_RELEASE_OUT ?? "tests/reports/game-runtime/release.json"
  ),
  aura3dValidationSuite: resolve(
    repoRoot,
    process.env.AURA3D_104_VALIDATION_SUITE_OUT ?? "tests/reports/aura3d104/validation-suite.json"
  ),
  aura3dTypecheck: resolve(
    repoRoot,
    process.env.AURA3D_104_TYPECHECK_OUT ?? "tests/reports/aura3d104/typecheck.json"
  ),
  aura3dBuild: resolve(
    repoRoot,
    process.env.AURA3D_104_BUILD_OUT ?? "tests/reports/aura3d104/build.json"
  ),
  aura3dDistTypes: resolve(
    repoRoot,
    process.env.AURA3D_104_DIST_TYPES_OUT ?? "tests/reports/aura3d104/dist-agent-api-types.json"
  ),
  gameRuntimeUnit: resolve(
    repoRoot,
    process.env.AURA3D_GAME_RUNTIME_UNIT_OUT ?? "tests/reports/game-runtime/unit.json"
  ),
  gameRuntimeBrowser: resolve(
    repoRoot,
    process.env.AURA3D_GAME_RUNTIME_BROWSER_OUT ?? "tests/reports/game-runtime/browser.json"
  ),
  gameRuntimeTemplate: resolve(
    repoRoot,
    process.env.AURA3D_GAME_RUNTIME_TEMPLATE_OUT ?? "tests/reports/game-runtime/template.json"
  ),
  gameRuntimeDocs: resolve(
    repoRoot,
    process.env.AURA3D_GAME_RUNTIME_DOCS_OUT ?? "tests/reports/game-runtime/docs.json"
  ),
  auraClashLocalGates: resolve(
    appRoot,
    process.env.AURA_CLASH_LOCAL_GATES_OUT ?? "launch-evidence/local-gates.json"
  ),
  auraClashDeployedRoutes: resolve(
    appRoot,
    process.env.AURA_CLASH_LAUNCH_EVIDENCE_OUT ?? "launch-evidence/deployed-routes.json"
  ),
  auraClashVercelDeploy: resolve(
    appRoot,
    process.env.AURA_CLASH_VERCEL_DEPLOY_OUT ?? "launch-evidence/vercel-deploy.json"
  ),
  auraClashVisualApproval: resolve(
    appRoot,
    process.env.AURA_CLASH_USER_VISUAL_APPROVAL_OUT ?? "launch-evidence/visual-approval.json"
  ),
  auraVoiceContract: resolve(
    repoRoot,
    process.env.AURA3D_PROMPT_ANIMATION_AURAVOICE_CONTRACT_OUT ??
      "tests/reports/prompt-animation/auravoice-contract-proof.json"
  ),
  promptAnimationUnit: resolve(
    repoRoot,
    process.env.AURA3D_PROMPT_ANIMATION_UNIT_OUT ?? "tests/reports/prompt-animation/unit.json"
  ),
  promptAnimationBrowser: resolve(
    repoRoot,
    process.env.AURA3D_PROMPT_ANIMATION_BROWSER_OUT ?? "tests/reports/prompt-animation/browser.json"
  ),
  promptAnimationTemplate: resolve(
    repoRoot,
    process.env.AURA3D_PROMPT_ANIMATION_TEMPLATE_OUT ?? "tests/reports/prompt-animation/template.json"
  ),
  promptAnimationDocs: resolve(
    repoRoot,
    process.env.AURA3D_PROMPT_ANIMATION_DOCS_OUT ?? "tests/reports/prompt-animation/docs.json"
  ),
  promptAnimationPackage: resolve(
    repoRoot,
    process.env.AURA3D_PROMPT_ANIMATION_PACKAGE_OUT ?? "tests/reports/prompt-animation/package-smoke.json"
  ),
  promptAnimationRelease: resolve(
    repoRoot,
    process.env.AURA3D_PROMPT_ANIMATION_RELEASE_OUT ?? "tests/reports/prompt-animation/release.json"
  ),
  auraVoiceSampleRender: resolve(
    repoRoot,
    process.env.AURA3D_PROMPT_ANIMATION_AURAVOICE_RENDER_OUT ??
      "tests/reports/prompt-animation/auravoice-sample-render-gates.json"
  ),
  auraVoiceSamplePackage: resolve(
    repoRoot,
    process.env.AURA3D_PROMPT_ANIMATION_AURAVOICE_PACKAGE_OUT ??
      "tests/reports/prompt-animation/auravoice-sample-render-package-gates.json"
  ),
  promptAnimationEvidence: resolve(
    repoRoot,
    process.env.AURA3D_PROMPT_ANIMATION_EVIDENCE_OUT ??
      "tests/reports/prompt-animation/prompt-animation-evidence.json"
  ),
  animationAssetValidation: resolve(
    repoRoot,
    process.env.AURA3D_PROMPT_ANIMATION_VALIDATE_ANIMATION_OUT ??
      "tests/reports/prompt-animation/validate-animation.json"
  ),
  visemeSync: resolve(
    repoRoot,
    process.env.AURA3D_PROMPT_ANIMATION_VISEME_SYNC_OUT ??
      "tests/reports/prompt-animation/viseme-sync-proof.json"
  ),
  dubSync: resolve(
    repoRoot,
    process.env.AURA3D_PROMPT_ANIMATION_DUB_SYNC_OUT ??
      "tests/reports/prompt-animation/dub-sync-proof.json"
  ),
  storyboardTitleSafeThumbnail: resolve(
    repoRoot,
    process.env.AURA3D_PROMPT_ANIMATION_TITLE_SAFE_THUMBNAIL ??
      "tests/reports/prompt-animation/storyboard-gallery/title-safe-thumbnail.png"
  )
};

const optional = {
  video: resolve(
    repoRoot,
    process.env.AURA3D_PROMPT_ANIMATION_SAMPLE_VIDEO ??
      "tests/reports/prompt-animation/render-package/episode.mp4"
  ),
  thumbnail: resolve(
    repoRoot,
    process.env.AURA3D_PROMPT_ANIMATION_SAMPLE_THUMBNAIL ??
      "tests/reports/prompt-animation/render-package/thumbnail.png"
  ),
  captions: resolve(
    repoRoot,
    process.env.AURA3D_PROMPT_ANIMATION_SAMPLE_CAPTIONS ??
      "tests/reports/prompt-animation/render-package/captions.vtt"
  ),
  timeline: resolve(
    repoRoot,
    process.env.AURA3D_PROMPT_ANIMATION_SAMPLE_TIMELINE ??
      "tests/reports/prompt-animation/render-package/timeline.json"
  ),
  audioStems: resolve(
    repoRoot,
    process.env.AURA3D_PROMPT_ANIMATION_SAMPLE_AUDIO_STEMS ??
      "tests/reports/prompt-animation/render-package/audio-stems.json"
  ),
  youtubeDraft: resolve(
    repoRoot,
    process.env.AURA3D_PROMPT_ANIMATION_SAMPLE_YOUTUBE_DRAFT ??
      "tests/reports/prompt-animation/render-package/youtube-draft.json"
  )
};

const artifacts = Object.fromEntries(
  Object.entries({ ...required, ...optional }).map(([id, path]) => [id, inspectArtifact(path)])
);

const aura3dPackageSmokeOk = jsonOk(artifacts.aura3dPackageSmoke);
const aura3dValidationSuiteOk = jsonOk(artifacts.aura3dValidationSuite);
const aura3dTypecheckOk = jsonOk(artifacts.aura3dTypecheck);
const aura3dBuildOk = jsonOk(artifacts.aura3dBuild);
const aura3dDistTypesOk = jsonOk(artifacts.aura3dDistTypes);
const gameRuntimeUnitOk = jsonOk(artifacts.gameRuntimeUnit);
const gameRuntimeBrowserOk = jsonOk(artifacts.gameRuntimeBrowser);
const gameRuntimeTemplateOk = jsonOk(artifacts.gameRuntimeTemplate);
const gameRuntimeDocsOk = jsonOk(artifacts.gameRuntimeDocs);
const gameRuntimeReleaseOk = jsonOk(artifacts.gameRuntimeRelease);
const auraClashVercelDeployOk = jsonOk(artifacts.auraClashVercelDeploy);
const auraClashLaunchOk =
  jsonOk(artifacts.auraClashLocalGates) &&
  auraClashVercelDeployOk &&
  jsonOk(artifacts.auraClashDeployedRoutes) &&
  jsonOk(artifacts.auraClashVisualApproval);
const auraVoiceContractOk = jsonOk(artifacts.auraVoiceContract);
const animationAssetValidationOk = jsonOk(artifacts.animationAssetValidation);
const promptAnimationUnitOk = jsonOk(artifacts.promptAnimationUnit);
const promptAnimationBrowserOk = jsonOk(artifacts.promptAnimationBrowser);
const promptAnimationTemplateOk = jsonOk(artifacts.promptAnimationTemplate);
const promptAnimationDocsOk = jsonOk(artifacts.promptAnimationDocs);
const promptAnimationPackageOk = jsonOk(artifacts.promptAnimationPackage);
const promptAnimationReleaseOk = jsonOk(artifacts.promptAnimationRelease);
const auraVoiceSampleRenderOk =
  executedJsonOk(artifacts.auraVoiceSampleRender) &&
  executedJsonOk(artifacts.promptAnimationEvidence) &&
  executedJsonOk(artifacts.visemeSync) &&
  animationAssetValidationOk;
const auraVoiceSamplePackageOk =
  executedJsonOk(artifacts.auraVoiceSamplePackage) &&
  executedJsonOk(artifacts.promptAnimationEvidence) &&
  artifactOk(artifacts.video) &&
  artifactOk(artifacts.thumbnail) &&
  artifactOk(artifacts.captions) &&
  artifactOk(artifacts.timeline) &&
  artifactOk(artifacts.audioStems) &&
  artifactOk(artifacts.youtubeDraft);
const storyboardGalleryOk =
  artifactOk(artifacts.storyboardTitleSafeThumbnail) &&
  executedJsonOk(artifacts.promptAnimationEvidence) &&
  storyboardFrameCount(artifacts.promptAnimationEvidence) >= 3;
const oneFrameSyncOk =
  executedJsonOk(artifacts.visemeSync) &&
  executedJsonOk(artifacts.promptAnimationEvidence) &&
  driftFrames(artifacts.visemeSync, ["maxDriftFrames", "maxTimingDriftFrames"]) <= 1 &&
  driftFrames(artifacts.promptAnimationEvidence, ["maxCaptionDriftFrames", "captionMaxDriftFrames"]) <= 1;
const dubSyncOk = executedJsonOk(artifacts.dubSync);
const finalLaunchOk =
  aura3dValidationSuiteOk &&
  aura3dTypecheckOk &&
  aura3dBuildOk &&
  aura3dDistTypesOk &&
  gameRuntimeUnitOk &&
  gameRuntimeBrowserOk &&
  gameRuntimeTemplateOk &&
  gameRuntimeDocsOk &&
  aura3dPackageSmokeOk &&
  gameRuntimeReleaseOk &&
  auraClashLaunchOk &&
  auraVoiceContractOk &&
  promptAnimationUnitOk &&
  promptAnimationBrowserOk &&
  promptAnimationTemplateOk &&
  promptAnimationDocsOk &&
  promptAnimationPackageOk &&
  promptAnimationReleaseOk &&
  auraVoiceSampleRenderOk &&
  auraVoiceSamplePackageOk &&
  storyboardGalleryOk &&
  oneFrameSyncOk &&
  dubSyncOk;

const evidence = {
  ok: finalLaunchOk,
  generatedAt: new Date().toISOString(),
  appRoot,
  repoRoot,
  gates: {
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
    auraClashVercelDeployOk,
    auraClashLaunchOk,
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
    finalLaunchOk
  },
  artifacts
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(evidence, null, 2)}\n`);

if (!evidence.ok && process.env.AURA_CLASH_CROSS_RUNTIME_REQUIRED === "1") {
  console.error(`Cross-runtime evidence is incomplete.`);
  console.error(`Evidence written to ${outPath}`);
  process.exit(1);
}

console.log(JSON.stringify(evidence, null, 2));

function inspectArtifact(path) {
  const exists = existsSync(path);
  const result = {
    path,
    exists,
    ok: false,
    sizeBytes: 0
  };

  if (!exists) {
    return result;
  }

  const stats = statSync(path);
  result.sizeBytes = stats.size;
  result.ok = stats.size > 0;

  if (path.endsWith(".json")) {
    try {
      result.json = JSON.parse(readFileSync(path, "utf8"));
      result.ok = result.ok && result.json?.ok === true;
    } catch (error) {
      result.ok = false;
      result.error = error instanceof Error ? error.message : String(error);
    }
  }

  return result;
}

function artifactOk(artifact) {
  return artifact?.ok === true && artifact.sizeBytes > 0;
}

function jsonOk(artifact) {
  return artifactOk(artifact) && artifact.json?.ok === true;
}

function executedJsonOk(artifact) {
  return (
    jsonOk(artifact) &&
    artifact.json?.sourceOnly !== true &&
    !String(artifact.json?.kind ?? "").includes("source")
  );
}

function driftFrames(artifact, keys) {
  for (const key of keys) {
    const value = Number(artifact.json?.[key]);
    if (Number.isFinite(value)) return value;
  }
  const nestedValue = Number(
    artifact.json?.timing?.maxDriftFrames ??
      artifact.json?.sync?.maxDriftFrames ??
      artifact.json?.evidence?.maxDriftFrames
  );
  return Number.isFinite(nestedValue) ? nestedValue : 99;
}

function storyboardFrameCount(artifact) {
  const direct = Number(artifact.json?.storyboardFrameCount);
  if (Number.isFinite(direct)) return direct;
  const captures = artifact.json?.screenshots ?? artifact.json?.storyboardFrames ?? artifact.json?.captures;
  return Array.isArray(captures) ? captures.length : 0;
}
