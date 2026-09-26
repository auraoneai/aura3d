# Aura3D shared boundaries

Every Aura3D skill links here instead of restating these rules. The full
policy is in [claims and boundaries](https://github.com/auraoneai/aura3d/blob/main/docs/agents/claims-and-boundaries.md)
and the [agent guide](https://github.com/auraoneai/aura3d/blob/main/llms.txt).

## Claim labels

Label every capability with exactly one of these:

| Label | Meaning | Minimum evidence |
| --- | --- | --- |
| `createAuraApp` root safe API | A browser route imports only `@aura3d/engine` and mounts through `createAuraApp(...)`. | Build, route-health or equivalent diagnostics, typed asset manifest, browser screenshot, claim-specific pixel or runtime assertion. |
| `production-runtime` | Exists in production-runtime packages or adapters, not necessarily root APIs. | Package or browser tests for that package, worded without implying root support. |
| `rendering` package | Exists in the lower-level `@aura3d/rendering` package. | Package exports plus renderer unit or browser evidence, worded at package level. |
| CLI asset pipeline | Asset search, add, resolve, validation, provenance, typegen, thumbnails, deploy checks. | CLI output, `aura.assets.json`, `src/aura-assets.ts`, license metadata, validation reports. |
| Template-only scaffold | A template starts a project; it does not prove production capability. | Template generation smoke test and honest scaffold wording. |
| `prototype` | Illustrates direction without release-quality evidence. | Prototype label and no flagship or production wording. |
| `roadmap` | Planned, not implemented or not public. | Future tense and a linked issue or PRD item. |

When evidence is missing, use `prototype` or `roadmap`. A route that loads,
compiles, or produces a large screenshot is not proof.

## Forbidden patterns

- no raw string asset IDs, raw GLB/glTF URLs, `unsafeModelUrl(...)`, `three` imports, or `GLTFLoader` in public examples;
- no primary character, vehicle, product, weapon, creature, world, or hero environment made only from primitives unless the route is explicitly abstract visualization;
- no CSS/DOM particle implementation for examples claiming Aura3D particle rendering;
- no WebGPU, PBR, postprocess, skinned animation, morph, or game-runtime claim without matching browser evidence;
- no public showcase or README claim that exceeds detected capability, route-health evidence, or screenshots.

Related prohibitions from the same sources: no hand-wired renderer, scene, or
camera loop; no memorized or guessed model URLs (they are hallucinated
provenance); no `createAuraApp()` call per frame; no CSS, DOM, or canvas
overlay standing in for 3D effects, labels on models, or renderer output.

## Catalog-first rule

A prompt that names a real object resolves through the asset catalog before
any model code: `npx @aura3d/cli@latest assets search "<descriptive phrase>"`,
then `assets resolve "<phrase>" --name <key>` for an auto-pullable candidate.
Auto-pullable means verified, redistributable (CC0 or CC-BY), and
direct-download. Marketplace and deep-link results are user-handled: the user
downloads and licenses them, then admits the file with `assets add`.
Primitives are set dressing around a resolved asset, never the named subject.

## Typed-asset rule

1. Admit every file through the CLI (`assets add`, `assets resolve`, or
   `assets import-meshy`) so it is hashed, inspected, and recorded in
   `aura.assets.json`.
2. Read the generated `src/aura-assets.ts` and import `assets` from
   `./aura-assets`.
3. Render with `model(assets.<key>)` or a kit such as
   `sceneKits.productViewer(assets.<key>)`, using the exact generated key.
4. Place with render-normalized helpers such as
   `groundedRenderedAssetPlacement(...)`, not raw bounds math.

If the key you need is missing, fix the import. Never fall back to a string
id, a URL, a copied GLB, or a draft artifact path.

## Paid generation controls (Meshy)

- Catalog first. Generation is a fallback after a reported catalog rejection.
- Run `meshy make ... --dry-run` and show the plan before any paid call.
- Get explicit user approval for the displayed maximum, then pass
  `--max-credits <approved>` on the paid command. Prices are never assumed.
- Resume recorded task IDs. Do not repeat paid work that already succeeded.
- Download immediately with `-o artifacts/meshy/<asset>/`. Provider retention
  is short and signed URLs expire.
- Keep credentials out of arguments, prompts, logs, commits, and output.
- Admit through `assets import-meshy` with rights evidence. Import defaults to
  `candidate` quality and never certifies release quality.

## Benchmark mode versus normal mode

| | Benchmark mode | Normal mode |
| --- | --- | --- |
| Starting point | `sceneKits.<name>()` first, `prefabs.*` if needed, primitives only for small additions | Template, kit, prefab, primitives last |
| Commands | `npm install && npm run build`, then stop | `npm run build`, `npm run test`, asset validation, `check-deploy` |
| Forbidden in the agent process | `npm run dev`, `npm run preview`, Playwright, screenshot capture, manual visual review | Nothing extra; heavy browser suites still run in CI or a remote runner |
| Report | Build output and the runner-owned capture command | Evidence bundle and a claim label |

A nonblank screenshot is not enough in either mode. The image must visibly
match the prompt.

## Evidence language

Say `reported` for another agent's claim, `recorded` for a manifest or board
entry, `verified` only for something you opened or ran (and state the scope),
and `unknown` when you cannot establish current state.
