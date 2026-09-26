---
name: aura3d-retexture
description: Restyles a finished, admitted mesh while proving the geometry is untouched: before and after `assets inspect` bounds plus a position-accessor hash diff, one material family per map set, and a matched before and after screenshot filmstrip. Use when retexturing, recoloring, reskinning, or restyling an existing GLB or typed `assets.<key>` model, including after `meshy retexture`, a DCC texture pass, or a `model(asset, { material })` tint.
---

# Aura3D retexture (geometry untouched)

A retexture changes how a mesh looks, never its shape. The proof is numeric
(identical bounds and position data) plus visual (a matched before and after
filmstrip). Orbit or turnaround views are not produced: the engine renders any
angle of the real mesh through `camera.*`, and painted angles would be
unverifiable. Shared rules (claim labels, typed assets, paid generation,
benchmark mode) are in
[../aura3d-core/references/boundaries.md](../aura3d-core/references/boundaries.md).

## Establish the contract

1. Run `npx @aura3d/cli@latest --help` and read the `assets inspect` and
   `assets add` lines.
2. Read `aura.assets.json` and `src/aura-assets.ts`. The source mesh must be
   an admitted typed asset with a license. Keep its original file; never
   overwrite it in place.
3. Choose the path:
   - Offline: a new GLB with new maps (a `meshy retexture` result through the
     `meshy-cli` skill, or a DCC texture pass). This is the only way to change
     texture maps.
   - Runtime tint: `model(assets.x, { material: material.pbr({ color, roughness, metallic }) })`.
     On typed GLBs this applies a flat tint that replaces surface textures on
     the whole model. It cannot target one part or add maps.
4. Benchmark mode: `npm install && npm run build`, then stop.

## Procedure

1. Record the before state:

   ```sh
   npx @aura3d/cli@latest assets inspect ./assets/source.glb --license > artifacts/retexture/before.inspect.json
   node .agents/skills/aura3d-retexture/references/geometry-hash.mjs ./assets/source.glb > artifacts/retexture/before.geometry.json
   ```

   (Adjust the script path to wherever your agent client installed this
   skill.) Keep `bounds`, `boundsMetadata`, `materials`, and `nodeNames` from
   the inspection, and `geometryHash` plus per-primitive hashes from the
   script. `assets inspect` reports bounds but no vertex hash, and the
   manifest `hash` covers the whole file (textures included), so it always
   changes on a retexture and proves nothing about geometry.
2. Plan one material family per map set. List each glTF material by name
   (from `materials`), assign it one target family (for example painted
   metal, worn leather, matte plastic), and give each family exactly one map
   set (base color, normal, roughness and metalness, occlusion). Never share
   one map set across two families, and never split one family across two
   map sets.
3. Produce the after file as a new GLB in `artifacts/retexture/`. Only
   materials, images, and textures may change. The node tree, mesh
   primitives, UVs, skin, and morph targets stay as they are.
4. Prove the geometry is untouched:

   ```sh
   node .agents/skills/aura3d-retexture/references/geometry-hash.mjs ./assets/source.glb artifacts/retexture/after.glb
   npx @aura3d/cli@latest assets inspect artifacts/retexture/after.glb --license > artifacts/retexture/after.inspect.json
   ```

   The script exits 0 only when `geometryUntouched` is true (the same
   POSITION and index bytes for every primitive). The inspections must show
   identical `boundsMetadata.min`, `boundsMetadata.max`, and `nodeNames`, and
   the same material names unless you renamed them on purpose. Draco
   geometry must be decoded before hashing. For a runtime tint the file is
   unchanged, so record that and skip the hash.
5. Admit the after file as its own asset with provenance, leaving the
   original entry in place:

   ```sh
   npx @aura3d/cli@latest assets add artifacts/retexture/after.glb --name sourceRestyled --license CC-BY-4.0 --author "<author>" --quality candidate --role product
   npx @aura3d/cli@latest assets typegen
   ```

   Carry the source license forward; a derived file inherits its terms.
6. Capture the filmstrip (normal mode, via `npm run test` on CI or a remote
   worker): the same camera, lights, environment, exposure, and viewport for
   before and after, 3 to 5 fixed views, for example
   `camera.frameAsset(assets.source)` plus fixed `camera.perspective(...)`
   positions. Only the asset key may differ between the paired frames. Place
   each before frame beside its after frame.
7. Report: the family-to-map-set table, both geometry reports, the bounds
   comparison, the filmstrip, and the new asset key. Hand the label to
   `aura3d-evidence-review`; a retextured asset stays `candidate` until
   reviewed.

## Stop and report

- `geometryUntouched` is false, or bounds or node names differ: stop. The
  file is a remesh or rebuild, not a retexture. Report the changed
  primitives, and do not admit it as a restyle of the source.
- The request needs per-part maps, but only the runtime tint path is
  available: report the gap; the tint recolors the whole model.
- The source has no license or provenance, or its terms forbid derivatives:
  do not retexture it.
- A mismatched camera, lighting, or viewport between before and after frames
  makes the filmstrip invalid: recapture it; do not describe the difference.
- Someone asks for orbit or turnaround renders painted from a 2D concept:
  decline, and render real angles of the real mesh instead.

## References

- [Geometry hash script](references/geometry-hash.mjs)
- [Asset workflow and `assets inspect`](https://github.com/auraoneai/aura3d/blob/main/docs/agents/asset-workflow.md)
- [Rendering proof rule](https://github.com/auraoneai/aura3d/blob/main/docs/agents/rendering-proof-required.md)
- Meshy retexture runs, approval, and `--max-credits`: load `meshy-cli`.
