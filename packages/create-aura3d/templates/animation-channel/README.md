# Aura3D Animation Channel Template

> **Status: example / experimental.** The flagship animation pipeline is the
> [`animation-studio`](../animation-studio) template. This `animation-channel`
> template is a contract/example demonstrating the AuraVoice-to-Aura3D handoff.
> Its release-facing route is `src/sample-episode-visual.ts`. The rejected
> `notTrue3D` puppet/parallax experiments are quarantined under
> [`src/experimental/`](./src/experimental) as negative-regression fixtures
> only and are not wired into any release-facing route or script.

This template demonstrates the AuraVoice-to-Aura3D prompt-animation contract.

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
- A deterministic sample episode visual layer at `/?sampleTime=24` so reviewers
  can see a clean animation frame sourced from the same shot/caption contract.
- An Aura3D-rendered animation scene graph for visual review: moon garden,
  stylized robot characters, props, lights, camera, captions, and typed GLB
  character asset evidence through `src/aura-assets.ts`.
- A release-facing route that deliberately ignores the rejected
  `concept-2-5d`, `puppet-2d`, and `image-puppet` query views. Those earlier
  experiments remain only as negative evidence: still-image parallax, flat
  cutout motion, and `notTrue3D` proof are not accepted as Aura3D 1.1 animation
  animation readiness.

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

Run the sample episode visual test:

```bash
npm test
```

The visual test captures a review frame at:

```text
tests/reports/prompt-animation/animation-sample-episode.png
```

Run the failed-puppet negative gate:

```bash
npm run test:negative-failed-puppets
```

That gate proves the old `?view=concept-2-5d`, `?view=puppet-2d`, and
`?view=image-puppet` query strings fall back to the supported sample episode
route and do not expose release-facing puppet/parallax proof objects. The
rejected experiment modules themselves live under `src/experimental/` (see
`src/experimental/README.md`) and are never imported by the app.

Do not use `tests/reports/prompt-animation/animation-image-puppet-animation.webm`
or the old 2.5D/cutout routes as product evidence. Aura3D's accepted animation
animation proof must come from typed assets or explicitly segmented rigs with
independent body-region motion, caption timing, visible mouth movement, and
render/package evidence.

This scaffold intentionally does not claim publish readiness from source alone.
Before closing build, route, asset, screenshot, render, or visual-quality gates,
archive the matching `npm run build`, `assets validate-animation`, browser
evidence, screenshot hashes, render outputs, and human or automated review
artifacts.
