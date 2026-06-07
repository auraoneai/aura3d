# Cartoon Render Preset

`CartoonRenderPreset` is the planned Aura3D 1.1 rendering policy for scoped cartoon episodes. It should make browser-rendered episode frames look intentional, readable, and reviewable without claiming feature-film or Pixar-quality output.

The preset is a production gate target, not a shortcut around assets and animation. Good lighting cannot make a still-image puppet into a real cartoon.

## Goals

- Keep characters readable against the set.
- Provide soft shadows and grounding.
- Preserve caption-safe framing.
- Avoid debug overlays in exported media.
- Support toon/cel material treatment when compatible with the asset.
- Produce visual evidence that can fail blank, occluded, overexposed, or fake-motion frames.

## Planned Runtime Inputs

The planned preset should accept:

- episode id;
- shot id;
- resolution and frame rate;
- character bounds;
- set bounds;
- caption safe area;
- reduced-motion and reduced-flash flags;
- style target such as `soft-neon-bedtime`, `bright-classroom`, or `storybook-garden`;
- debug/export mode.

## Visual Policy

Required defaults:

- key, fill, and rim lighting tuned for readable silhouettes;
- contact shadows or equivalent grounding;
- controlled bloom, not screen-washing glow;
- color grading that keeps skin, face, and mouth areas readable;
- fog/depth cues only when they do not hide action;
- stable camera framing with caption-safe lower-third space;
- no route chrome, browser UI, proof panels, debug labels, or editor handles in export mode.

Optional style controls:

- toon/cel material override;
- outline pass;
- depth haze;
- soft vignette;
- background plate treatment;
- particle accents for story beats.

## Motion And Visual Metrics

The rendering gate must report:

- nonblank frame status;
- overexposure and underexposure;
- character visibility;
- foreground/background separation;
- text/caption occlusion;
- route overlay contamination;
- local character-region motion;
- global-only motion suspicion;
- mouth-region change during dialogue.

The gate should reject a video where the only visible change is a whole-frame image translation, scale, wobble, shake, or subtitle update.

## Render Preset API (`createCartoonRenderPreset`)

The shipped surface is a small, evidence-producing helper, not a full renderer. `createCartoonRenderPreset` returns a `CartoonRenderPresetEvidence` record describing the policy that an episode route should honor.

`CartoonRenderPresetOptions` fields (all optional):

- `name` — preset/style label (defaults to `"moon-garden-cartoon"`).
- `resolution` — `{ width, height }` (defaults to `1280x720`).
- `materialStyle` — a `CartoonMaterialStyleOptions` object forwarded to `createCartoonMaterialStyle` (see below).
- `reducedMotion` — accessibility flag (defaults to `false`).
- `reducedFlash` — when set, lowers bloom from `0.18` to `0.08` (defaults to `false`).

`CartoonRenderPresetEvidence` records the resolved `lights`, `shadows` (soft + contact), `postprocess` (`bloom`, `colorGrade`, `fogDepthCue`), the resolved `materialStyle`, a `frameBudgetMs` of `16.7`, and `debugOverlaysAllowedInExport: false`.

```ts
import { createCartoonRenderPreset } from "@aura3d/rendering";

const preset = createCartoonRenderPreset({
  name: "soft-neon-bedtime",
  resolution: { width: 1280, height: 720 },
  reducedFlash: true,
  materialStyle: { treatment: "cel" }
});

// preset.postprocess.bloom === 0.08
// preset.materialStyle.treatment === "cel"
```

## Cartoon Material Style (`createCartoonMaterialStyle`)

`createCartoonMaterialStyle` produces a `CartoonMaterialStyle` describing how compatible assets should be re-shaded for cartoon readability. This is an opt-in styling intent layered onto existing materials, not a separate material implementation.

`CartoonMaterialTreatment` is one of `"preserve-pbr" | "soft-toon" | "cel" | "flat-readable"`.

`CartoonMaterialStyleOptions` fields (all optional):

- `treatment` — defaults to `"soft-toon"`.
- `outline` — outline pass eligibility; defaults to `true` only when `treatment === "cel"`, otherwise `false`.
- `rampSteps` — toon ramp quantization; defaults to `4` for `cel`, `7` otherwise.
- `saturationBoost` — defaults to `0.08`.
- `roughnessFloor` — defaults to `0.48`.

The returned `CartoonMaterialStyle` also exposes `assetOverrideMetadata`, the metadata keys a compatible asset may set to control its own treatment: `cartoonMaterialTreatment`, `toonRampSteps`, `outlineEligible`, and `preserveSkinning`.

```ts
import { createCartoonMaterialStyle } from "@aura3d/rendering";

const style = createCartoonMaterialStyle({ treatment: "cel" });

// style.outline === true
// style.rampSteps === 4
// style.assetOverrideMetadata includes "preserveSkinning"
```

## Cartoon Visual Quality Gate (`createCartoonVisualQualityReport`)

`createCartoonVisualQualityReport` evaluates one or more captured frames and returns a `CartoonVisualQualityReport`. It composes the generic `evaluateFrameVisualQuality` metrics check with cartoon-specific blockers (caption occlusion, route chrome, debug overlays, and minimum visible characters). This is the gate that fails blank, overexposed/underexposed, occluded, or empty (no visible character) frames.

`CartoonFrameVisualInput` per frame:

- `id` — frame identifier.
- `metrics` — a `FrameVisualMetrics` record (produced by `analyzeRgbaFrameVisualMetrics`).
- `characterCount` — optional visible character count for the frame.
- `captionOccluded`, `routeChromeVisible`, `debugOverlayVisible` — optional boolean blockers.

`CartoonVisualQualityOptions`:

- `thresholds` — a `FrameVisualQualityThresholds` object; defaults to the exported `defaultCartoonVisualQualityThresholds`.
- `minVisibleCharacters` — defaults to `2`.

`CartoonVisualQualityReport` returns `ok`, per-frame `frames` (`{ id, ok, failures }`), the overall `visibleCharacterCount`, and a flat `blockers` list (`"<frameId>: <failure>"` plus any character-count blocker).

The exported `defaultCartoonVisualQualityThresholds` covers `minNonDarkRatio` (blank/dark), `minSalientRatio` and `minOccupiedAreaRatio`/`minOccupiedQuadrants` (empty/centered-only), `minColorBuckets`, `maxDominantBucketRatio` and `maxFlatPixelRatio` (flat/overexposed image), and `minLocalContrastRatio` (detail present).

```ts
import {
  analyzeRgbaFrameVisualMetrics,
  createCartoonVisualQualityReport
} from "@aura3d/rendering";

const metrics = analyzeRgbaFrameVisualMetrics(rgbaPixels, width, height);

const report = createCartoonVisualQualityReport([
  { id: "establishing", metrics, characterCount: 2 }
]);

if (!report.ok) {
  console.error(report.blockers);
}
```

## Per-Region Motion (`analyzeRgbaFrameMotionRegions`)

`analyzeRgbaFrameMotionRegions` compares two consecutive RGBA frames and reports where pixels actually changed. The motion gate uses this to reject global-only motion (a whole-frame translate/scale/wobble/shake) and still-image shake: a genuine cartoon shows localized change inside a character region, not a uniform whole-frame delta.

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

- "The cartoon preset provides readable browser-rendered cartoon episode frames for the scoped 1.1 workflow."
- "The visual gate checks blank frames, caption occlusion, character visibility, and global-only fake motion."

Not allowed:

- "Aura3D renders Pixar-quality cartoons."
- "Aura3D turns still images into 3D animated episodes."
- "The preset replaces a production animation studio renderer."
- "A still-image puppet output proves the animation system works."
