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
