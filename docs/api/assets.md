# Aura3D typed asset readiness

> **Catalog reality (read first).** The federated index is large, but "large" is not
> "high quality." For props and set pieces the catalog is reliable. For *acting characters*
> it is not: most catalog "characters" are static props, T-pose meshes with no skeleton,
> non-humanoid sculpts, or rigs whose only embedded clip is a 2 cm idle sway or a jaw-only
> lip-flap. **Arbitrary prompt characters are NOT guaranteed to be production-quality.** The
> `animation-studio` cast resolver therefore grades and probes every character candidate and
> rejects the unusable ones rather than fabricating a typed cast member. See
> [Character catalog reality](#character-catalog-reality) below for exactly what it can and
> cannot reliably provide.

Aura3D projects should register every GLB, glTF, texture, environment, and audio file before code references it. There are two paths, both producing the same typed manifest:

**Resolve from the federated index** (when a prompt names a real object) — the CLI runs live search
against a hosted index of public GLB/glTF sources, when that service is reachable (primary adapter
`createAuraIndexAdapter` from `@aura3d/asset-index`; results are candidates to check):

```bash
npx @aura3d/cli@latest assets search "battle-worn knight helmet"
npx @aura3d/cli@latest assets resolve "battle-worn knight helmet" --name helmet
```

**Add a file you already have:**

```bash
npx @aura3d/cli@latest assets add ./assets/fighter.glb --name fighter
```

The CLI writes:

- `aura.assets.json`: the project asset manifest.
- `public/aura-assets/*`: hashed deployable files.
- `src/aura-assets.ts`: typed asset references for `model(assets.fighter)`.

Do not use string model ids, raw `.glb`/`.gltf` URLs, invented URLs,
`GLTFLoader`, or `three` imports in agent-authored public examples. Safe route
code imports generated typed assets and passes them to `model(assets.name)`.

For release assets, keep provenance attached at registration time:

```bash
npx @aura3d/cli@latest assets add ./assets/fighter.glb --name fighter \
  --license CC0-1.0 \
  --license-name "CC0 1.0 Universal" \
  --license-url https://creativecommons.org/publicdomain/zero/1.0/ \
  --author Quaternius \
  --source-page https://quaternius.com/packs/universalbasecharacters.html \
  --download-url https://quaternius.com/files/universal-base-characters.zip \
  --source-url https://quaternius.com/packs/universalbasecharacters.html \
  --source-family Quaternius
```

Generated typed asset metadata includes the local source path, hashed output,
checksum, source page, download URL, license id/name/URL/raw variant, author,
acquisition timestamp, detected animation clips, skeleton diagnostics, morph
targets, scene hierarchy counts, and provenance fields when they are available.

## Inspect before registering

Use inspection when evaluating an asset before adding it to a project:

```bash
npx @aura3d/cli@latest assets inspect ./assets/fighter.glb --animation --skeleton --morphs --license
```

Inspection reports detected bounds, materials, animations, skeletons, morph
targets, textures, dependencies, file size, provenance hints from glTF extras,
and warnings without copying the asset into `public/aura-assets`.

## Strict release validation

Use the strict validation command before claiming a template, showcase, or
launch route uses release-validated typed assets:

```bash
npx @aura3d/cli@latest assets validate --source --release
```

`--release` implies `--no-placeholders` and `--require-license`, promotes
warnings to failures, and scans source by default. `--source` can also take an
optional file or directory:

```bash
npx @aura3d/cli@latest assets validate --source apps/showcase-turbo-drift-circuit --release
```

The strict release gate blocks:

- Placeholder asset ids, paths, or URLs such as `placeholder`, `dummy`, `mock`,
  `todo`, or `replace-me`.
- Missing license/provenance evidence.
- Missing durable release provenance: source page, download URL, license name or
  id, license URL, author or attribution, and acquisition timestamp.
- License text that is still marked unknown, unverified, candidate, or needing
  confirmation.
- raw `model("string-id")` or string asset ids;
- raw GLB/glTF URLs;
- `unsafeModelUrl(...)` in release-facing examples;
- `GLTFLoader` or `three` imports in public root examples;
- primitive-only primary character, vehicle, world, product, or environment;
- temp-path provenance such as `/var/folders/.../T/aura3d-resolve-*`;
- duplicate asset hashes without an allowlist explaining intentional reuse.

The source validation report includes `typedAssetUsages` and `filesByAsset`, so
reviewers can see which source files use each generated `assets.x` entry. Keep
that JSON output with release evidence when a route's README or route-health
file claims specific primary assets.

The showcase browser tests also enforce CSS/DOM particle stand-in guards and
visible mode-change pixel deltas for routes claiming Aura particle rendering.

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

## Mandatory 3D asset, Meshy optimization & game-scene guardrails

1. **No primitive-box characters, vehicles, or hero props ("no stick-figure humans or box cars")**:
   - Never assemble characters, athletes, enemies, vehicles, aircraft, trees, or architectural landmarks out of `primitives.box`, `primitives.sphere`, or `primitives.cylinder` — keep every silhouette, look, lighting, and shadow readable with real 3D geometry.
   - Every character, vehicle, creature, weapon, and landmark must mount a real 3D GLB via `model(assets.<name>, { targetMaxDimension, role })` from `src/aura-assets.ts`. If the catalog lacks a required 3D model, generate a bespoke PBR 3D model with Meshy (`meshy`) and admit it via `aura3d assets import-meshy`.
   - Primitives (`primitives.plane`, `primitives.box`, `primitives.cylinder`, `primitives.torus`) are reserved strictly for ground/court surfaces, field lines, UI rings/reticles, laser beams, and invisible physics colliders.
2. **Always decimate & compress Meshy 3D GLBs before admission (`<= 20,000` vertices, `<= 2 MB`, 16-bit indices)**:
   - Raw Meshy exports often contain `200,000–1,750,000` vertices and `20–65 MB` of uncompressed 4K PNG textures, which stall main-thread glTF parsing and exhaust GPU memory when multiple models load in one scene.
   - Every generated Meshy GLB must be simplified (`MeshoptSimplifier` to `<= 20,000` vertices for props/vehicles, 16-bit `Uint16Array` indices, de-interleaved `byteStride === 0` buffers) and have its textures compressed to `<= 1024x1024` (`~0.5–2.0 MB` per GLB) before being admitted into `public/aura-assets/` so PBR palette, contrast, and reflection stay responsive.
3. **Always use canonical typed asset manifest refs (`hash` required)**:
   - The production glTF bridge requires `createAssetProvenance(node.asset).source === "typed-aura-assets-manifest"`, which requires a valid 64-character `sha256-...` `hash` and `public/aura-assets/...` provenance from `aura.assets.json` / `src/aura-assets.ts`.
   - Never omit `hash` in custom `defineAssets(...)` declarations and never place unhashed duplicate GLBs in route-local `apps/<route>/public/aura-assets/` that collide with root `public/aura-assets/`.
4. **Boot directly into live 60 FPS 3D gameplay (no blocking start modals)**:
   - Never hide the 3D canvas behind an opaque full-screen HTML start menu, character select modal, or briefing overlay on initial page load, and never require query parameters (`?autoplay=1`, `?demo=1`, `?play=1`) for the scene to animate.
   - Every game route must start in active 60 FPS gameplay on Frame 1 with an intelligent AI autopilot/demo controller that plays the game autonomously and yields instant manual control on the first keyboard (`keydown`), pointer, touch, or gamepad input. Keep mode, stage, camera, and roster selectors in a compact, non-blocking top HUD bar, and always call `button.blur()` after button clicks so `Space` or `Enter` gameplay keys never re-trigger focused HUD buttons.
5. **Mutate node handles instead of calling `app.setScene()` on every restart**:
   - Do not call `app.setScene()` when restarting a round, hole, or bout on the same stage/world; tearing down and remounting the scene disposes live GPU resources and aborts in-flight GLB loads. Track a scene signature (`stageId` / `worldId`) and reset positions, visibility, and animations through runtime node handles (`app.nodes.require(...)`).

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

`validate-game` is an asset and packaging gate. It does not scan route source
for unsafe model strings, prove browser input, replace visual QA, prove
animation playback, replace screenshots, or judge controller feel.

## Animation readiness

Use the animation readiness report for prompt-to-episode and AuraVoice workflows:

```bash
npx @aura3d/cli@latest assets validate-animation
```

The report checks that the project has typed models, set/prop readiness, animation clip availability, and audio registration signals. It warns when the episode can only be transform-animated instead of acted with skeletal or pose clips.

For AuraVoice projects, local audio files can be registered with:

```bash
npx @aura3d/cli@latest assets add ./assets/narration.wav --name narration --type audio
```

The animation timeline should still reference AuraVoice manifests by id, timecode, dialogue line, viseme, beat, and shot.

Use the same strict flags for release proofs:

```bash
npx @aura3d/cli@latest assets validate-animation \
  --no-placeholders \
  --require-license
```

In the working `animation-studio` flow, the cast is normally resolved per-scene through
`animation-scene cast add` (see below), not as a fixed manifest. When you do pre-stage assets for a
release validation, the report still expects at least two **distinct** typed character
assets and one typed set. The names and queries are arbitrary — they follow the prompt, not a fixed
moon-garden cast:

```bash
npx @aura3d/cli@latest assets resolve "rusty industrial robot" \
  --name rusty \
  --profile animation-character

npx @aura3d/cli@latest assets resolve "sleek white android robot" \
  --name sleek \
  --profile animation-character

npx @aura3d/cli@latest assets resolve "metal space station interior" \
  --name stationSet \
  --profile animation-set

npx @aura3d/cli@latest assets validate-animation \
  --require-license \
  --no-placeholders
```

The readiness expectation is stricter than "the manifest has assets." The report must be able to explain:

- character distinctness, source, license, author, checksum, and deploy path;
- whether each character has skeletal animation clips, retargetable humanoid metadata, or an explicitly declared segmented-puppet fallback;
- whether mouth movement can use inspected GLB morph targets, primitive mouth cards, or only amplitude-based fallback timing;
- whether the set has usable scale, bounds, framing, walkability, and material/texture evidence;
- whether dialogue, SFX, and music assets are typed audio files or explicitly missing from the publish scope.

Do not work around failed animation asset validation with a generated still image, raw URL, primitive-only character, or unlicensed placeholder. Still-image puppet output may be kept only as negative evidence for a motion gate, not as a publish-ready asset path.

## Character catalog reality

A generated `animation-studio` scene (`animation-scene new --prompt "..." --full`) binds each
prompt-derived character to the curated, render-ready **A-grade humanoid cast** that ships with the
template (neutral `cast-a` / `cast-b` rigs — **not** the moon-garden `miko`/`luma` fixture), so the
document renders immediately. You then *override* any cast slot from the live catalog with
`animation-scene cast add --id <id> --query "..."`, or from a local rig with
`animation-scene cast add --id <id> --file <path.glb>` (both backed by `scripts/resolve-asset.ts`).
Because catalog metadata routinely lies — a GLB can advertise embedded textures and five
animations and still be a white-ghost T-pose whose clips only twitch the root and jaw — the
resolver does **not** trust metadata. After downloading + inspecting each candidate it runs
three independent gates and writes a **CHARACTER RESOLVER REPORT** to
`dist/scene/<id>.resolver-report.json`.

### The three gates

1. **Rig grade (A / B / C / D)** — derived from the humanoid bone mapping
   (`inferHumanoidRigDetailed` from `@aura3d/animation`), joint count, and the presence of the
   arm/leg chains. Uses the engine's `gradeRig` (RigQuality) when that symbol is available at
   runtime, otherwise an inline bone-count/humanoid heuristic with the same signals.
   - **A** — full humanoid (spine + arms + legs + head, ~20+ joints): body acting retargets cleanly.
   - **B** — humanoid torso + arms, sparse/partial legs: upper-body acting good, locomotion iffy.
   - **C** — minimal/partial rig: crude motion only; body acting unreliable.
   - **D** — no skeleton or no humanoid mapping: **rejected** (cannot retarget body acting).
2. **Render probe** (`scripts/asset-render-probe.ts`) — actually renders the candidate against a
   neutral grey stage and measures body chroma/detail. Malformed exports that come out as a flat
   white silhouette are **rejected** (this is the real "does it look right" check; broken/missing
   textures and bad bindings fail here).
3. **Motion probe** (`scripts/asset-motion-probe.ts`) — reads each embedded clip's sampler data
   straight off the GLB BIN chunk (no synthesis), measures real per-channel **amplitude**, and
   works out which humanoid bones each clip drives. Clips that only animate the root, the
   mouth/jaw, or a tiny idle sway are scored as **not useful**. Each useful clip is mapped onto
   the standard performance vocabulary (`idle / talk / gesture / point / nod / walk / run / react`)
   and given a 0–100 quality score (kept on `ResolvedAsset.clipScores`).

### Reject criteria (a candidate is rejected when any holds)

- no skeleton, or no humanoid bone mapping (rig grade **D**);
- the render probe fails (white ghost / broken or missing textures / unusable bind);
- a dialogue scene is requested but the rig animates no mouth/face;
- (upstream, before grading) not self-contained (external textures), bad scale/bounds, or over the
  triangle budget.

Unusable license is surfaced per row (the catalog search already filters to
commercially-usable results; the row keeps the license string so a non-redistributable model is
visible and can be excluded).

### Minimum viable acting pack and library fallback

A character is only "self-acting" if its **own** embedded clips cover the minimum viable acting
pack: **idle**, **talk-or-gesture**, **walk**, and **react**. When that pack is incomplete the
character is still accepted (assuming it passed the rig + render gates) but marked
**`libraryFallback: true`** — the shared retargeted clip library (`public/clip-library/*`,
built by `scripts/build-clip-library.ts`) supplies its motion. This is recorded honestly in the
resolver report rather than hidden. In practice **most** catalog rigs land here: a clean humanoid
mesh is common; a clean humanoid mesh that *also* ships idle + talk + walk + react clips is rare.

### What the catalog can and cannot reliably provide

| Want | Reliable from catalog? |
| --- | --- |
| Static props / set pieces | **Yes** — self-contained textured GLBs are common. |
| A rigged humanoid mesh (grade A/B) | **Sometimes** — depends entirely on the prompt; many queries return only props. |
| Embedded, body-moving acting clips (idle/talk/walk/react) | **Rarely** — this is why motion almost always comes from the shared library. |
| A jaw/viseme-capable face for lip-sync | **Rarely** — free catalog characters seldom rig the mouth; dialogue mouth motion usually relies on morph/amplitude fallback. |
| A guaranteed high-quality cast for an *arbitrary* prompt | **No.** Quality is prompt-dependent and not guaranteed. Prefer a curated/uploaded rig for A-grade output. |

The resolver report (`dist/scene/<id>.resolver-report.json`) records, per candidate: `source`,
`title`, `license`, `url`, `rigGrade`, `clipCount`, `usefulClips`, `renderPass`, `motionPass`,
`hasMouth`, `accepted`, `libraryFallback`, and `rejectReason`. Treat it as the honest, auditable
answer to "where did this cast member come from and how good is it" — and never present a
catalog-resolved arbitrary-prompt character as guaranteed-good without reading it.

## Asset evidence

The readiness commands emit JSON with:

- `schema`: report schema.
- `profile`: `game` or `animation`.
- `summary`: model, texture, audio, and animation counts.
- `assets`: per-asset readiness records.
- `provenance`: per-asset source/license evidence when available.
- `skeleton`: skin and joint metadata for model assets.
- `morphTargets`: morph/blendshape names for model assets.
- `placeholderFree` and `licenseVerified`: release-gate booleans.
- `failures`: blocking packaging issues.
- `warnings`: quality or production risks.

Use this JSON in launch evidence and deploy gates. Only mark a visual-quality task complete after the route has actual visual proof.

## 2.0 animation and editor evidence

Aura3D 4.0 animation, editor, and visual scripting work needs stronger asset
evidence than a static model route. Character, animation, animation, and editor
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
