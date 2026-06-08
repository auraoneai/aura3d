# Animation Episode Production Workflow

This workflow describes the planned Aura3D 1.1 path from a animation idea to a reviewed episode package. It is intentionally narrower than a full animation studio: one short episode, typed assets, browser playback, render output, captions, evidence, and human review.

Aura3D does not turn any single image into a believable 3D episode. Generated images may guide the look, but publish-ready animation must be driven by typed assets, rigs or segmented puppet parts, timelines, dialogue, visemes, captions, render output, and visual/motion gates.

## 1. Show Bible

Define the reusable show context:

- series title;
- characters;
- set;
- art direction;
- motion rules;
- dialogue style;
- safety/accessibility rules;
- target runtime and resolution.

The 1.1 flagship target is `Moon Garden Helpers`: two recurring characters, one Moon Garden set, and a 45-60 second episode.

## 2. Typed Asset Intake

Resolve or add assets before writing scene code:

```bash
npx @aura3d/cli@latest assets resolve "stylized rigged animation child robot" --name miko --profile animation-character
npx @aura3d/cli@latest assets resolve "stylized rigged animation helper robot" --name luma --profile animation-character
npx @aura3d/cli@latest assets resolve "stylized moon garden set" --name moonGarden --profile animation-set
npx @aura3d/cli@latest assets validate-animation --require-license --no-placeholders
```

The asset gate should reject:

- unlicensed or missing-provenance files;
- placeholder paths;
- same-model character duplication presented as distinct cast;
- static characters unless an explicit segmented fallback exists;
- missing mouth/blendshape/fallback readiness;
- set assets without usable bounds, scale, framing, or material evidence.

## 3. Episode Plan

Generate or author:

- episode id and title;
- target duration, frame rate, and resolution;
- beats;
- shot list;
- character blocking;
- dialogue lines;
- caption cues;
- viseme cues;
- performance cues;
- render queue.

The plan is source evidence only. It is not animation proof until the browser route plays it and render/package evidence exists.

## 4. Browser Preview Route

The preview route mounts one Aura app and uses public engine APIs:

- `createAuraApp(...)`;
- typed `model(assets.x)` refs;
- `game.runtimeNode(...)` for mutable character/set nodes;
- `installShotPlayback(...)` or the 1.1 episode playback equivalent;
- caption and viseme sampling;
- route proof exposed on `window.__AURA3D_ANIMATION_EPISODE_PROOF__`.

The route must support play, pause, scrub, shot jump, caption toggle, mute, reduced motion, reduced flash, and review markers.

## 5. Motion And Performance

Every episode needs visible authored motion. The motion gate should sample rendered frames and fail global-only movement.

Required motion evidence:

- character body or limb movement during action beats;
- mouth movement during dialogue beats;
- camera movement only when the shot timeline asks for it;
- no debug overlays or route panels in exported frames;
- frame hashes that change because local character regions move, not because the whole still image shifts.

Rejected motion:

- one generated image panned or zoomed;
- CSS wobble on a flat poster;
- subtitles changing over a static frame;
- a background and characters moving as a single layer;
- an output marked `notTrue3D: true` or `sourceOnly: true`.

## 6. Audio, Captions, And Visemes

AuraVoice or another timing source owns dialogue, audio, caption, phoneme, and viseme timing. Aura3D owns scene assembly, character performance, camera choreography, rendering, screenshots, and package evidence.

Label lip-sync mode honestly:

- `phoneme-aligned` for real phoneme/word timing;
- `blendshape-lip-sync` for inspected GLB morph targets;
- `primitive-mouth-card` for explicit fallback mouth shapes;
- `amplitude-only` for audio-level heuristics;
- `missing-mouth-motion` when no rendered mouth movement exists.

Do not market amplitude-only mouth openness as high-quality lip sync.

## 7. Render And Package

The planned 1.1 render step writes:

```bash
npm run episode:render
npm run episode:package
```

The package must include:

- playable video or an explicitly scoped PNG-sequence fallback;
- thumbnail captured from actual route state;
- VTT and SRT captions;
- metadata JSON;
- prompt-animation evidence;
- route proof;
- asset provenance;
- render manifest;
- visual acceptance report.

In-memory encoder summaries are useful for unit tests. They are not publish-ready media artifacts.

## 8. Review

The review step writes:

```bash
npm run episode:review
```

The review package should include representative frames, route proof, package manifest, visual/motion summaries, caption timing, asset provenance, known limitations, and a place for named reviewer approval.

Human review is required before public copy calls a 1.1 episode visually approved.

## 9. Publish-Ready Definition

An episode is publish-ready only when:

- typed assets validate;
- the browser route plays the complete shot timeline;
- characters and mouths visibly move;
- captions are timed and exported;
- a playable video or scoped fallback exists;
- thumbnail and metadata exist;
- visual and motion gates pass;
- review artifacts exist;
- docs and public copy make no Pixar, image-to-video, or full-studio overclaims.

## 10. Failure Handling

If the output looks like `tests/reports/prompt-animation/animation-image-puppet-animation.webm`, treat that as failure evidence. The correct next step is not better marketing language. The correct next step is to improve assets, rigging, performance mapping, shot playback, render capture, or motion gates until the episode shows real local motion.
