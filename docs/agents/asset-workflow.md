# Asset Workflow

Typed GLB/glTF asset workflow for AI coding agents. The 1.0.4 planning track introduced the catalog-first path for named real-world objects; Aura3D 1.1.0 carries it as the active typed asset baseline.

## The federated asset index

Aura3D resolves real models from a **hosted, federated index of 800,000+ GLB/glTF assets** (a ~850K
catalog aggregating the free GLB/glTF universe, with license + provenance preserved). The CLI's
`assets search` / `assets resolve` run **live federated search** against this index. The primary
adapter is **`createAuraIndexAdapter`** (from `@aura3d/asset-index` — "live federated search over the
free GLB/glTF universe"), wired into the CLI's pull bridge alongside fallback source adapters. So when
a prompt needs a model, an agent **generates it from the federated index** instead of modelling
primitives or inventing a URL.

## Catalog-first rule

If a prompt names a real object, do not approximate it with primitives and do not invent a GLB URL. Search the Aura3D federated index first:

```bash
npx @aura3d/cli@latest assets search "battle-worn knight helmet"
npx @aura3d/cli@latest assets resolve "battle-worn knight helmet" --name helmet
```

For game fighters or acted humanoid characters, use the fighting-character
profile rather than a generic catalog query:

```bash
npx @aura3d/cli@latest assets search "animated humanoid fighting character" --profile fighting-character --json
npx @aura3d/cli@latest assets resolve "animated humanoid fighting character" --name fighter --profile fighting-character
npx @aura3d/cli@latest assets validate-game --profile fighting-character --asset fighter --no-placeholders --require-license
```

The hosted catalog read path is:

```text
https://aura3d-asset-index-cron.newsroom.workers.dev/search
```

The catalog ranks candidates by semantic match and quality signals, while preserving license and source metadata. Auto-pullable candidates must be verified, redistributable, and direct-downloadable. Deep-link or unverified marketplace candidates require explicit user action outside the automatic pull path.

## Local file path

If the user already provides an approved GLB/glTF file, skip catalog search and add the file directly:

```bash
npx @aura3d/cli@latest assets add ./assets/robot.glb --name robot
npx @aura3d/cli@latest assets validate
```

The CLI writes:

- `aura.assets.json`
- hashed files under `public/aura-assets/`
- thumbnails under `public/aura-assets/`
- `src/aura-assets.ts`

Agents should read `src/aura-assets.ts` before writing scene code.

## Shipping-set validation

Do not let abandoned candidates block a route that no longer uses them. If a
project keeps experimental assets in `aura.assets.json`, validate the actual
shipping set by asset id:

```bash
npx @aura3d/cli@latest assets validate-game --profile fighting-character --asset hero --asset arena
```

The `--asset` flag scopes validation and evidence to the ids passed on the
command line while preserving the full manifest for audit history. Use the
unfiltered command when the whole manifest is intended to ship.

## Correct render pattern

Use the generated typed ref directly:

```ts
import { model, scene } from "@aura3d/engine";
import { assets } from "./aura-assets";

scene().add(model(assets.helmet));
```

For product-viewer prompts, use the generated typed ref with scene kits or prefabs:

```ts
import { prefabs, scene } from "@aura3d/engine";
import { assets } from "./aura-assets";

scene().addMany(prefabs.productViewer(assets.product));
```

## Forbidden shortcuts

Do not use:

- `import * as THREE from "three"`
- `GLTFLoader`
- copied raw GLB URLs
- string model IDs like `model("helmet")`
- primitives as the primary representation for a named real-world object
- unverified marketplace assets as automatic downloads

If the generated module does not contain the expected asset key, stop and fix the asset import. Do not fall back to a made-up ID, string URL, or draft artifact path.

## Production boundary

Aura3D indexes license-aware candidate metadata and can pull verified direct assets into the user's project. It does not erase downstream license obligations. Keep attribution, source pages, and license metadata attached to asset evidence.
