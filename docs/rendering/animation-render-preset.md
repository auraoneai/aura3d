# Animation Render Preset

`createAnimationRenderPreset` is a shipped helper on `@aura3d/rendering` (also
re-exported from `@aura3d/engine`). It returns an
`AnimationRenderPresetEvidence` record: a policy the episode route should
honor. It is not a `createAuraApp` renderer mode and it does not render frames
by itself.

`applyAnimationRenderPreset(preset, options?)` turns that record into pixel
work the caller can assign:

- a real `AnimationToonMaterial` (banded N·L ramp + rim)
- an optional Sobel outline pass when `materialStyle.outline` is true
- an optional color-grade pass when you pass a frame buffer

Lights listed on the preset (`soft-key`, `cool-rim`, `set-fill`,
`emissive-practicals`) are descriptive. The toon program consumes one
directional key light. Bloom and fog from the preset are **not** applied here.

Calling either helper does not prove root `createAuraApp` rendered bloom, color
grading, soft shadows, toon materials, skinning, or morph targets. Those
features need browser screenshots from the actual route.

## Render Preset API (`createAnimationRenderPreset`)

The shipped surface is a small, evidence-producing helper in `@aura3d/rendering`, not a full renderer and not a `createAuraApp` renderer mode. `createAnimationRenderPreset` returns a `AnimationRenderPresetEvidence` record describing the policy that an episode route should honor.

Using this helper does not prove root `createAuraApp` rendered bloom, color
grading, soft shadows, toon materials, skinning, or morph targets. Those
features need browser screenshots, diagnostics, and frame metrics from the
actual route.

`AnimationRenderPresetOptions` fields (all optional):

- `name` — preset/style label (defaults to `"moon-garden-animation"`).
- `resolution` — `{ width, height }` (defaults to `1280x720`).
- `materialStyle` — a `AnimationMaterialStyleOptions` object forwarded to `createAnimationMaterialStyle` (see below).
- `reducedMotion` — accessibility flag (defaults to `false`).
- `reducedFlash` — when set, lowers bloom from `0.18` to `0.08` (defaults to `false`).

`AnimationRenderPresetEvidence` records the resolved policy for `lights`,
`shadows` (soft + contact), `postprocess` intent (`bloom`, `colorGrade`,
`fogDepthCue`), the resolved `materialStyle`, a `frameBudgetMs` of `16.7`, and
`debugOverlaysAllowedInExport: false`.

```ts
import { createAnimationRenderPreset } from "@aura3d/rendering";

const preset = createAnimationRenderPreset({
  name: "soft-neon-bedtime",
  resolution: { width: 1280, height: 720 },
  reducedFlash: true,
  materialStyle: { treatment: "cel" }
});

// preset.postprocess.bloom === 0.08
// preset.materialStyle.treatment === "cel"
```

## Animation Material Style (`createAnimationMaterialStyle`)

`createAnimationMaterialStyle` produces a `AnimationMaterialStyle` describing how compatible assets should be re-shaded for animation readability. This is an opt-in styling intent layered onto existing materials, not a separate material implementation.

`AnimationMaterialTreatment` is one of `"preserve-pbr" | "soft-toon" | "cel" | "flat-readable"`.

`AnimationMaterialStyleOptions` fields (all optional):

- `treatment` — defaults to `"soft-toon"`.
- `outline` — outline pass eligibility; defaults to `true` only when `treatment === "cel"`, otherwise `false`.
- `rampSteps` — toon ramp quantization; defaults to `4` for `cel`, `7` otherwise.
- `saturationBoost` — defaults to `0.08`.
- `roughnessFloor` — defaults to `0.48`.

The returned `AnimationMaterialStyle` also exposes `assetOverrideMetadata`, the metadata keys a compatible asset may set to control its own treatment: `animationMaterialTreatment`, `toonRampSteps`, `outlineEligible`, and `preserveSkinning`.

```ts
import { createAnimationMaterialStyle } from "@aura3d/rendering";

const style = createAnimationMaterialStyle({ treatment: "cel" });

// style.outline === true
// style.rampSteps === 4
// style.assetOverrideMetadata includes "preserveSkinning"
```

## Animation Visual Quality Gate (`createAnimationVisualQualityReport`)

`createAnimationVisualQualityReport` evaluates one or more captured frames and returns a `AnimationVisualQualityReport`. It composes the generic `evaluateFrameVisualQuality` metrics check with animation-specific blockers (caption occlusion, route chrome, debug overlays, and minimum visible characters). This is the gate that fails blank, overexposed/underexposed, occluded, or empty (no visible character) frames.

`AnimationFrameVisualInput` per frame:

- `id` — frame identifier.
- `metrics` — a `FrameVisualMetrics` record (produced by `analyzeRgbaFrameVisualMetrics`).
- `characterCount` — optional visible character count for the frame.
- `captionOccluded`, `routeChromeVisible`, `debugOverlayVisible` — optional boolean blockers.

`AnimationVisualQualityOptions`:

- `thresholds` — a `FrameVisualQualityThresholds` object; defaults to the exported `defaultAnimationVisualQualityThresholds`.
- `minVisibleCharacters` — defaults to `2`.

`AnimationVisualQualityReport` returns `ok`, per-frame `frames` (`{ id, ok, failures }`), the overall `visibleCharacterCount`, and a flat `blockers` list (`"<frameId>: <failure>"` plus any character-count blocker).

The exported `defaultAnimationVisualQualityThresholds` covers `minNonDarkRatio` (blank/dark), `minSalientRatio` and `minOccupiedAreaRatio`/`minOccupiedQuadrants` (empty/centered-only), `minColorBuckets`, `maxDominantBucketRatio` and `maxFlatPixelRatio` (flat/overexposed image), and `minLocalContrastRatio` (detail present).

```ts
import {
  analyzeRgbaFrameVisualMetrics,
  createAnimationVisualQualityReport
} from "@aura3d/rendering";

const metrics = analyzeRgbaFrameVisualMetrics(rgbaPixels, width, height);

const report = createAnimationVisualQualityReport([
  { id: "establishing", metrics, characterCount: 2 }
]);

if (!report.ok) {
  console.error(report.blockers);
}
```

## Per-Region Motion (`analyzeRgbaFrameMotionRegions`)

`analyzeRgbaFrameMotionRegions` compares two consecutive RGBA frames and reports where pixels actually changed. The motion gate uses this to reject global-only motion (a whole-frame translate/scale/wobble/shake) and still-image shake: a genuine animation shows localized change inside a character region, not a uniform whole-frame delta.

Signature:

```ts
analyzeRgbaFrameMotionRegions(
  previous: Uint8Array | Uint8ClampedArray,
  next: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  options?: { deltaThreshold?: number; minRegionPixels?: number }
): FrameMotionRegionMetrics
```

- `deltaThreshold` — per-pixel summed RGB difference required to count as changed (defaults to `18`).
- `minRegionPixels` — minimum changed pixels for a region to register (defaults to `max(4, round(width * height * 0.002))`).

`FrameMotionRegionMetrics` returns the overall `changedPixels`/`changedRatio`, a `regions` array (each `FrameMotionRegion` with `id`, `bounds`, `changedPixels`, `changedRatio`), `characterVisible`, and `characterMotionRegionCount`. Both frames must be `width * height * 4` bytes or the call throws `RangeError`.

```ts
import { analyzeRgbaFrameMotionRegions } from "@aura3d/rendering";

const motion = analyzeRgbaFrameMotionRegions(prevPixels, nextPixels, width, height);

// A near-1.0 changedRatio with a region bounding box covering the whole
// frame indicates global-only motion and should fail the motion gate.
if (motion.changedRatio > 0.9 || motion.characterMotionRegionCount === 0) {
  console.warn("Suspicious global-only or still-image motion");
}
```

> Note: the current implementation produces at most a single coalesced motion region (`"motion-region-1"`) spanning the bounding box of all changed pixels; it is a coarse global-vs-local discriminator, not a per-character segmentation.

## Representative Frames

Each package should archive:

- first establishing frame;
- first dialogue frame;
- strongest action frame;
- mouth-motion frame;
- final frame;
- any failed or reviewer-flagged frames.

These frames belong in the review package and should be referenced from `visual-acceptance.json`.

## Generated Image Usage

Generated images are allowed as:

- concept art;
- thumbnail candidates;
- background plates;
- texture/style references;
- storyboards.

Generated images are not allowed as:

- a single flat animation surface for publish-ready proof;
- a substitute for typed character/set assets;
- evidence that Aura3D can perform image-to-video;
- proof of final rendering quality unless the route renders the frame and records evidence.

## Claim Boundary

Allowed after gates pass:

- "The animation preset records a readable-frame policy and can apply toon, outline, and color-grade treatments the caller assigns."
- "The visual gate checks blank frames, caption occlusion, character visibility, and global-only fake motion."

Not allowed:

- "Aura3D renders Pixar-quality animations."
- "Aura3D turns still images into 3D animated episodes."
- "The preset replaces a production animation studio renderer."
- "A still-image puppet output proves the animation system works."

## Superiority (K1 · 2026-09-04)

- No superiority claimed for the preset itself: it is authoring mechanics,
  and K1 measured no preset numbers. Animation proof lives in
  `animation.md` (pointer + variant round-trip, live re-verified) and the
  K1 library receipts — not here.
