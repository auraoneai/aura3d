# Aura3D Animation Studio Template

This template demonstrates a compact animation production workspace on top of the
AuraVoice-to-Aura3D prompt-animation contract.

It uses:

- `compilePromptEpisodePlan(...)` for prompt-to-episode planning.
- Optional typed GLB characters from `./src/aura-assets` with primitive runtime fallbacks until assets are added.
- `createShotPlaybackPlan(...)` plus `installShotPlayback(...)` so `app.onFrame` updates nodes without recreating the app.
- `createAuraVoiceBridgePackage(...)`, `validateAuraVoiceBridgePackage(...)`, `collectPromptAnimationEvidence(...)`, and `evaluatePromptAnimationPublishReadiness(...)` for source-level AuraVoice/Aura3D handoff declarations.
- Caption HUD and caption timing proof metadata.
- Render queue metadata and three deterministic screenshot fixture records.
- Child-safe, reduced-motion, and high-contrast accessibility proof defaults.
- Primitive-mouth and typed-GLB viseme examples.
- Phoneme/viseme/dub source proof metadata for stable shot, storyboard, caption, line, and word timing ids.
- A source-level studio panel with shot, dialogue, and render timeline tracks.
- Asset library slot metadata for required characters and optional props.
- Render pipeline metadata that agents can inspect before running full browser evidence.
- Template-local episode package scripts that write a deterministic `dist/episodes/moon-garden-001` review folder.

Replace primitive characters with typed GLB assets by running:

```bash
npx @aura3d/cli@latest assets add ./assets/miko.glb --name miko
npx @aura3d/cli@latest assets add ./assets/luma.glb --name luma
npx @aura3d/cli@latest assets validate-animation
```

Then import `assets.miko` and `assets.luma` from `src/aura-assets.ts` and pass them to `model(assets.miko)` and `model(assets.luma)`.

The GLB path must keep typed assets:

```ts
import { model } from "@aura3d/engine";
import { assets } from "./aura-assets";

model(assets.miko);
```

Do not replace this with a string asset id or a raw loader.

This scaffold intentionally does not claim publish readiness from source alone.
Before closing build, route, asset, screenshot, render, or visual-quality gates,
archive the matching `npm run build`, `assets validate-animation`, browser
evidence, screenshot hashes, render outputs, and human or automated review
artifacts.

## Episode package scripts

The template includes the 1.1 Animation Studio command lane:

```bash
npm run episode:plan
npm run episode:preview
npm run episode:render
npm run episode:package
npm run episode:review
npm run episode:verify
```

The package is written to:

```text
dist/episodes/moon-garden-001/
  thumbnail.png
  captions.vtt
  captions.srt
  metadata.json
  route-proof.json
  asset-provenance.json
  render-manifest.json
  visual-acceptance.json
  review-package.md
```

If no browser video encoder adapter is available, `episode:render` writes
`episode.png-sequence-fallback.json` and deterministic PNG frame placeholders
under `frames/`. That fallback proves the package/review workflow, but it is not
publish-ready animation video evidence. A release build must attach a real
WebM/MP4 encoder, use typed character/set assets, and pass human visual review
before claiming the episode is ready to publish.
