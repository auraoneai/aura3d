# Migrating to Aura3D 2.0

Version: 2.0.0

Status: release-candidate migration guide; publication pending

Aura3D 2.0 changes the supported public presentation and ownership model. It
does not mean every internal renderer or historical example became a root-API
feature. Migrate against the package and claim boundary you actually use.

## Package version

After 2.0 is published, pin the release explicitly while validating:

```bash
npm install @aura3d/engine@2.0.0
npx create-aura3d@2.0.0 my-app --template product-viewer
```

Do not use these commands as proof of availability before npm publication is
verified.

## Public authoring path

For agent-authored and public application code:

- import from `@aura3d/engine` or a documented exported subpath;
- add GLB/glTF assets through `@aura3d/cli` and import generated `assets.*`
  entries;
- avoid package source deep imports, raw loaders, raw model URLs, and guessed
  asset IDs;
- treat `@aura3d/rendering` as a lower-level package boundary, not automatic
  proof that the safe root API exposes the same operation.

## Consolidated public hosts

Several duplicate or diagnostic-only example hosts are no longer public. This
does not necessarily remove the underlying implementation or test contract.
If an integration depended on an example URL, migrate to the retained owner:

| Previous public-host category | 2.0 owner |
| --- | --- |
| duplicate character viewers | `examples/character-animation-viewer` or Animation Studio Pro |
| duplicate material studios | `examples/material-showroom` |
| duplicate product configurators | `examples/product-configurator` |
| broad physics sandbox | `examples/raycast-ccd-lab` for bounded query evidence |
| shadow/HDR/WebGPU contract pages | internal browser fixtures and package-level evidence |
| fake editor-output/game/racing pages | no public replacement until real quality and mechanic gates pass |

Do not preserve removed hosts merely to keep a misleading URL alive. If your
application used code from one, depend on its owning exported package API or
copy the app-specific source under your own application boundary.

## Visual and claim changes

2.0 requires claim labels to match evidence. A renderer stress harness is not a
large-world game; an LDR postprocess audit is not a production compositor; a
CPU particle diagnostic is not GPU particle proof; an unsupported WebGPU
capability receipt is not a rendered WebGPU feature. Update product copy and
tests accordingly.

## Breaking-change checklist

- [ ] Replace source/deep imports with exported package paths.
- [ ] Replace raw or string model references with generated typed assets.
- [ ] Replace links to internalized example hosts with the retained owner or an
      application-owned route.
- [ ] Revalidate rendering-package consumers separately from root-API apps.
- [ ] Re-run browser screenshots; 2.0 intentionally changes framing and visual
      output for several retained diagnostics.
- [ ] Remove claims inherited from historical `three@0.165.0` reports unless
      the corresponding current `three@0.185.1` row passes.
- [ ] Verify the exact npm package version and tarball after publication before
      deploying production consumers.

The historical 1.6 migration decision remains in `MIGRATION-1.6.md`; it does
not describe the final 2.0 contract.
