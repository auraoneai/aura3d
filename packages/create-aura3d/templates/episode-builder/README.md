# Aura3D Episode Builder Template

> **Status: example / experimental.** The flagship cartoon pipeline is the
> [`cartoon-studio`](../cartoon-studio) template. This template is a
> contract/example only.

This template demonstrates a guided prompt-to-episode builder on top of the
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
- Episode format choices for short-form, standard, pilot, educational, and music-video structures.
- Wizard state that points at the compiled episode plan, beats, characters, and publish-evidence status.
- A compact builder panel for route tests and agent inspection.

Replace primitive characters with typed GLB assets by running:

```bash
npx @aura3d/cli@latest assets add ./assets/miko.glb --name miko
npx @aura3d/cli@latest assets add ./assets/luma.glb --name luma
npx @aura3d/cli@latest assets validate-cartoon
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
archive the matching `npm run build`, `assets validate-cartoon`, browser
evidence, screenshot hashes, render outputs, and human or automated review
artifacts.
