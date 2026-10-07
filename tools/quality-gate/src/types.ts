/**
 * tools/quality-gate types (PRD-12 §7.2). C-32 contract surface is re-exported;
 * the richer records below `extends`-style augment it, never replace it.
 */
export * from "./contracts";

export type ItemKind = "benchmark-scene" | "game-scenario" | "game-shot" | "game-strip";

export interface CaptureRef {
  /** Artifact-relative PNG path. */
  readonly path: string;
  readonly sha256: string;
  readonly width: number;
  readonly height: number;
  readonly dpr: number;
}

export interface EvidenceEnvironment {
  readonly commitSha: string;
  readonly githubRunId: string;
  /** ImageOS + ImageVersion env from the hosted runner. */
  readonly runnerImage: string;
  /** UNMASKED_RENDERER_WEBGL. */
  readonly gpuRenderer: string;
  readonly browserVersion: string;
  readonly launchArgs: readonly string[];
}

export interface CapturedItem {
  /** "bench:16-instancing@dpr1" | "game:showcase-bank-shot:scenario:action@1920x1080" */
  readonly itemId: string;
  readonly kind: ItemKind;
  readonly aura: CaptureRef;
  /** three.js frame for benchmark items. */
  readonly reference?: CaptureRef;
  readonly masks: Readonly<Partial<Record<import("../../../benchmarks/quality-rebuild/shared/contracts").MaskId | "hud", CaptureRef>>>;
  readonly variants: Readonly<Partial<Record<import("../../../benchmarks/quality-rebuild/shared/contracts").BrokenControlId | "aura3d-tuned", CaptureRef>>>;
  /** 4 extra captures (5 total) on calibration runs; [] otherwise. */
  readonly repeats: readonly CaptureRef[];
  readonly env: EvidenceEnvironment;
}

export type MetricId =
  | "flip" | "ssim" | "msssim" | "lpips" | "deltaE2000"
  | "shadowContrast" | "contactDarkening" | "highlightEnergy" | "roughnessResponse"
  | "textureDetail" | "edgeAliasing" | "dynamicRange" | "skyVariance"
  | "subjectPresence" | "temporalFlicker" | "blankOrBlack";

/** Re-export of the benchmark-side RegionId union (C-30). */
export type RegionId = import("../../../benchmarks/quality-rebuild/shared/types").RegionId;
