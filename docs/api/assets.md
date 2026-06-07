# Aura3D typed asset readiness

Aura3D projects should register every GLB, glTF, texture, environment, and audio file before code references it. The safe path is:

```bash
npx @aura3d/cli@latest assets add ./assets/fighter.glb --name fighter
```

The CLI writes:

- `aura.assets.json`: the project asset manifest.
- `public/aura-assets/*`: hashed deployable files.
- `src/aura-assets.ts`: typed asset references for `model(assets.fighter)`.

Do not use string model ids or invented URLs in agent-authored code.

For release assets, keep provenance attached at registration time:

```bash
npx @aura3d/cli@latest assets add ./assets/fighter.glb --name fighter \
  --license CC0-1.0 \
  --author Quaternius \
  --source-url https://quaternius.com/packs/universalbasecharacters.html \
  --source-family Quaternius
```

Generated typed asset metadata includes the local source path, hashed output,
checksum, detected animation clips, skeleton diagnostics, morph targets, and
provenance fields when they are available.

## Inspect before registering

Use inspection when evaluating an asset before adding it to a project:

```bash
npx @aura3d/cli@latest assets inspect ./assets/fighter.glb --animation --skeleton --morphs --license
```

Inspection reports detected bounds, materials, animations, skeletons, morph
targets, textures, dependencies, file size, provenance hints from glTF extras,
and warnings without copying the asset into `public/aura-assets`.

## Strict release validation

Use strict validation before claiming a template, showcase, or launch route uses
real production assets:

```bash
npx @aura3d/cli@latest assets validate --no-placeholders --require-license
```

The strict flags add blocking checks for:

- Placeholder asset ids, paths, or URLs such as `placeholder`, `dummy`, `mock`,
  `todo`, or `replace-me`.
- Missing license/provenance evidence.
- License text that is still marked unknown, unverified, candidate, or needing
  confirmation.

Projects that keep provenance in a launch evidence sidecar can pass it to the
same validator:

```bash
npx @aura3d/cli@latest assets validate \
  --no-placeholders \
  --require-license \
  --provenance assets/source/aura-clash-launch-asset-evidence.json
```

The sidecar must match assets by `assetKey` or `id` and include source/license
evidence such as `license`, `licenseNote`, `sourcePath`, `publicUrl`, `hash`, or
`provenance.sourcePack`.

## Game readiness

Use the game readiness report before building a playable route:

```bash
npx @aura3d/cli@latest assets validate-game --profile fighting-character
```

When sourcing fighters from the catalog, search and resolve with the same
profile:

```bash
npx @aura3d/cli@latest assets search "animated humanoid fighting character" \
  --profile fighting-character \
  --json

npx @aura3d/cli@latest assets resolve "animated humanoid fighting character" \
  --name fighter \
  --profile fighting-character
```

`--profile fighting-character` maps the prompt to animated, redistributable GLB
candidates with a browser-sized triangle budget. `assets resolve` keeps the
selected candidate's source URL, license, author/attribution, and source family
in `aura.assets.json`, so release evidence can explain exactly where the typed
asset came from.

The fighting-character profile is allowed to return no usable candidate. That
is the correct result when the catalog only finds static props, aircraft,
spiders, IP-risk characters, unlicensed models, non-humanoid sculpts, or assets
without animation metadata. In that case the CLI should emit rejected candidates
and rejection reasons instead of fabricating a typed fighter. Treat this as a
stop condition:

```bash
npx @aura3d/cli@latest assets search "animated humanoid fighting character" \
  --profile fighting-character \
  --json
```

Acceptable outcomes:

- `candidates.length > 0` and each usable candidate is marked suitable for the
  requested profile.
- `candidates.length === 0` with non-empty `rejectedCandidates` and
  `rejectionReasons` explaining why no production-ready fighter was selected.

Do not work around a no-match result by resolving an unrelated object or by
using primitives as release-facing fighter art.

When a showcase keeps old candidate assets in the manifest for audit history,
validate the actual shipping set explicitly:

```bash
npx @aura3d/cli@latest assets validate-game \
  --profile fighting-character \
  --asset fighter \
  --asset arena \
  --output launch-evidence/assets-validate-game.json
```

`--asset` can be repeated or passed as a comma-separated list. The filter does
not delete manifest entries; it scopes the readiness report to the asset ids
that the route actually ships. Use this for launch evidence when experimental
catalog candidates remain checked in but are not part of the active route.

The report checks the typed manifest and flags:

- Missing `aura.assets.json`.
- Missing generated `src/aura-assets.ts`.
- Missing hashed output files.
- Hash mismatches.
- GLB/glTF dependency gaps.
- Model assets without bounds.
- Model assets without named materials.
- Models larger than the browser-friendly payload budget.
- Missing animation clips for character-heavy game showcases.
- Missing license/provenance evidence when `--require-license` is passed.
- Placeholder assets when `--no-placeholders` is passed.

`validate-game` is a source and packaging gate. It does not replace visual QA, animation playback review, browser screenshots, or controller feel testing.

## Cartoon readiness

Use the cartoon readiness report for prompt-to-episode and AuraVoice workflows:

```bash
npx @aura3d/cli@latest assets validate-cartoon
```

The report checks that the project has typed models, set/prop readiness, animation clip availability, and audio registration signals. It warns when the episode can only be transform-animated instead of acted with skeletal or pose clips.

For AuraVoice projects, local audio files can be registered with:

```bash
npx @aura3d/cli@latest assets add ./assets/narration.wav --name narration --type audio
```

The animation timeline should still reference AuraVoice manifests by id, timecode, dialogue line, viseme, beat, and shot.

Use the same strict flags for release proofs:

```bash
npx @aura3d/cli@latest assets validate-cartoon \
  --no-placeholders \
  --require-license
```

## Asset evidence

The readiness commands emit JSON with:

- `schema`: report schema.
- `profile`: `game` or `cartoon`.
- `summary`: model, texture, audio, and animation counts.
- `assets`: per-asset readiness records.
- `provenance`: per-asset source/license evidence when available.
- `skeleton`: skin and joint metadata for model assets.
- `morphTargets`: morph/blendshape names for model assets.
- `placeholderFree` and `licenseVerified`: release-gate booleans.
- `failures`: blocking packaging issues.
- `warnings`: quality or production risks.

Use this JSON in launch evidence, PRD checklists, and deploy gates. Only mark a visual-quality task complete after the route has actual visual proof.

## 1.0.5 animation and editor evidence

Aura3D 1.0.5 animation, editor, and visual scripting work needs stronger asset
evidence than a static model route. Character, animation, cartoon, and editor
assets must carry enough metadata for agents to choose real clips and morph
targets without guessing.

Before writing code that references a character clip, skeleton, or blendshape,
inspect the source file and archive the report:

```bash
npx @aura3d/cli@latest assets inspect ./assets/fighter.glb --animation --skeleton --morphs --license
npx @aura3d/cli@latest assets add ./assets/fighter.glb --name fighter
npx @aura3d/cli@latest assets validate --no-placeholders --require-license
```

If the current CLI uses a different flag name, use the established equivalent.
The release requirement is the data and evidence, not a specific spelling.

For every typed model used in an animation, editor, visual scripting, or
showcase release claim, the evidence should include:

- Generated typed name, such as `assets.fighter`.
- Local source path or catalog source URL.
- License, author, and attribution fields.
- SHA-256 checksum or equivalent stable content hash.
- Bounds, material count, texture count, triangle count, and file size.
- Skin count and skeleton bone names for skinned characters.
- Named animation clips, durations, track counts, and root-motion policy.
- Required clip coverage for the template or showcase.
- Morph target names for viseme or facial-animation routes.
- Diagnostics for missing clips, missing bones, missing morph targets, missing
  license metadata, placeholder ids, and broken generated registrations.

Safe TypeScript examples must use the generated typed ref:

```ts
import { createAuraApp, game, model, scene } from "@aura3d/engine";
import { assets } from "./aura-assets";

const app = createAuraApp("#app", {
  scene: scene().add(
    model(assets.fighter).runtime(game.runtimeNode("player", { tags: ["fighter", "typed-glb"] }))
  )
});
```

Do not write:

```ts
model("fighter");
model("/assets/fighter.glb");
model("replace-with-real-fighter");
```

Template and showcase release evidence should fail when a public safe API
example uses a string asset id, a placeholder id, a missing file, or an asset
without source/license evidence.
