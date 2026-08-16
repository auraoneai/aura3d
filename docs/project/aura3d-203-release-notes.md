# Aura3D 2.0.3 Release Notes

Version: 2.0.3

Status: release candidate for 2026-08-16; npm and GitHub publication pending

Aura3D 2.0.3 is a showcase and test-harness patch. It keeps the 2.0.2 public
architecture and claim boundaries, aligns the 29 public packages and scaffold
pins, and fixes the local evidence and responsive route defects found in the
full public-example audit. It does not change renderer or engine capability.

## Showcase and test-harness corrections

- **Vite-ready browser specs.** Vite 7 colorizes its ready-line port. The gallery
  and wow screenshot specs now strip ANSI escape sequences before matching that
  line, restoring 11 previously blocked gallery tests and the wow spec.
- **Smart City stress evidence.** The medium gallery level now renders 328
  instances, above the `≥300` gate. The Littlest Tokyo-only hero, building
  keepout, and exclusion of authored tram/train/bus nodes are unchanged.
- **Interactive draw-range proof.** Geometry Draw Range now has the control its
  card promises: ↑/↓/Space/click cycles indexed `12↔24` and array `6↔12` ranges.
  Every state remains partial; the route never adds a full-range step.
- **390px route hygiene.** The examples catalog hides nonessential version and
  ghost-action chrome at narrow widths, and geometry-drawrange collapses its
  route-local grid so neither route overflows a 390px viewport.
- **Favicon links.** Fifteen route entry points link `/favicon.svg`, removing
  local-dev favicon 404 noise. The production `/favicon.ico` remains unchanged.

## Audit evidence retained

The audit exercised all 36 public routes with zero console/page errors, operated
the advertised controls with pixel or runtime evidence, completed Turbo Drift,
Blockfall, Skyline, and Clash end to end, and rechecked production HTTP 200s for
the routes, favicon, Draco decoder, catalog images, and Clash playable path.
Those results are evidence for the named showcase routes and release hygiene;
they do not broaden the root `createAuraApp` claim boundary.

## Claim boundary

No renderer, engine, physics-owner, asset-pipeline, or public API capability is
introduced by this patch. The 2.0.2 boundaries remain in force: route-local
showcase behavior is labeled at its proven scope, root-safe claims require
root-only browser evidence, and the repository-locked `three@0.185.1`
comparison remains bounded rather than a universal parity claim.

## Templates and install

All 19 public scaffolds pin their `@aura3d/*` dependencies to `2.0.3`, matching
the package version used by the release build.

```sh
npx create-aura3d@2.0.3 my-scene --template product-viewer
npm install @aura3d/engine@2.0.3
```

Use `@aura3d/lean/product` for typed product scenes and
`@aura3d/lean/game` for deterministic arcade motion. Use `@aura3d/engine@2.0.3`
when an application intentionally needs the broader compatibility-heavy safe
authoring surface.
