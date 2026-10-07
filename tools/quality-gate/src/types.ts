/**
 * tools/quality-gate types (PRD-12 §7.2). C-32 contract surface is re-exported;
 * the richer records below `extends`-style augment it, never replace it.
 */
export * from "./contracts";
import type { GameVisualCategory, GateVerdict } from "./contracts";

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
type BrokenControlId = import("../../../benchmarks/quality-rebuild/shared/contracts").BrokenControlId;

export interface MetricValue {
  readonly metric: MetricId;
  readonly region: RegionId;
  /** Detector value on the Aura frame, or the pairwise distance for distance metrics. */
  readonly aura: number;
  /** Detector value on the three.js frame; null for pairwise metrics. */
  readonly reference: number | null;
  /** Distance per the §6.4 convention (aura-vs-reference or aura-vs-golden). */
  readonly pairwise: number | null;
  /** "unavailable" when the metric backend was absent — never fabricated. */
  readonly status?: "ok" | "unavailable" | "error";
}

export interface CalibratedThreshold {
  readonly itemId: string;
  readonly metric: MetricId;
  readonly region: RegionId;
  /** Max over 10 pairwise repeat distances (5 captures). */
  readonly noiseMax: number;
  readonly brokenControls: Readonly<Partial<Record<BrokenControlId, {
    readonly distance: number;
    readonly source: "aura" | "three-proxy";
  }>>>;
  /** max(3 * noiseMax, floor[metric]). */
  readonly threshold: number;
  /** Controls c with threshold <= 0.5 * distance_c. */
  readonly rejects: readonly BrokenControlId[];
  /** rejects.length > 0. */
  readonly active: boolean;
  readonly calibratedAt: {
    readonly commitSha: string;
    readonly runnerImage: string;
  };
}

export interface CalibrationReport {
  readonly itemId: string;
  readonly thresholds: readonly CalibratedThreshold[];
  /** Applicable controls no active threshold rejects; non-empty => "calibration-broken". */
  readonly uncoveredControls: readonly BrokenControlId[];
}

export interface GoldenEntry {
  readonly itemId: string;
  /** LFS path under benchmarks/quality-rebuild/goldens/. */
  readonly image: CaptureRef;
  readonly masks: Readonly<Partial<Record<import("../../../benchmarks/quality-rebuild/shared/contracts").MaskId | "hud", CaptureRef>>>;
  readonly thresholds: readonly CalibratedThreshold[];
  /** PanelRoundRecord.roundId that approved this golden. */
  readonly approvedBy: string;
  /** Previous golden sha256. */
  readonly supersedes: string | null;
}

export interface GoldenManifest {
  readonly schema: "aura3d.quality-gate.goldens/1";
  /** Goldens are only valid on this runner image + GPU string (T3.7). */
  readonly runnerImage: string;
  readonly gpuRenderer: string;
  readonly entries: readonly GoldenEntry[];
}

/** research 23 six-class taxonomy (§7.3). */
export type DifferenceClass =
  | "equivalent" | "aura3d-better" | "minor-aura3d-deficiency"
  | "major-aura3d-deficiency" | "implementation-bug" | "missing-capability";

export type JudgeRole = "art-director" | "rendering-engineer";

/** CCR-12-1 view of JudgeIdentity: C-32 `kind` + PRD-12 optional `role`. */
export interface JudgeIdentityExt {
  readonly kind: "human" | "vision-model";
  readonly id: string;
  readonly model?: string;
  readonly role?: JudgeRole;
  readonly promptVersion?: string;
}

/** PRD-12 view of BenchmarkJudgement (C-32 base + §7.3 additions). */
export interface BenchmarkJudgementRecord {
  readonly itemId: string;
  readonly judge: JudgeIdentityExt;
  readonly blindKey: "A-is-aura" | "B-is-aura";
  readonly descriptions: { readonly aura: string; readonly reference: string };
  readonly differences: readonly {
    readonly text: string;
    readonly cls: DifferenceClass;
    readonly cause: string;
  }[];
  /** 0-10 in 0.5 steps. */
  readonly scores: { readonly aura: number; readonly reference: number };
  readonly harnessFairness: { readonly fair: boolean; readonly notes: string };
}

/** PRD-12 view of GameJudgement (C-32 base + §7.3 additions). */
export interface GameJudgementRecord {
  /** game id + viewport. */
  readonly itemId: string;
  readonly judge: JudgeIdentityExt;
  readonly scores: Readonly<Partial<Record<GameVisualCategory, number>>>;
  readonly dominantCauses: readonly { readonly cause: string; readonly percent: number }[];
  readonly competitiveWithModernThree: boolean;
  /** Required, >= 200 chars. */
  readonly critique: string;
}

export interface PanelRoundAggregate {
  readonly itemId: string;
  readonly median: number;
  readonly classes: readonly DifferenceClass[];
  readonly verdict: GateVerdict;
}

/** PRD-12 view of PanelRoundRecord (C-32 base + §7.3 additions). */
export interface PanelRoundRecordDoc {
  readonly schema: "aura3d.quality-gate.panel/1";
  readonly roundId: string;
  readonly env: EvidenceEnvironment;
  /** PRD revision id the thresholds were frozen under. */
  readonly thresholdsFrozenAt: string;
  readonly calibration: readonly {
    readonly judgeId: string;
    readonly drift: number;
    readonly accepted: boolean;
  }[];
  /** Vision judge saw the canary correctly. */
  readonly canaryPassed: boolean;
  readonly benchmark: readonly BenchmarkJudgementRecord[];
  readonly games: readonly GameJudgementRecord[];
  readonly aggregates: readonly PanelRoundAggregate[];
}
