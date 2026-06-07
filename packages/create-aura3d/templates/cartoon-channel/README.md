# Aura3D Cartoon Channel Template

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
  can see a clean cartoon frame sourced from the same shot/caption contract.
- An Aura3D-rendered cartoon scene graph for visual review: moon garden,
  stylized robot characters, props, lights, camera, captions, and typed GLB
  character asset evidence through `src/aura-assets.ts`.
- A separate 2.5D concept route at `/?view=concept-2-5d&sampleTime=24`.
  This route uses `public/aura-assets/moon-garden-feature-frame.png` as source
  art, splits it into depth planes, and pans those planes at different rates.
  It is useful for explaining a still-image-to-episode workflow, but it is not
  true mesh reconstruction and cannot orbit behind the painted characters.
  Use `/?view=concept-2-5d&sampleTime=24&animateParallax=1` to keep the same
  shot/caption while the layered camera moves.
- A separate puppet-animation route at `/?view=puppet-2d&sampleTime=24`.
  This is the route that moves actual character parts: robot head bob, blinking
  eyes, broom sweep, rake/push arms, wheelbarrow roll, moon pulse, foreground
  glow, caption timing, and timeline proof. The source PNG supplies the art
  direction/backdrop; the moving actors are explicit 2D puppet overlays.

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

Run the sample episode visual test:

```bash
npm test
```

The visual test captures a review frame at:

```text
tests/reports/prompt-animation/cartoon-sample-episode.png
```

The 2.5D concept test captures three parallax positions at:

```text
tests/reports/prompt-animation/cartoon-2-5d-concept-left.png
tests/reports/prompt-animation/cartoon-2-5d-concept-center.png
tests/reports/prompt-animation/cartoon-2-5d-concept-right.png
```

The animated route for live review is:

```text
/?view=concept-2-5d&sampleTime=24&animateParallax=1
```

That route is camera/parallax motion only. To review actual character motion,
open:

```text
/?view=puppet-2d&sampleTime=24
```

Record the moving proof with:

```bash
npm run record:2.5d
```

That writes:

```text
tests/reports/prompt-animation/cartoon-2-5d-concept-animation.webm
```

Record the puppet animation with:

```bash
npm run record:puppet
```

That writes:

```text
tests/reports/prompt-animation/cartoon-2d-puppet-animation.webm
```

In that route, Aura3D's role is the episode contract, shot timing, caption
timing, proof metadata, camera/parallax plan, and optional foreground 3D
composition. The moon garden PNG is treated as concept source art. Production
2.5D would need separated character/background/foreground masks or a depth map
for cleaner parallax than rectangular layer crops.

Inside the Aura3D monorepo, that path resolves to the repo-level report
directory. In a generated standalone app, it resolves inside the generated
project.

This scaffold intentionally does not claim publish readiness from source alone.
Before closing build, route, asset, screenshot, render, or visual-quality gates,
archive the matching `npm run build`, `assets validate-cartoon`, browser
evidence, screenshot hashes, render outputs, and human or automated review
artifacts.
