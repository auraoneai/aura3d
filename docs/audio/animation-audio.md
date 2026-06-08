# Animation Audio Helpers

The Aura3D 1.1 animation audio helpers in `@aura3d/audio` cover the scoped
animation-episode workflow: building a predictable voice/music/SFX/ambient
bus layout, checking that an episode's audio assets are present before
render, verifying dialogue stems line up with captions, and producing
review waveforms for dialogue stems.

These helpers are production-readiness checks and authoring conveniences,
not audio restoration or mastering tools. They report problems; they do
not fix mixes, retime captions, or generate audio.

All snippets use public `@aura3d/audio` imports only.

## `createAnimationAudioMixer`

Purpose: build an `AudioMixer` preconfigured with the four standard
animation buses (`voice`, `music`, `sfx`, `ambient`) at sensible default
volumes.

```ts
createAnimationAudioMixer(
  context: AudioContextLike,
  options?: AnimationAudioMixerOptions
): AnimationAudioMixer
```

`AnimationAudioMixerOptions`:

- `voiceVolume?` (default `1`)
- `musicVolume?` (default `0.55`)
- `sfxVolume?` (default `0.9`)
- `ambientVolume?` (default `0.45`)
- `muted?` (default `false`) — when `true`, mutes the master bus and all
  four animation buses.

Returns a `AnimationAudioMixer`:

- `mixer` — the underlying `AudioMixer`.
- `buses` — the `{ voice, music, sfx, ambient }` `AudioBus` instances.
- `evidence(options?)` — produces an `AudioMixerEvidence` snapshot;
  pass `{ unlocked, errors }` to record context-unlock state and any
  surfaced errors.

Each `AudioBus` exposes `setVolume(value)` and `mute(value = true)` for
runtime control. The mixer does not unlock the audio context itself; use
`AudioContextManager.unlock()` on a user gesture and pass the resulting
state into `evidence({ unlocked: true })`.

```ts
import { AudioContextManager, createAnimationAudioMixer } from "@aura3d/audio";

const contextManager = new AudioContextManager();
const animationMixer = createAnimationAudioMixer(contextManager.context, {
  musicVolume: 0.5
});

// Mute music while a line of dialogue plays.
animationMixer.buses.music.mute(true);

await contextManager.unlock(); // on a user gesture
const evidence = animationMixer.evidence({ unlocked: true });
// evidence.busCount === 5 (master + voice/music/sfx/ambient)
```

## `validateEpisodeAudioAssets`

Purpose: confirm an episode's required audio assets are present (and,
optionally, licensed) before render, surfacing missing-audio readiness
errors.

```ts
validateEpisodeAudioAssets(
  assets: readonly AudioFileAssetLike[],
  requirements: readonly EpisodeAudioAssetRequirement[],
  options?: { requireLicense?: boolean }
): EpisodeAudioAssetReadiness
```

Each `EpisodeAudioAssetRequirement` has:

- `id` — the asset id to look for.
- `role?` — `"dialogue" | "music" | "sfx" | "ambient"` (used in messages).
- `required?` (default `true`).
- `requireLicense?` — require license metadata for this asset.

Returns an `EpisodeAudioAssetReadiness`:

- `ok` — `true` when no `error`-severity diagnostics were produced.
- `requiredCount` / `readyCount`.
- `missingAssetIds` — ids of required assets not found in `assets`.
- `diagnostics` — `EpisodeAudioAssetDiagnostic[]`, each with `severity`,
  `code`, `assetId`, and `message`. Diagnostic codes include
  `audio-asset-missing`, `audio-asset-wrong-type`,
  `audio-asset-missing-url`, and `audio-asset-missing-license`.

```ts
import { validateEpisodeAudioAssets } from "@aura3d/audio";

const readiness = validateEpisodeAudioAssets(
  [{ id: "vo-line-01", url: "https://cdn.example/vo-01.mp3", license: "CC0" }],
  [
    { id: "vo-line-01", role: "dialogue" },
    { id: "theme-music", role: "music" }
  ],
  { requireLicense: true }
);

if (!readiness.ok) {
  console.error(readiness.missingAssetIds); // ["theme-music"]
}
```

## `validateAudioCaptionSync`

Purpose: verify that dialogue-track stems start and end within one frame
(by default) of their matching caption cues.

```ts
validateAudioCaptionSync(
  tracks: readonly AudioTimelineTrack[],
  captions: readonly AudioCaptionCue[],
  options?: { frameRate?: number; toleranceFrames?: number }
): AudioCaptionSyncReport
```

Only tracks with `role: "dialogue"` are matched. A cue is matched to a
dialogue clip by `audioClipId` when set, otherwise by the clip whose
start time is within tolerance of the cue start. `frameRate` defaults to
`30` and `toleranceFrames` defaults to `1` (floored, minimum `0`).

Returns an `AudioCaptionSyncReport`:

- `ok` — `true` when there are no issues.
- `frameRate`, `toleranceFrames`, `checkedCueCount`.
- `issues` — `AudioCaptionSyncIssue[]` with `code`, `message`, `cueId`,
  optional `clipId`, and optional `deltaFrames`. Issue codes include
  `caption-invalid-range`, `caption-audio-clip-missing`,
  `caption-audio-start-out-of-sync`, and `caption-audio-end-out-of-sync`.

```ts
import { AudioTimelineTrack, validateAudioCaptionSync } from "@aura3d/audio";

const dialogue = new AudioTimelineTrack({
  id: "dialogue",
  role: "dialogue",
  clips: [{ id: "vo-line-01", startTime: 1.0, duration: 2.5 }]
});

const report = validateAudioCaptionSync(
  [dialogue],
  [{ id: "cap-01", startTime: 1.0, endTime: 3.5, audioClipId: "vo-line-01" }],
  { frameRate: 30, toleranceFrames: 1 }
);

if (!report.ok) {
  console.warn(report.issues);
}
```

## `createAudioWaveformReviewData`

Purpose: build per-dialogue-stem review waveforms (scaled drawing paths)
for a fixed review canvas, so reviewers can eyeball dialogue stems.

```ts
createAudioWaveformReviewData(
  stems: readonly AudioWaveformReviewStem[],
  options: AudioWaveformPathOptions
): AudioWaveformReviewData
```

Each `AudioWaveformReviewStem` has `id`, optional `label`, `startTime`,
and a `waveform` (`AudioWaveformData`, e.g. from `createAudioWaveform`).
`AudioWaveformPathOptions` requires positive `width` and `height` and
accepts optional `padding`.

Returns an `AudioWaveformReviewData`:

- `kind: "audio-waveform-review-data"`.
- `stemCount`, `width`, `height`.
- `stems` — `AudioWaveformReviewStemView[]`, each with `id`, `label`
  (falls back to `id`), `startTime` (clamped to `>= 0`), `duration`,
  `peakCount`, and a `path` of `AudioWaveformPathPoint`s rendered for the
  shared `width`/`height`.

```ts
import {
  createAudioWaveform,
  createAudioWaveformReviewData
} from "@aura3d/audio";

const reviewData = createAudioWaveformReviewData(
  [
    {
      id: "vo-line-01",
      label: "Line 01",
      startTime: 1.0,
      waveform: createAudioWaveform(dialogueClip, { peakCount: 256 })
    }
  ],
  { width: 800, height: 120, padding: 8 }
);

// reviewData.stems[0].path -> points to draw into an 800x120 canvas
```

## Claim Boundary

Allowed after checks pass:

- "The animation audio mixer provides the standard voice/music/SFX/ambient
  bus layout for the scoped 1.1 workflow."
- "Audio readiness, caption sync, and dialogue waveform checks run before
  the episode is published."

Not allowed:

- "Aura3D masters or restores audio."
- "The caption-sync check generates or retimes captions automatically."
- "Review waveforms prove final audio quality."
