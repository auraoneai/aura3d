# Animation Studio Example

`animation-studio` is the planned Aura3D 1.1 production template for short browser-rendered animation episodes. It is different from `animation-channel` and `prompt-animation-channel`: those examples are useful for source-level prompt-animation contracts, while `animation-studio` is the release target for rendered episode packages.

The 1.1 goal is not Pixar-quality automatic animation and not a magic image-to-video workflow. The goal is a repeatable TypeScript pipeline where typed assets, a show bible, a shot timeline, captions, visemes, camera direction, render output, and evidence produce a scoped animation episode package.

## Target Flow

```bash
npx create-aura3d@latest moon-garden --template animation-studio
cd moon-garden

npx @aura3d/cli@latest assets resolve "stylized rigged animation child robot" \
  --name miko \
  --profile animation-character

npx @aura3d/cli@latest assets resolve "stylized rigged animation helper robot" \
  --name luma \
  --profile animation-character

npx @aura3d/cli@latest assets resolve "stylized moon garden set" \
  --name moonGarden \
  --profile animation-set

npx @aura3d/cli@latest assets validate-animation \
  --require-license \
  --no-placeholders

npm run episode:plan
npm run episode:preview
npm run episode:render
npm run episode:package
npm run episode:review
```

These commands are the 1.1 target contract. Until the 1.1 implementation and release gates land, use the PRD as the source of truth for which commands are planned, implemented, or still missing.

## Required Typed Assets

The target Moon Garden episode uses:

- `assets.miko`: first recurring animation character.
- `assets.luma`: second recurring animation character.
- `assets.moonGarden`: the episode set.
- Optional typed dialogue, SFX, and music audio assets.

Character assets should be rigged GLB/glTF models when possible. A segmented 2D puppet fallback is allowed only when it is explicitly declared, independently articulated, and passes the motion gate. A single generated still image is not a valid character rig.

## Runtime Pattern

Episode routes still use normal Aura3D code:

```ts
import {
  createAuraApp,
  game,
  installShotPlayback,
  lights,
  model,
  scene
} from "@aura3d/engine";
import { assets } from "./aura-assets";
import { episodePlayback } from "./episode";

const app = createAuraApp("#app", {
  scene: scene()
    .add(model(assets.miko).runtime(game.runtimeNode("miko", { tags: ["animation-character"] })))
    .add(model(assets.luma).runtime(game.runtimeNode("luma", { tags: ["animation-character"] })))
    .add(model(assets.moonGarden).runtime(game.runtimeNode("moonGarden", { tags: ["animation-set"] })))
    .add(lights.studio({ intensity: 1.2 }))
});

installShotPlayback(app, episodePlayback);
```

The route proof for 1.1 must show active shot, active caption, active viseme, active gesture, character asset ids, set asset id, frame count, route errors, nonblank status, and render-readiness state.

## Package Output

The target package folder is:

```text
dist/episodes/moon-garden-001/
  episode.webm
  episode.mp4
  thumbnail.png
  captions.vtt
  captions.srt
  metadata.json
  prompt-animation-evidence.json
  route-proof.json
  asset-provenance.json
  render-manifest.json
  visual-acceptance.json
  review-package.md
```

`episode.mp4` is optional for the first 1.1 gate if the runtime only supports WebM or PNG-sequence fallback. `episode.webm`, captions, thumbnail, metadata, provenance, route proof, render manifest, visual acceptance, and review package are mandatory for the scoped target.

## What Counts As Animation

Acceptable 1.1 evidence:

- rigged GLB character clips driven by a shot timeline;
- inspected GLB morph targets or explicit mouth cards driven by dialogue cues;
- segmented puppet motion where head, torso, arms, hands, legs, mouth, or props move independently;
- camera moves that match shot instructions;
- rendered video or frame sequence with changing character-region pixels, not only whole-frame motion.

Rejected evidence:

- a single generated still image with subtitles;
- CSS pan, zoom, wobble, shake, or fake parallax applied to one flat plate;
- characters and background moving as one layer;
- route proof marked `notTrue3D: true`;
- `sourceOnly: true` render plans presented as publish-ready;
- in-memory encoder summaries presented as playable video.

Generated images can still be useful as concept art, thumbnails, style references, background plates, or texture sources. They do not become real Aura3D animation until typed assets, rigs or segmented parts, timelines, visemes, render output, and evidence drive the episode.

## Review Criteria

Before claiming a animation-studio episode is publish-ready:

- both characters are visible and readable;
- the set has depth and stable framing;
- at least four shots have distinct camera or blocking changes;
- at least two shots show independent character, arm, mouth, or prop motion;
- dialogue shots have visible mouth movement;
- captions are readable and timed;
- exported video contains no route chrome, browser UI, debug overlays, or proof panels;
- `visual-acceptance.json` records motion and visual checks;
- `review-package.md` records reviewer notes and approval status.

## Related Docs

- `docs/workflows/animation-episode-production.md`
- `docs/rendering/animation-render-preset.md`
- `docs/api/prompt-animation.md`
- `docs/api/auravoice-bridge.md`
- `docs/api/assets.md`
