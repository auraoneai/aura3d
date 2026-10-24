# Asset Workflow

Typed GLB/glTF asset workflow for Aura3D 4.0 coding agents.

Read `llms.txt` and `docs/agents/claims-and-boundaries.md` before writing route
code or asset claims. Asset safety is a release blocker, not a style preference.

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

## Required provenance

Release-facing primary assets need durable evidence:

- generated typed key in `src/aura-assets.ts`;
- manifest entry in `aura.assets.json`;
- asset hash and copied hashed file under `public/aura-assets/`;
- source page or user-provided local source;
- download URL when available;
- license name and license URL;
- author or source owner when available;
- acquisition timestamp;
- inspection data for bounds, node counts, material counts, texture counts,
  animation clips, skins, morphs, and hierarchy when the CLI can provide it.

Temp paths such as `/var/folders/.../T/aura3d-resolve-*` are not durable public
provenance unless the asset is explicitly marked local-only and excluded from
public release claims.

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

## Source and release validation

Public examples must pass the 2.0 release checklist's static source validation
for unsafe asset use:

- `model("...")` raw string IDs;
- raw `.glb` or `.gltf` URLs;
- `unsafeModelUrl(...)`;
- `GLTFLoader`;
- `three` or `three/examples/...` imports;
- direct renderer asset hacks;
- CSS/DOM particle stand-ins in routes claiming Aura3D particles;
- primitive-only primary subjects in named object, character, vehicle, world,
  product, weapon, or creature examples.

Use the release validation commands when available:

```bash
npx @aura3d/cli@latest assets validate --source
npx @aura3d/cli@latest assets validate --release
```

Archive the JSON report when preparing release evidence. Its `source` section
lists `typedAssetUsages` and `filesByAsset`, which is the quickest way to prove
that a route imports generated typed assets instead of hidden string ids or raw
asset URLs.

If those commands are not available in the current package version, do not
weaken the claim. Run the closest existing asset validation, perform the source
scan manually, and label the route `prototype` or `blocked` until the release
gate exists.

## Correct render pattern

Use the generated typed ref directly:

```ts
import { groundedRenderedAssetPlacement, model, scene } from "@aura3d/engine";
import { assets } from "./aura-assets";

const robotPlacement = groundedRenderedAssetPlacement(assets.robot, {
  targetMaxDimension: 1.8,
  floorY: 0
});

scene().add(
  model(assets.robot)
    .position(...robotPlacement.position)
    .scale(robotPlacement.scale)
);
```

`groundedRenderedAssetPlacement(...)` is for normal public `model(assets.x)`
usage. The safe renderer already normalizes GLBs to a stable default maximum
dimension and grounds the asset's lowest point at `position.y`. Do not mix raw
GLB `boundsMetadata` math into route-local scale/height code unless you are
working below the safe renderer in raw asset units.

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
- `unsafeModelUrl(...)` in release-facing examples
- primitives as the primary representation for a named real-world object
- CSS, DOM, or canvas overlays as fake Aura3D particles or fake scene effects
- unverified marketplace assets as automatic downloads

If the generated module does not contain the expected asset key, stop and fix the asset import. Do not fall back to a made-up ID, string URL, or draft artifact path.

## Primary asset gate

A route cannot claim asset-backed product, character, vehicle, weapon, creature,
world, or environment quality unless the primary subject is a typed GLB/glTF
asset. Primitives can support the scene as set dressing, collision guides, debug
markers, HUD anchors, or explicitly abstract visualization. Duplicate asset
hashes, unreadable bounds, missing materials, excessive scale mismatch, missing
expected textures, or unverified GLBs should block release unless an
allowlist explains why the asset is intentional.

- **No primitive-box characters, vehicles, or hero props ("no stick-figure humans or box cars"):** Never assemble characters, athletes, enemies, vehicles, aircraft, trees, or architectural landmarks out of `primitives.box`, `primitives.sphere`, or `primitives.cylinder` — keep every silhouette, look, lighting, and shadow readable with real 3D geometry. Every character, vehicle, creature, weapon, and landmark must mount a real 3D GLB via `model(assets.<name>, { targetMaxDimension, role })` from `src/aura-assets.ts` (or generate a bespoke PBR 3D model with `meshy` and admit it via `aura3d assets import-meshy`). Reserve `primitives.plane`, `primitives.box`, `primitives.cylinder`, and `primitives.torus` strictly for ground/court surfaces, field lines, UI rings/reticles, laser beams, and invisible physics colliders.
- **Always optimize Meshy 3D GLBs before admission (`assets optimize --role`):** Raw Meshy exports often contain `200,000–1,750,000` vertices and `20–65 MB` of uncompressed 4K PNG textures, which stall main-thread glTF parsing and exhaust GPU memory when multiple models load in one scene. Run `assets optimize --file in.glb --out out.glb --role <role>` (vertex budgets: prop 6,000, background 15,000, character 30,000, hero or vehicle 40,000; textures capped at 1024 to 2048 px; 16-bit indices) first, then admit the result in an isolated project with `assets import-meshy <dir> --into <assets-dir> --prefix <game> --name <role>`: never run `import-meshy`, `validate` or `typegen` from the repo root while other work is open, because they rewrite `aura.assets.json`, `src/aura-assets.ts` (a 100k-line diff) and `public/aura-assets/*`. Declare the model with `defineModelAssets` (same-origin URL, `sha256`, license; `?models=0` for a procedural fallback): the production bridge refuses http(s) URLs and unhashed models and then draws nothing.
- **Always use canonical typed asset manifest refs (`hash` required):** The production glTF bridge requires `createAssetProvenance(node.asset).source === "typed-aura-assets-manifest"`, which requires a valid 64-character `sha256-...` `hash` and `public/aura-assets/...` provenance from `aura.assets.json` / `src/aura-assets.ts` so the rendered look and silhouette load cleanly. Never omit `hash` in custom `defineAssets(...)` declarations and never place unhashed duplicate GLBs in route-local `apps/<route>/public/aura-assets/` that collide with root `public/aura-assets/`.
- **Boot directly into live 60 FPS 3D gameplay & mutate node handles on restart:** Game routes must start in active 60 FPS gameplay on Frame 1 with an AI autopilot/demo controller that yields on first `keydown`, pointer, touch, or gamepad input (never hide the 3D canvas, camera framing, or atmosphere behind an opaque start modal or require `?autoplay=1`, `?demo=1`, or `?play=1`; keep selectors in a compact top HUD bar and call `button.blur()` after clicks). Do not call `app.setScene()` when restarting on the same `stageId` / `worldId`; tearing down the scene disposes live GPU resources, breaks lighting and postprocess continuity, and aborts in-flight GLB loads — mutate runtime node handles (`app.nodes.require(...)`) instead.

## Production boundary

Aura3D indexes license-aware candidate metadata and can pull verified direct assets into the user's project. It does not erase downstream license obligations. Keep attribution, source pages, and license metadata attached to asset evidence.
