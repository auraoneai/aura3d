import type {
  EpisodeReviewManualVisemeEdit,
  EpisodeReviewNote,
  EpisodeReviewPanelSnapshot,
  EpisodeReviewRejectedFrame,
  EpisodeReviewWaveformLane
} from "./EpisodeReviewPanel";

export interface VisualReviewDashboardPackage {
  readonly packageId: string;
  readonly status: EpisodeReviewPanelSnapshot["status"];
  readonly failedFrameCount: number;
  readonly noteCount: number;
  readonly waveformLaneCount: number;
  readonly manualVisemeEditCount: number;
  readonly approvalBlocked: boolean;
}

export interface VisualReviewDashboardSnapshot {
  readonly kind: "visual-review-dashboard";
  readonly packageCount: number;
  readonly packages: readonly VisualReviewDashboardPackage[];
  readonly failedFrames: readonly (EpisodeReviewRejectedFrame & { readonly packageId: string })[];
  readonly reviewerNotes: readonly (EpisodeReviewNote & { readonly packageId: string })[];
  readonly waveformLanes: readonly (EpisodeReviewWaveformLane & { readonly packageId: string })[];
  readonly manualVisemeEdits: readonly (EpisodeReviewManualVisemeEdit & { readonly packageId: string })[];
  readonly approvalBlockedPackageIds: readonly string[];
  readonly evidence: {
    readonly listsFailedFrames: boolean;
    readonly listsReviewerNotes: boolean;
    readonly waveformReview: boolean;
    readonly manualVisemeEdits: boolean;
    readonly approvalBlocking: boolean;
  };
}

export class VisualReviewDashboard {
  private reviews: readonly EpisodeReviewPanelSnapshot[];

  constructor(reviews: readonly EpisodeReviewPanelSnapshot[]) {
    this.reviews = reviews.map((review) => ({ ...review }));
  }

  setReviews(reviews: readonly EpisodeReviewPanelSnapshot[]): VisualReviewDashboardSnapshot {
    this.reviews = reviews.map((review) => ({ ...review }));
    return this.snapshot();
  }

  snapshot(): VisualReviewDashboardSnapshot {
    const packages = this.reviews.map((review) => ({
      packageId: review.packageId,
      status: review.status,
      failedFrameCount: review.rejectedFrameCount,
      noteCount: review.noteCount,
      waveformLaneCount: review.waveformLaneCount,
      manualVisemeEditCount: review.manualVisemeEditCount,
      approvalBlocked: review.rejectedFrameCount > 0
    }));
    const failedFrames = this.reviews.flatMap((review) => review.rejectedFrames.map((frame) => ({ ...frame, packageId: review.packageId })));
    const reviewerNotes = this.reviews.flatMap((review) => review.notes.map((note) => ({ ...note, packageId: review.packageId })));
    const waveformLanes = this.reviews.flatMap((review) => (review.waveformLanes ?? []).map((lane) => ({ ...lane, packageId: review.packageId })));
    const manualVisemeEdits = this.reviews.flatMap((review) => (review.manualVisemeEdits ?? []).map((edit) => ({ ...edit, packageId: review.packageId })));
    const approvalBlockedPackageIds = packages.filter((item) => item.approvalBlocked).map((item) => item.packageId);

    return {
      kind: "visual-review-dashboard",
      packageCount: packages.length,
      packages,
      failedFrames,
      reviewerNotes,
      waveformLanes,
      manualVisemeEdits,
      approvalBlockedPackageIds,
      evidence: {
        listsFailedFrames: failedFrames.length > 0,
        listsReviewerNotes: reviewerNotes.length > 0,
        waveformReview: waveformLanes.length > 0,
        manualVisemeEdits: manualVisemeEdits.length > 0,
        approvalBlocking: approvalBlockedPackageIds.length > 0
      }
    };
  }
}

export function createVisualReviewDashboard(reviews: readonly EpisodeReviewPanelSnapshot[]): VisualReviewDashboard {
  return new VisualReviewDashboard(reviews);
}
