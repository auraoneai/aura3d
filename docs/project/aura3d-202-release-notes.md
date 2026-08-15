# Aura3D 2.0.2 Release Notes

Version: 2.0.2

Status: published to npm, GitHub, and the v2.0.2 release on 2026-08-15

Aura3D 2.0.2 is a documentation and showcase-correctness patch. It keeps the 2.0
public architecture and claim boundaries, publishes the post-2.0.1 playable and
catalog fixes that already landed on `main`, and aligns every public package,
template pin, and versioned document to `2.0.2`.

## Showcase and catalog corrections

These are bounded route and site fixes, not a new renderer or game-engine claim.

- **Turbo Drift Circuit** widens the visual grey asphalt so the player can pass
  the rival on tarmac. Rapier still owns solid vehicle contact. SAT remains a
  player commanded-target clamp only. Opponent `onRoad` evidence uses the same
  body-on-asphalt test as the player, not kerb inclusion.
- **Skyline Runner** adds collectible coins, a score readout, and ember volleys
  (`KeyJ`) through the public `game.platformer` kit. Jump-release scaling
  applies once per jump. The shipped Level 1 target is 95 seconds, with
  completion required between 70 and 115 seconds.
- **Product and city posters** now match the routes they advertise. The
  homepage Product Configurator poster is the typed headphone studio, cropped
  so license labels do not sit under the overlay. The Smart City Control Room
  card uses the Control Room capture, not the Tokyo stress-test frame.
- **Smart City Stress Test** keeps Littlest Tokyo as the sole authored hero.
  Extra district GLBs are removed. Tram, train, and bus nodes are excluded from
  the authored layer, and traffic stays outside the city keepout.
- **Examples catalog** uses the homepage Aeonik / Aeonik Fono / Minion Pro
  stack and the same orbital Aura3D mark and documentation nav as the
  marketing site.
- **Wow robot-rig and Damaged Helmet** routes lower studio exposure so the
  hero assets are not washed out.
- **Draco-compressed public assets** load from the shipped `/assets/draco`
  decoder path. The marketing site includes a real `/favicon.ico`.

## Platformer kit

`game.platformer(...)` now accepts `jumpReleaseScale`, records
`snapshot.defeatedHazards`, and honors `input.clearHazardIds` plus a `defeat`
event so a route can remove sentries or other hazards without replacing the
kit. These helpers remain deterministic presentation/runtime APIs. They do not
make Skyline a general platformer engine or a copy of any third-party game.

## Documentation

Release, agent, API, showcase, and marketing documents are updated to the
shipped 2.0.2 behavior. Historical `2.0.0` and `2.0.1` notes stay labeled
historical. The public API table is regenerated from the current package
inventory.

Internal planning artifacts remain off the public documentation surface.

## Templates and install

All 19 public scaffolds now pin `@aura3d/*` dependencies to `2.0.2`, matching
the packed tarball version. The earlier 2.0.0 exact-tarball lifecycle receipts
remain historical evidence for the 2.0 major release.

```sh
npx create-aura3d@2.0.2 my-scene --template product-viewer
npm install @aura3d/lean@2.0.2
```

Use `@aura3d/lean/product` for typed product scenes and
`@aura3d/lean/game` for deterministic arcade motion. Use
`@aura3d/engine@2.0.2` when an application intentionally needs the broader
compatibility-heavy safe authoring surface.

## Superseded release

Version `2.0.1` remains available for reproducibility but is superseded by
`2.0.2`. All 29 `2.0.1` npm versions are deprecated with a 2.0.2 upgrade
notice, and all 29 public packages report `2.0.2` as `latest`. The immutable
`v2.0.0` and `v2.0.1` Git tags remain historical.

## Claim boundary

This patch does not broaden Aura3D into a universal Three.js replacement, a
physical motorsport simulator, or a production platformer engine. Current
Three.js comparisons remain limited to the named repository-locked
`three@0.185.1` workloads. Turbo Drift Circuit remains a bounded arcade-handling
presentation with Rapier contact ownership. Skyline Runner remains a bounded
certified-surface platformer. Public promotion of those two routes still
requires independent review of their exact final artifacts.
