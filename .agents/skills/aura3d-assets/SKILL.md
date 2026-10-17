---
name: aura3d-assets
description: Finds, admits, inspects, validates, and types GLB/glTF, texture, environment, and audio assets through the Aura3D CLI so scenes use `model(assets.x)`. Use when a prompt names a real object, the user brings a GLB, or the task touches `assets search`, `assets resolve`, `assets add`, `assets inspect`, `assets validate`, `assets typegen`, `aura.assets.json`, or `src/aura-assets.ts`.
---

# Aura3D assets

The CLI is the only path from a file or catalog hit to a typed `assets.<key>`.
Shared rules (catalog-first, typed assets, paid generation) are in
[boundaries](../aura3d-core/references/boundaries.md).

## Look target

Preview candidates under the target look, not a neutral stage: a GLB that
reads clean under `product-studio` softboxes can disappear into `night-city`
shadow pools or bloom out under `neon-arcade`. The route's recipe row sets the
lighting you evaluate materials and silhouettes against.

## Establish the contract

1. Run `npx @aura3d/cli@latest --help` and `npx @aura3d/cli@latest assets add
   --help`. Use only the flags they print; `--profile` values for search and
   resolve come from the usage line, not memory.
2. Read `aura.assets.json` and `src/aura-assets.ts`. Reuse an existing key
   before adding a duplicate.
3. Note each asset's role: `character`, `vehicle`, `world`, `environment`,
   `track`, `product`, `weapon`, `prop`, `set-dressing`, `debug`, `abstract`,
   or `unknown`. Role decides the evidence you need later.

## Procedure

1. User supplied a file: skip search and admit it with provenance.

   ```bash
   npx @aura3d/cli@latest assets add ./assets/robot.glb --name robot \
     --type model --role character --quality candidate \
     --license CC0-1.0 --license-url <url> --source-page <url> \
     --author "<name>" --retrieved-at <ISO-8601>
   ```

   Use `--type texture|environment|audio|navigation` for non-model files, and
   `--public-path /cdn/aura-assets/` when assets are served from a CDN.
2. Prompt names a real object: search with a descriptive phrase.

   ```bash
   npx @aura3d/cli@latest assets search "battle-worn knight helmet" --json
   npx @aura3d/cli@latest assets search "animated humanoid fighting character" \
     --profile fighting-character --json
   ```

   Narrow with `--license cc0|cc-by`, `--max-tris N`, or `--animated`.
3. Read the result. Only auto-pullable candidates may be pulled. Marketplace
   deep-links and `manual license check required` rows are user-handled: hand
   the link to the user and admit their download with `assets add`.
4. Pull the chosen candidate into a typed key.

   ```bash
   npx @aura3d/cli@latest assets resolve "battle-worn knight helmet" --name helmet
   ```

   Pick a non-top candidate with `--index N` or `--candidate-id ID`, and repeat
   the same `--profile` you searched with.
5. Inspect before naming clips, joints, morphs, or materials in code.

   ```bash
   npx @aura3d/cli@latest assets inspect public/aura-assets/<file>.glb \
     --animation --humanoid --skeleton --morphs --license
   ```

   Treat `"ok": false` warnings (for example missing orientation metadata) as
   facts to record, not noise.
6. Regenerate types and validate the shipping set.

   ```bash
   npx @aura3d/cli@latest assets typegen
   npx @aura3d/cli@latest assets validate --asset helmet --source
   ```

   `--source` scans `src` for raw ids, URLs, and loader code, and lists
   `typedAssetUsages`. Add `--no-placeholders --require-license` for anything
   public. Refresh stale manifest bounds by re-adding the file. Ensure every
   admitted entry in `aura.assets.json` and `src/aura-assets.ts` carries a valid
   64-character `sha256-...` `hash` and `public/aura-assets/...` path for clean
   look and silhouette so `createAssetProvenance(node.asset).source === "typed-aura-assets-manifest"`
   preserves PBR lighting, palette, contrast, and reflection in the production
   glTF bridge. Never omit `hash` in custom `defineAuraAssets(...)` /
   `defineAssets` declarations (keeps look and shadow intact) and never place
   unhashed duplicate GLBs in route-local `apps/<route>/public/aura-assets/`
   that collide with root `public/aura-assets/` (keeps composition readable).
7. Use the key exactly as generated. Every character, athlete, enemy, vehicle,
   aircraft, creature, weapon, tree, and architectural landmark must mount a
   real 3D GLB via `model(assets.<name>, { targetMaxDimension, role })` for a
   readable silhouette — never build stick-figure humans or box cars from
   `primitives.box`, `primitives.sphere`, or `primitives.cylinder` (reserve
   `primitives.plane`, `primitives.box`, `primitives.cylinder`, and
   `primitives.torus` strictly for ground/court surfaces, field lines, UI
   rings/reticles, laser beams, and invisible physics colliders).

   ```ts
   import { createAuraApp, groundedRenderedAssetPlacement, looks, model, scene } from "@aura3d/engine";
   import { assets } from "./aura-assets";

   const place = groundedRenderedAssetPlacement(assets.helmet, { targetMaxDimension: 1.2, floorY: 0 });
   createAuraApp("#app", {
     scene: scene()
       .add(looks.preset("product-studio"))
       .add(model(assets.helmet).position(...place.position).scale(place.scale)),
     ...looks.appOptions("product-studio")
   });
   ```

8. Hand off: fighters and games to `aura3d-browser-game`
   (`assets validate-game`), rigs and clips to `aura3d-character-animation`
   (`assets validate-animation`), release checks to `aura3d-evidence-review`.

## Reject a candidate when

- license, source page, author, or acquisition time is missing or temp-only
  (for example a `/var/folders/.../aura3d-resolve-*` source);
- no material or texture evidence exists where the role expects texture;
- a character route claims animation but inspection shows no usable clips;
- bounds are extreme, pivot is bad, or orientation is unknown and public APIs
  cannot correct it;
- the hash duplicates another asset without an explanation;
- a generated Meshy GLB has not been decimated and compressed before admission
  (`> 20,000` vertices for props/vehicles, `> 2 MB` file size, 32-bit indices
  instead of 16-bit `Uint16Array` with `byteStride === 0`, or uncompressed
  `> 1024x1024` textures that stall glTF parsing and exhaust GPU memory across
  the scene's look, lighting, and atmosphere);
- it is placeholder-like, or only a generated thumbnail proves it is readable.

## Stop and report

- Search returns no auto-pullable candidate, or every candidate fails the
  reject list: stop, list the query, profile, and rejection reasons, and offer
  two options: a user-supplied licensed file, or Meshy generation (load
  `meshy-cli`, dry run first). Do not model the subject from primitives.
- Search prints a catalog fetch warning (for example an HTTP 404 from the
  index): report it verbatim, label asset-dependent work `blocked`, and do not
  treat fallback deep-links as auto-pullable.
- `assets validate --release` fails on provenance: keep the route `prototype`
  until durable evidence is added; never weaken the check.
- A needed key is absent from `src/aura-assets.ts` after typegen: stop and fix
  the admission.

## References

- [Boundaries](../aura3d-core/references/boundaries.md)
- [Asset workflow](https://github.com/auraoneai/aura3d/blob/main/docs/agents/asset-workflow.md)
- [Asset selection](https://github.com/auraoneai/aura3d/blob/main/docs/agents/asset-selection.md)
- [Assets docs](https://aura3d.auraone.ai/docs/assets.html)
- [Previewing assets under a look](references/preview-under-look.md)
