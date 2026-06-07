export type ReviewParticipantRole = "owner" | "reviewer" | "animator" | "audio" | "viewer";
export type ReviewDecisionStatus = "pending" | "approved" | "changes-requested";
export type ReviewWorkflowStatus = "draft" | "needs-review" | "changes-requested" | "approved";

export interface ReviewParticipant {
  readonly id: string;
  readonly name: string;
  readonly role: ReviewParticipantRole;
  readonly active?: boolean | undefined;
}

export interface ReviewThread {
  readonly id: string;
  readonly authorId: string;
  readonly text: string;
  readonly time?: number | undefined;
  readonly frame?: number | undefined;
  readonly assignedTo?: string | undefined;
  readonly resolved: boolean;
}

export interface ReviewDecision {
  readonly reviewerId: string;
  readonly status: ReviewDecisionStatus;
  readonly at: string;
  readonly note?: string | undefined;
}

export interface MultiUserReviewWorkflowState {
  readonly packageId: string;
  readonly status?: ReviewWorkflowStatus | undefined;
  readonly requiredReviewerCount?: number | undefined;
  readonly participants: readonly ReviewParticipant[];
  readonly threads: readonly ReviewThread[];
  readonly decisions: readonly ReviewDecision[];
}

export interface MultiUserReviewWorkflowSnapshot {
  readonly kind: "multi-user-review-workflow";
  readonly packageId: string;
  readonly status: ReviewWorkflowStatus;
  readonly participantCount: number;
  readonly activeParticipantCount: number;
  readonly reviewerCount: number;
  readonly requiredReviewerCount: number;
  readonly approvedReviewerCount: number;
  readonly changeRequestCount: number;
  readonly threadCount: number;
  readonly unresolvedThreadCount: number;
  readonly assignedThreadCount: number;
  readonly canPublish: boolean;
  readonly participants: readonly ReviewParticipant[];
  readonly threads: readonly ReviewThread[];
  readonly decisions: readonly ReviewDecision[];
  readonly evidence: {
    readonly multiUserReview: boolean;
    readonly assignmentWorkflow: boolean;
    readonly reviewerQuorum: boolean;
    readonly publishBlockedByOpenThreads: boolean;
  };
}

export class MultiUserReviewWorkflow {
  private packageId: string;
  private status: ReviewWorkflowStatus;
  private requiredReviewerCount: number;
  private participants = new Map<string, ReviewParticipant>();
  private threads = new Map<string, ReviewThread>();
  private decisions = new Map<string, ReviewDecision>();

  constructor(state: MultiUserReviewWorkflowState) {
    this.packageId = nonEmpty(state.packageId, "Review package id");
    this.status = state.status ?? "needs-review";
    this.requiredReviewerCount = Math.max(1, Math.floor(state.requiredReviewerCount ?? 1));
    for (const participant of state.participants) this.addParticipant(participant);
    for (const thread of state.threads) this.addThread(thread);
    for (const decision of state.decisions) this.recordDecision(decision);
  }

  addParticipant(participant: ReviewParticipant): MultiUserReviewWorkflowSnapshot {
    const clean = sanitizeParticipant(participant);
    this.participants.set(clean.id, clean);
    return this.snapshot();
  }

  addThread(thread: ReviewThread): MultiUserReviewWorkflowSnapshot {
    const clean = sanitizeThread(thread);
    this.requireParticipant(clean.authorId);
    if (clean.assignedTo) this.requireParticipant(clean.assignedTo);
    this.threads.set(clean.id, clean);
    if (!clean.resolved && this.status === "approved") this.status = "changes-requested";
    return this.snapshot();
  }

  assignThread(threadId: string, participantId: string): MultiUserReviewWorkflowSnapshot {
    this.requireParticipant(participantId);
    const thread = this.requireThread(threadId);
    this.threads.set(threadId, { ...thread, assignedTo: participantId });
    return this.snapshot();
  }

  resolveThread(threadId: string): MultiUserReviewWorkflowSnapshot {
    const thread = this.requireThread(threadId);
    this.threads.set(threadId, { ...thread, resolved: true });
    return this.snapshot();
  }

  recordDecision(decision: ReviewDecision): MultiUserReviewWorkflowSnapshot {
    const clean = sanitizeDecision(decision);
    const participant = this.requireParticipant(clean.reviewerId);
    if (participant.role !== "reviewer" && participant.role !== "owner") {
      throw new Error(`Review participant "${clean.reviewerId}" is not allowed to approve or request changes.`);
    }
    this.decisions.set(clean.reviewerId, clean);
    if (clean.status === "changes-requested") this.status = "changes-requested";
    else if (this.snapshot().canPublish) this.status = "approved";
    return this.snapshot();
  }

  markNeedsReview(): MultiUserReviewWorkflowSnapshot {
    this.status = "needs-review";
    return this.snapshot();
  }

  serialize(): MultiUserReviewWorkflowState {
    return {
      packageId: this.packageId,
      status: this.status,
      requiredReviewerCount: this.requiredReviewerCount,
      participants: [...this.participants.values()],
      threads: [...this.threads.values()],
      decisions: [...this.decisions.values()]
    };
  }

  snapshot(): MultiUserReviewWorkflowSnapshot {
    const participants = [...this.participants.values()];
    const threads = [...this.threads.values()];
    const decisions = [...this.decisions.values()];
    const reviewerCount = participants.filter((participant) => participant.role === "owner" || participant.role === "reviewer").length;
    const approvedReviewerCount = decisions.filter((decision) => decision.status === "approved").length;
    const changeRequestCount = decisions.filter((decision) => decision.status === "changes-requested").length;
    const unresolvedThreadCount = threads.filter((thread) => !thread.resolved).length;
    const canPublish = approvedReviewerCount >= this.requiredReviewerCount && changeRequestCount === 0 && unresolvedThreadCount === 0;
    const status: ReviewWorkflowStatus = canPublish ? "approved" : changeRequestCount > 0 ? "changes-requested" : this.status === "draft" ? "draft" : "needs-review";
    return {
      kind: "multi-user-review-workflow",
      packageId: this.packageId,
      status,
      participantCount: participants.length,
      activeParticipantCount: participants.filter((participant) => participant.active !== false).length,
      reviewerCount,
      requiredReviewerCount: this.requiredReviewerCount,
      approvedReviewerCount,
      changeRequestCount,
      threadCount: threads.length,
      unresolvedThreadCount,
      assignedThreadCount: threads.filter((thread) => Boolean(thread.assignedTo)).length,
      canPublish,
      participants,
      threads,
      decisions,
      evidence: {
        multiUserReview: participants.length > 1,
        assignmentWorkflow: threads.some((thread) => Boolean(thread.assignedTo)),
        reviewerQuorum: approvedReviewerCount >= this.requiredReviewerCount,
        publishBlockedByOpenThreads: unresolvedThreadCount > 0
      }
    };
  }

  private requireParticipant(id: string): ReviewParticipant {
    const participant = this.participants.get(id);
    if (!participant) throw new Error(`Unknown review participant: ${id}`);
    return participant;
  }

  private requireThread(id: string): ReviewThread {
    const thread = this.threads.get(id);
    if (!thread) throw new Error(`Unknown review thread: ${id}`);
    return thread;
  }
}

export function createMultiUserReviewWorkflow(state: MultiUserReviewWorkflowState): MultiUserReviewWorkflow {
  return new MultiUserReviewWorkflow(state);
}

function sanitizeParticipant(participant: ReviewParticipant): ReviewParticipant {
  return {
    id: nonEmpty(participant.id, "Review participant id"),
    name: nonEmpty(participant.name, "Review participant name"),
    role: participant.role,
    active: participant.active
  };
}

function sanitizeThread(thread: ReviewThread): ReviewThread {
  if (thread.time !== undefined && (!Number.isFinite(thread.time) || thread.time < 0)) {
    throw new Error("Review thread time must be a non-negative finite number.");
  }
  if (thread.frame !== undefined && (!Number.isInteger(thread.frame) || thread.frame < 0)) {
    throw new Error("Review thread frame must be a non-negative integer.");
  }
  return {
    id: nonEmpty(thread.id, "Review thread id"),
    authorId: nonEmpty(thread.authorId, "Review thread author"),
    text: nonEmpty(thread.text, "Review thread text"),
    time: thread.time,
    frame: thread.frame,
    assignedTo: thread.assignedTo,
    resolved: thread.resolved
  };
}

function sanitizeDecision(decision: ReviewDecision): ReviewDecision {
  return {
    reviewerId: nonEmpty(decision.reviewerId, "Review decision reviewer"),
    status: decision.status,
    at: nonEmpty(decision.at, "Review decision timestamp"),
    note: decision.note
  };
}

function nonEmpty(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label} must be a non-empty string.`);
  return trimmed;
}
