export type EpisodeReviewStatus = "draft" | "needs-review" | "approved" | "rejected";

export interface EpisodeReviewRejectedFrame {
  readonly id: string;
  readonly time: number;
  readonly reason: string;
}

export interface EpisodeReviewNote {
  readonly id: string;
  readonly author: string;
  readonly text: string;
  readonly time?: number;
}

export interface EpisodeReviewWaveformLane {
  readonly id: string;
  readonly label: string;
  readonly startTime: number;
  readonly duration: number;
  readonly peakCount: number;
  readonly pathPointCount: number;
}

export interface EpisodeReviewManualVisemeEdit {
  readonly id: string;
  readonly characterId: string;
  readonly visemeId: string;
  readonly startTime: number;
  readonly endTime: number;
  readonly reason?: string;
}

export interface EpisodeReviewPanelState {
  readonly packageId: string;
  readonly packageHash?: string;
  readonly status: EpisodeReviewStatus;
  readonly reviewer?: string;
  readonly approvedAt?: string;
  readonly notes: readonly EpisodeReviewNote[];
  readonly rejectedFrames: readonly EpisodeReviewRejectedFrame[];
  readonly waveformLanes?: readonly EpisodeReviewWaveformLane[];
  readonly manualVisemeEdits?: readonly EpisodeReviewManualVisemeEdit[];
}

export interface EpisodeReviewPanelSnapshot extends EpisodeReviewPanelState {
  readonly kind: "episode-review-panel";
  readonly approvalRecorded: boolean;
  readonly rejectedFrameCount: number;
  readonly noteCount: number;
  readonly waveformLaneCount: number;
  readonly manualVisemeEditCount: number;
  readonly reviewUiEvidence: {
    readonly waveformReview: boolean;
    readonly manualVisemeEdits: boolean;
    readonly visualFrameReview: boolean;
    readonly reviewerNotes: boolean;
  };
}

export class EpisodeReviewPanel {
  private state: EpisodeReviewPanelState;

  constructor(state: EpisodeReviewPanelState) {
    this.state = sanitizeReviewState(state);
  }

  addNote(note: EpisodeReviewNote): EpisodeReviewPanelSnapshot {
    this.state = sanitizeReviewState({
      ...this.state,
      notes: [...this.state.notes, sanitizeReviewNote(note)]
    });
    return this.snapshot();
  }

  rejectFrame(frame: EpisodeReviewRejectedFrame): EpisodeReviewPanelSnapshot {
    this.state = sanitizeReviewState({
      ...this.state,
      status: "rejected",
      rejectedFrames: [...this.state.rejectedFrames, sanitizeRejectedFrame(frame)]
    });
    return this.snapshot();
  }

  setWaveformLanes(waveformLanes: readonly EpisodeReviewWaveformLane[]): EpisodeReviewPanelSnapshot {
    this.state = sanitizeReviewState({
      ...this.state,
      waveformLanes: waveformLanes.map(sanitizeWaveformLane)
    });
    return this.snapshot();
  }

  applyManualVisemeEdit(edit: EpisodeReviewManualVisemeEdit): EpisodeReviewPanelSnapshot {
    const sanitized = sanitizeManualVisemeEdit(edit);
    this.state = sanitizeReviewState({
      ...this.state,
      manualVisemeEdits: [
        ...((this.state.manualVisemeEdits ?? []).filter((candidate) => candidate.id !== sanitized.id)),
        sanitized
      ]
    });
    return this.snapshot();
  }

  approve(reviewer: string, approvedAt = new Date(0).toISOString()): EpisodeReviewPanelSnapshot {
    const name = nonEmpty(reviewer, "Episode review reviewer");
    if (this.state.rejectedFrames.length > 0) {
      throw new Error("Episode review cannot be approved while rejected frames are present.");
    }
    this.state = sanitizeReviewState({
      ...this.state,
      status: "approved",
      reviewer: name,
      approvedAt
    });
    return this.snapshot();
  }

  markNeedsReview(): EpisodeReviewPanelSnapshot {
    this.state = sanitizeReviewState({
      ...this.state,
      status: "needs-review",
      reviewer: undefined,
      approvedAt: undefined
    });
    return this.snapshot();
  }

  serialize(): EpisodeReviewPanelState {
    return sanitizeReviewState(this.state);
  }

  snapshot(): EpisodeReviewPanelSnapshot {
    const waveformLanes = this.state.waveformLanes ?? [];
    const manualVisemeEdits = this.state.manualVisemeEdits ?? [];
    return {
      kind: "episode-review-panel",
      ...this.serialize(),
      approvalRecorded: this.state.status === "approved" && Boolean(this.state.reviewer),
      rejectedFrameCount: this.state.rejectedFrames.length,
      noteCount: this.state.notes.length,
      waveformLaneCount: waveformLanes.length,
      manualVisemeEditCount: manualVisemeEdits.length,
      reviewUiEvidence: {
        waveformReview: waveformLanes.length > 0,
        manualVisemeEdits: manualVisemeEdits.length > 0,
        visualFrameReview: this.state.rejectedFrames.length > 0,
        reviewerNotes: this.state.notes.length > 0
      }
    };
  }
}

export function createEpisodeReviewPanel(state: EpisodeReviewPanelState): EpisodeReviewPanel {
  return new EpisodeReviewPanel(state);
}

function sanitizeReviewState(state: EpisodeReviewPanelState): EpisodeReviewPanelState {
  return {
    packageId: nonEmpty(state.packageId, "Episode review packageId"),
    packageHash: state.packageHash,
    status: state.status,
    reviewer: state.reviewer,
    approvedAt: state.approvedAt,
    notes: state.notes.map(sanitizeReviewNote),
    rejectedFrames: state.rejectedFrames.map(sanitizeRejectedFrame),
    waveformLanes: (state.waveformLanes ?? []).map(sanitizeWaveformLane),
    manualVisemeEdits: (state.manualVisemeEdits ?? []).map(sanitizeManualVisemeEdit)
  };
}

function sanitizeReviewNote(note: EpisodeReviewNote): EpisodeReviewNote {
  return {
    id: nonEmpty(note.id, "Episode review note id"),
    author: nonEmpty(note.author, "Episode review note author"),
    text: nonEmpty(note.text, "Episode review note text"),
    time: note.time
  };
}

function sanitizeRejectedFrame(frame: EpisodeReviewRejectedFrame): EpisodeReviewRejectedFrame {
  if (!Number.isFinite(frame.time) || frame.time < 0) {
    throw new Error("Episode review rejected frame time must be a non-negative finite number.");
  }
  return {
    id: nonEmpty(frame.id, "Episode review rejected frame id"),
    time: frame.time,
    reason: nonEmpty(frame.reason, "Episode review rejected frame reason")
  };
}

function sanitizeWaveformLane(lane: EpisodeReviewWaveformLane): EpisodeReviewWaveformLane {
  if (!Number.isFinite(lane.startTime) || lane.startTime < 0) {
    throw new Error("Episode review waveform lane startTime must be a non-negative finite number.");
  }
  if (!Number.isFinite(lane.duration) || lane.duration < 0) {
    throw new Error("Episode review waveform lane duration must be a non-negative finite number.");
  }
  if (!Number.isInteger(lane.peakCount) || lane.peakCount < 0) {
    throw new Error("Episode review waveform lane peakCount must be a non-negative integer.");
  }
  if (!Number.isInteger(lane.pathPointCount) || lane.pathPointCount < 0) {
    throw new Error("Episode review waveform lane pathPointCount must be a non-negative integer.");
  }
  return {
    id: nonEmpty(lane.id, "Episode review waveform lane id"),
    label: nonEmpty(lane.label, "Episode review waveform lane label"),
    startTime: lane.startTime,
    duration: lane.duration,
    peakCount: lane.peakCount,
    pathPointCount: lane.pathPointCount
  };
}

function sanitizeManualVisemeEdit(edit: EpisodeReviewManualVisemeEdit): EpisodeReviewManualVisemeEdit {
  if (!Number.isFinite(edit.startTime) || edit.startTime < 0) {
    throw new Error("Episode review manual viseme startTime must be a non-negative finite number.");
  }
  if (!Number.isFinite(edit.endTime) || edit.endTime <= edit.startTime) {
    throw new Error("Episode review manual viseme endTime must be greater than startTime.");
  }
  return {
    id: nonEmpty(edit.id, "Episode review manual viseme id"),
    characterId: nonEmpty(edit.characterId, "Episode review manual viseme characterId"),
    visemeId: nonEmpty(edit.visemeId, "Episode review manual viseme visemeId"),
    startTime: edit.startTime,
    endTime: edit.endTime,
    reason: edit.reason
  };
}

function nonEmpty(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label} must be a non-empty string.`);
  return trimmed;
}
