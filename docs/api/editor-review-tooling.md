# Aura3D Editor Review And Edit Tooling API

Status: 1.1.0 scoped release guidance.

This page documents the new 1.1 editor-runtime review and editing tooling. These
are source-level editor models: deterministic, serializable state machines that
back review dashboards, multi-user sign-off, shot camera moves, nonlinear
timeline editing, and render-queue display. They are not After Effects, Premiere,
or Maya. They do not render frames, run a compositor, or own a window system.
They model the authoring state that a browser editor UI and release proofs are
built on top of, with validation and evidence flags baked in.

Use this page with:

- `docs/api/editor-visual-scripting.md`
- `docs/api/animation-runtime-events.md`
- `docs/concepts/editor-runtime.md`
- `docs/editor/browser-first-workflow.md`

## Imports

All symbols below are public exports of `@aura3d/editor-runtime`. Do not import
private package internals, renderer internals, `three`, or raw asset URLs.

```ts
import {
  CameraPathEditor,
  EpisodeReviewPanel,
  MultiUserReviewWorkflow,
  NonlinearAnimationEditor,
  RenderQueuePanel,
  VisualReviewDashboard,
  createCameraPathEditor,
  createEpisodeReviewPanel,
  createMultiUserReviewWorkflow,
  createNonlinearAnimationEditor,
  createRenderQueuePanel,
  createVisualReviewDashboard
} from "@aura3d/editor-runtime";
```

Every model returns an immutable snapshot from its mutating methods and exposes a
`serialize()`-style round trip where applicable. Snapshots carry an `evidence`
block (or `reviewUiEvidence`) of boolean flags that release proofs assert on.

## EpisodeReviewPanel

`EpisodeReviewPanel` models a single episode package under review: reviewer
notes, rejected frames, waveform lanes, and manual viseme edits, plus an
approval gate. Approval is blocked while any rejected frame is present.

Construct with `new EpisodeReviewPanel(state)` or `createEpisodeReviewPanel(state)`,
passing an `EpisodeReviewPanelState`.

Key types:

- `EpisodeReviewStatus` — `"draft" | "needs-review" | "approved" | "rejected"`.
- `EpisodeReviewPanelState` — `packageId`, optional `packageHash`, `status`,
  optional `reviewer`/`approvedAt`, `notes`, `rejectedFrames`, optional
  `waveformLanes` and `manualVisemeEdits`.
- `EpisodeReviewNote` — `id`, `author`, `text`, optional `time`.
- `EpisodeReviewRejectedFrame` — `id`, `time` (non-negative), `reason`.
- `EpisodeReviewWaveformLane` — `id`, `label`, `startTime`, `duration`,
  `peakCount`, `pathPointCount`.
- `EpisodeReviewManualVisemeEdit` — `id`, `characterId`, `visemeId`, `startTime`,
  `endTime` (must be greater than `startTime`), optional `reason`.

Key methods (each returns an `EpisodeReviewPanelSnapshot`):

- `addNote(note)` — append a reviewer note.
- `rejectFrame(frame)` — record a rejected frame and set status to `"rejected"`.
- `setWaveformLanes(lanes)` — replace the waveform review lanes.
- `applyManualVisemeEdit(edit)` — add or replace a manual viseme edit by id.
- `approve(reviewer, approvedAt?)` — set status to `"approved"`; throws if any
  rejected frame is present. `approvedAt` defaults to a fixed epoch ISO string
  for deterministic output.
- `markNeedsReview()` — reset to `"needs-review"` and clear reviewer/approval.
- `serialize()` — return the sanitized `EpisodeReviewPanelState`.
- `snapshot()` — current `EpisodeReviewPanelSnapshot`.

The snapshot adds `kind: "episode-review-panel"`, `approvalRecorded`,
`rejectedFrameCount`, `noteCount`, `waveformLaneCount`, `manualVisemeEditCount`,
and a `reviewUiEvidence` block with `waveformReview`, `manualVisemeEdits`,
`visualFrameReview`, and `reviewerNotes`.

```ts
const panel = createEpisodeReviewPanel({
  packageId: "ep-014",
  status: "needs-review",
  notes: [],
  rejectedFrames: []
});

panel.addNote({ id: "n1", author: "dana", text: "Lip sync drifts at 0:12", time: 12 });
panel.rejectFrame({ id: "f1", time: 12.4, reason: "Mouth open on closed phoneme" });

// Blocked: rejected frame present.
try {
  panel.approve("dana");
} catch (error) {
  console.log("approval blocked:", (error as Error).message);
}
```

## VisualReviewDashboard

`VisualReviewDashboard` aggregates a set of `EpisodeReviewPanelSnapshot`s into a
cross-package view: failed (rejected) frames, reviewer notes, waveform lanes, and
manual viseme edits, each tagged with its `packageId`, plus which packages are
approval-blocked.

Construct with `new VisualReviewDashboard(reviews)` or
`createVisualReviewDashboard(reviews)`.

Key methods:

- `setReviews(reviews)` — replace the review set; returns a
  `VisualReviewDashboardSnapshot`.
- `snapshot()` — current `VisualReviewDashboardSnapshot`.

The snapshot (`kind: "visual-review-dashboard"`) exposes `packageCount`,
`packages` (each a `VisualReviewDashboardPackage` with `packageId`, `status`,
`failedFrameCount`, `noteCount`, `waveformLaneCount`, `manualVisemeEditCount`,
`approvalBlocked`), flattened `failedFrames`, `reviewerNotes`, `waveformLanes`,
`manualVisemeEdits`, `approvalBlockedPackageIds`, and an `evidence` block with
`listsFailedFrames`, `listsReviewerNotes`, `waveformReview`, `manualVisemeEdits`,
and `approvalBlocking`. A package is approval-blocked when it has any rejected
(failed) frame.

```ts
const dashboard = createVisualReviewDashboard([panel.snapshot()]);
const view = dashboard.snapshot();

console.log(view.failedFrames.map((frame) => `${frame.packageId}:${frame.id}`));
console.log(view.approvalBlockedPackageIds);
```

## MultiUserReviewWorkflow

`MultiUserReviewWorkflow` models multi-user sign-off for one package: participants
with roles, comment threads with optional assignment, reviewer decisions, and a
quorum-based publish gate. Publishing requires the configured number of approving
reviewers, no outstanding change requests, and no unresolved threads.

Construct with `new MultiUserReviewWorkflow(state)` or
`createMultiUserReviewWorkflow(state)`.

Key types:

- `ReviewParticipantRole` — `"owner" | "reviewer" | "animator" | "audio" | "viewer"`.
- `ReviewDecisionStatus` — `"pending" | "approved" | "changes-requested"`.
- `ReviewWorkflowStatus` — `"draft" | "needs-review" | "changes-requested" | "approved"`.
- `ReviewParticipant` — `id`, `name`, `role`, optional `active`.
- `ReviewThread` — `id`, `authorId`, `text`, optional `time`/`frame`/`assignedTo`,
  `resolved`.
- `ReviewDecision` — `reviewerId`, `status`, `at` (timestamp), optional `note`.
- `MultiUserReviewWorkflowState` — `packageId`, optional `status`, optional
  `requiredReviewerCount`, `participants`, `threads`, `decisions`.

Key methods (each returns a `MultiUserReviewWorkflowSnapshot`):

- `addParticipant(participant)` — register a participant.
- `addThread(thread)` — add a comment thread; author and any assignee must be
  known participants. Adding an unresolved thread to an approved package flips it
  to `"changes-requested"`.
- `assignThread(threadId, participantId)` — assign a thread to a participant.
- `resolveThread(threadId)` — mark a thread resolved.
- `recordDecision(decision)` — record an approval or change request; only
  participants with role `owner` or `reviewer` may decide, otherwise it throws.
- `markNeedsReview()` — reset status to `"needs-review"`.
- `serialize()` — return the `MultiUserReviewWorkflowState`.
- `snapshot()` — current snapshot.

The snapshot (`kind: "multi-user-review-workflow"`) reports `status`,
`participantCount`, `activeParticipantCount`, `reviewerCount`,
`requiredReviewerCount`, `approvedReviewerCount`, `changeRequestCount`,
`threadCount`, `unresolvedThreadCount`, `assignedThreadCount`, the computed
`canPublish` gate, full `participants`/`threads`/`decisions` arrays, and an
`evidence` block with `multiUserReview`, `assignmentWorkflow`, `reviewerQuorum`,
and `publishBlockedByOpenThreads`.

```ts
const workflow = createMultiUserReviewWorkflow({
  packageId: "ep-014",
  requiredReviewerCount: 2,
  participants: [
    { id: "lead", name: "Lead", role: "owner" },
    { id: "rev", name: "Reviewer", role: "reviewer" }
  ],
  threads: [{ id: "t1", authorId: "rev", text: "Check shadow pop", resolved: false }],
  decisions: []
});

workflow.resolveThread("t1");
workflow.recordDecision({ reviewerId: "lead", status: "approved", at: "2026-06-07T00:00:00Z" });
const snapshot = workflow.recordDecision({
  reviewerId: "rev",
  status: "approved",
  at: "2026-06-07T00:01:00Z"
});

console.log(snapshot.canPublish, snapshot.status);
```

## CameraPathEditor

`CameraPathEditor` edits shot camera moves as keyframed curves over a
`TimelineClip`. It stores per-property keyframes (position x/y/z, target x/y/z,
fov, focusDistance, shake) under encoded ids on the clip, and samples them
deterministically. It is the source-level model behind a shot camera-move
editor, not a viewport gizmo.

Construct with `new CameraPathEditor(history?)` or `createCameraPathEditor(history?)`,
optionally sharing a `CommandHistory` so camera edits participate in undo/redo.

Key types:

- `EditorCameraVector3` — `readonly [number, number, number]`.
- `EditorCameraPathKeyframe` — `id`, `time` (non-negative), `position`, `target`,
  `fov` (positive), optional `focusDistance`, optional `shake`, optional
  `interpolation`.
- `EditorCameraPathSample` — `time`, `position`, `target`, `fov`, optional
  `focusDistance`, `shake`.
- `EditorCameraPathEvidence` — `clipId`, `cameraKeyframeCount`,
  `editablePropertyCount`, `sampledPointCount`, and an `evidence` block.

Key members:

- `commandHistory` (getter) — the underlying `CommandHistory`.
- `setCameraKeyframe(clip, keyframe)` — async; write one camera keyframe across
  all camera property paths and tag the clip. Returns the normalized keyframe.
- `readCameraPathKeyframes(clip)` — reconstruct the camera keyframes from the
  clip, sorted by time then id. Also exported as the standalone function
  `readCameraPathKeyframes(clip)`.
- `sample(clip, time)` — deterministic `EditorCameraPathSample` at `time`; throws
  if the clip has no editable camera keyframes.
- `evidence(clip)` — `EditorCameraPathEvidence` with flags
  `shotCameraMoveEditing`, `cameraPositionCurves`, `cameraTargetCurves`,
  `fovCurve`, and `deterministicSampling`.

```ts
const cameraEditor = createCameraPathEditor();

await cameraEditor.setCameraKeyframe(clip, {
  id: "shot-a-start",
  time: 0,
  position: [0, 1.6, 6],
  target: [0, 1.4, 0],
  fov: 50
});
await cameraEditor.setCameraKeyframe(clip, {
  id: "shot-a-end",
  time: 2,
  position: [2, 1.6, 4],
  target: [0, 1.4, 0],
  fov: 38
});

const mid = cameraEditor.sample(clip, 1);
console.log(mid.position, mid.fov);
console.log(cameraEditor.evidence(clip).evidence.shotCameraMoveEditing);
```

## NonlinearAnimationEditor

`NonlinearAnimationEditor` is a source-level nonlinear editing model: an asset
bin, multiple named sequences, multi-track timelines, nested sequence clips, the
core trim/split/move/duplicate operations (delegated to a per-sequence
`TimelineEditorController`), and full serialization. It is not a frame
compositor; clip edits are timeline mutations.

Construct with `new NonlinearAnimationEditor(state)` or
`createNonlinearAnimationEditor(state)`. At least one sequence is required.

Key types:

- `NonlinearBinAssetKind` —
  `"animation" | "audio" | "camera" | "shot" | "sequence" | "caption" | "viseme"`.
- `NonlinearBinAsset` — `id`, `name`, `kind`, optional `assetId`, `clipName`,
  `duration` (positive when provided), `metadata`.
- `NonlinearSequenceConfig` — `id`, `name`, optional `timeline`
  (`TimelineModelConfig`).
- `NonlinearAnimationEditorState` — `activeSequenceId`, `binAssets`, `sequences`.

Key methods:

- `addBinAsset(asset)` — register a bin asset; returns the sanitized
  `NonlinearBinAsset`.
- `createSequence(config)` — create a sequence (defaults: 10s duration, 24fps,
  loop `none`); returns a `NonlinearSequenceSnapshot`.
- `selectSequence(sequenceId)` — set the active sequence; returns the editor
  snapshot.
- `addTrack(kind, name?, options?)` — async; add a track to the active sequence;
  returns the new track id.
- `insertAssetClip(trackId, assetId, options)` — async; insert a clip from a bin
  asset (with `binAssetId`/`binAssetKind` properties); returns the clip id.
- `insertNestedSequence(trackId, sequenceId, options)` — async; insert another
  sequence as a nested clip (with a `nestedSequenceId` property); returns the
  clip id.
- `moveClip(clipId, startTime)` — async; reposition a clip.
- `trimClip(clipId, duration, startTime?)` — async; resize a clip.
- `splitClip(clipId, splitTime)` — async; split a clip; returns the resulting
  clip ids.
- `duplicateClip(clipId, timeOffset?)` — async; duplicate a clip; returns the new
  clip id.
- `serialize()` — return `NonlinearAnimationEditorState` with each sequence's
  serialized timeline.
- `snapshot()` — current `NonlinearAnimationEditorSnapshot`.

The snapshot (`kind: "nonlinear-animation-editor"`) reports `activeSequenceId`,
`sequenceCount`, `binAssetCount`, `nestedSequenceClipCount`, `totalTrackCount`,
`totalClipCount`, per-sequence `sequences` (`NonlinearSequenceSnapshot`), the
`activeTimeline` (`TimelineEditorSnapshot`), and an `evidence` block with
`nonlinearSequences`, `trimSplitMoveDuplicate`, `nestedSequences`,
`multiTrackTimeline`, and `serialization`.

```ts
const editor = createNonlinearAnimationEditor({
  activeSequenceId: "master",
  binAssets: [
    { id: "idle", name: "Idle", kind: "animation", clipName: "Idle", duration: 1.2 }
  ],
  sequences: [
    { id: "master", name: "Master" },
    { id: "shot-a", name: "Shot A" }
  ]
});

const track = await editor.addTrack("animation", "Player");
const clip = await editor.insertAssetClip(track, "idle", { startTime: 0 });

await editor.duplicateClip(clip, 1.2);
await editor.splitClip(clip, 0.6);

const json = editor.serialize();
console.log(editor.snapshot().evidence.trimSplitMoveDuplicate, json.sequences.length);
```

## RenderQueuePanel

`RenderQueuePanel` models the display state of a render queue: per-item progress,
status, current/total frames, output paths, and errors, with an aggregate
progress average. It tracks queue state; it does not run a renderer.

Construct with `new RenderQueuePanel(items?)` or `createRenderQueuePanel(items?)`.

Key types:

- `RenderQueuePanelItemStatus` — `"queued" | "running" | "done" | "failed"`.
- `RenderQueuePanelItem` — `id`, `label`, `status`, `progress` (clamped to
  0..1), optional `currentFrame`, `totalFrames`, `outputPath`, `error`.

Key methods (each returns a `RenderQueuePanelSnapshot`):

- `upsert(item)` — add or replace an item by id.
- `updateProgress(id, progress, options?)` — update progress and optionally
  `status`, `currentFrame`, `totalFrames`, `outputPath`, `error`; throws if the
  item does not exist.
- `snapshot()` — current snapshot.

The snapshot (`kind: "render-queue-panel"`) reports `itemCount`, `queuedCount`,
`runningCount`, `doneCount`, `failedCount`, average `progress`, the id-sorted
`items`, collected `outputPaths`, and collected `errors`.

```ts
const queue = createRenderQueuePanel([
  { id: "ep-014-1080p", label: "Episode 014 1080p", status: "queued", progress: 0 }
]);

queue.updateProgress("ep-014-1080p", 0.5, { status: "running", currentFrame: 600, totalFrames: 1200 });
const done = queue.updateProgress("ep-014-1080p", 1, {
  status: "done",
  outputPath: "renders/ep-014-1080p.mp4"
});

console.log(done.progress, done.outputPaths, done.errors);
```

## Notes On Honesty And Evidence

These models are deterministic and serializable so that browser editor workflows
and release proofs can assert on real state. The `evidence` flags are derived
facts about the current model state (for example, `reviewerQuorum` or
`shotCameraMoveEditing`), not claims that a browser UI exists. A passing
package-level snapshot is not a browser editor workflow claim. Editor review and
edit tooling tasks should still be backed by browser workflow evidence as
described in `docs/api/editor-visual-scripting.md`.
