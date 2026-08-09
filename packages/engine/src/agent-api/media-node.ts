/**
 * WS-2.3 — the Node-only media surface, as its own entry point.
 *
 * ## The measured problem
 *
 * `FfmpegFrameEncoder.ts` is the **only** file in the 37-file media/video surface that reaches
 * `node:` builtins: `node:child_process` to spawn ffmpeg, and `node:fs/promises` / `node:os` /
 * `node:path` to stage frames. Everything else is browser or pure.
 *
 * It was re-exported from `agent-api/index.ts`, so every browser bundle of the public entry point
 * reached a module importing Node builtins. That is why `tools/bundle-size` carries a standing comment
 * marking four `node:` specifiers external "for every browser bundle measurement" — a workaround for a
 * dependency that should not have been in the browser graph at all. esbuild resolves `await import()`
 * at build time regardless of whether the branch can ever run.
 *
 * ## Why a subpath and not a package
 *
 * Measured with `tools/_probe/deps.mjs`: the media files import **back** into the rest of `agent-api` —
 * `PromptAnimationContract` (31 edges), `AnimationRenderQueue` (10), `ShotTimeline` (5),
 * `AnimationPerformance` (4), `VisemeController` (3) — while `AnimationDirector`, `ShotTimeline`,
 * `AssetLibraryBrowser` and `PromptAnimationEvidence` import media files in return. A separate package
 * would be a dependency cycle. The PRD anticipates this and permits the alternative it requires:
 * *"one package with environment-safe export conditions"*.
 *
 * ## The binding requirement
 *
 * No `node:` import reachable from any browser entry. `agent-api/index.ts` no longer re-exports this
 * module; a Node consumer imports `@aura3d/engine/media-node` instead. Enforced by
 * `tools/browser-entry-purity`, which fails the build if a `node:` specifier reappears in the browser
 * graph — a comment would not have held.
 */
export {
  buildFfmpegArgs,
  createFfmpegFrameEncoderAdapter,
  probeFfmpeg
} from "./FfmpegFrameEncoder.js";
export type {
  CreateFfmpegFrameEncoderAdapterOptions,
  FfmpegCapability,
  FfmpegFileSystem,
  FfmpegFrameInputFormat,
  FfmpegRunResult,
  RunFfmpeg
} from "./FfmpegFrameEncoder.js";

// Offline encoding, filesystem-shaped artifacts, cloud rendering, and publishing
// integrations share this explicit non-browser entry. Browser capture/encoding stays
// on the root API through MediaRecorder and WebCodecs adapters.
export * from "./PngSequenceEncoder.js";
export * from "./AudioMuxer.js";
export * from "./VideoExportPipeline.js";
export * from "./CaptionExporter.js";
export * from "./YouTubeMetadataGenerator.js";
export * from "./YouTubeUploadAdapter.js";
export * from "./PublishingPipeline.js";
export * from "./CloudRenderAdapter.js";
