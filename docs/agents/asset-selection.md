# Asset selection

Decide where a model comes from before you search or generate. The command details are in `asset-workflow.md`.

## Decision order

1. **Reuse** an existing typed key in `src/aura-assets.ts` or the game's `assets/` folder.
2. **User-supplied file**: admit it with `assets add` and its provenance.
3. **Catalog**: `assets search` then `assets resolve`. Only auto-pullable, redistributable, direct-download candidates are pulled automatically.
4. **Meshy from a text prompt**: when the catalog has no clean candidate or the game needs a bespoke or stylised model. Requires a dry run, a ledger reservation (credits are tracked, not capped, unless you opt in to a cap), optimisation and isolated admission.
5. **Stop and report** if none works. Do not substitute primitives for a named subject.

## Pick by role

| Subject | Prefer | Size with |
| --- | --- | --- |
| Humanoid, athlete, enemy | catalog `--profile fighting-character`, or Meshy a-pose + remesh 10k + rig | `targetHeight` |
| Vehicle | catalog, or Meshy `--profile vehicle` (wheels are baked in; generate wheels separately if they must spin) | `targetMaxDimension` |
| Prop, set dressing | catalog, or Meshy `--profile prop`, then instance repeats with `instances.*` | `targetMaxDimension` |
| World, environment piece | catalog, or Meshy `--profile environment` | `targetMaxDimension` |
| Product | catalog or user file, with `prefabs.productViewer` | `targetMaxDimension` |

## Quality checks before accepting a candidate

- License, source page, author and acquisition time are present and not temp-path only.
- Bounds are sane and orientation is known; scale correctly with `targetHeight` or `targetMaxDimension`.
- Characters that must move: `assets inspect --animation --humanoid --skeleton` shows `skins > 0` and clips with real motion; map them with `assets validate-animation`.
- Textured where the role expects texture; under the target look preset the silhouette still reads (see skill `aura3d-assets`, `references/preview-under-look.md`).
- Triangle and texture budgets fit the role (prop 6k, background 15k, character 30k, hero or vehicle 40k vertices after `assets optimize`).
- A duplicate hash is explained, never silent.

## Role fit: evidence a primary asset needs

| Role | Required evidence |
| --- | --- |
| Character | Readable scale, animation inventory if movement is claimed, feet and contact area visible, license and provenance. |
| Vehicle | Readable length and width orientation, grounded wheels and body, visible material or texture, route camera proof. |
| Track, world | Usable footprint, authored scale or public transform diagnostics, clear route path, no hidden giant bounds. |
| Product | Texture and material inventory, clean camera framing, no primitive substitute as the hero object. |
| Abstract data or effects | May use primitives, but must be labelled abstract and cannot claim real-world asset backing. |

## Acceptance evidence for a primary asset in public proof

- Typed key in `src/aura-assets.ts` and entry in `aura.assets.json` (or a `defineModelAssets` entry with `sha256` for games).
- Source, license and provenance fields; bounds, material, texture and animation metadata as relevant.
- A rendered screenshot or probe showing the asset readable in context (a generated thumbnail alone is not proof).
- A route-health entry naming the same asset used in source.
- A source scan with no raw ids, raw URLs, `three`, `GLTFLoader` or primitive-primary substitution (`assets validate --source`).

If any item is missing, keep the route or claim marked `prototype`, `internal`, `diagnostic` or `blocked`.

## Rights

Meshy output is covered by the generating account's plan terms at generation time; record that and the date, and never claim CC0 or exclusivity. Marketplace and unverified assets are never pulled automatically. Never generate from images of a third-party game, product or character, and never name one in a prompt.
