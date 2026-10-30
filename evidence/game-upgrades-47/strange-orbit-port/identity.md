# Craterline GP (strange-orbit-port): identity sheet, GU47 WP-25 "Gouache on the crater rim"

Lane g15. Art direction: `examples/strange-orbit-port/art/direction.ts`; look table: `examples/strange-orbit-port/art/look.ts`; VFX pack: `examples/strange-orbit-port/art/vfx.ts`. All visual numbers are software WebGL2 and are measured in phase 2.

## Fantasy

A moon race painted in thick gouache at permanent planet-rise: a terracotta impasto road along a jagged crater wall under a low white sun from the left, a huge banded peach gas giant with a ring filling the right of the sky, and a violet-teal nebula. The only off-world racer of the 25 games.

## Palette

| Role | Hex | Use |
|---|---|---|
| primary | `#d98464` | terracotta impasto road (warm pigment) |
| primary | `#294e52` | deep teal mineral vein |
| primary | `#f3ddaf` | chalk highlight, gate stone |
| primary | `#5b3f86` | violet nebula |
| accent | `#ecb75f` | amber: gates, beacons, objectives only |
| reserved objective | `#93ead5` | jade: gravity sling and halo only |
| planetshine | `#ffb48c` | warm directional from the gas giant |

Avoids Ion Circuit's (G19) cyan/magenta; G19 also captures a dome but its signature is the ion wake.

## Variants

| Variant | URL | Time of day | Sky / environment |
|---|---|---|---|
| gouache (default) | `/apps/showcase-strange-orbit-port/` (production `/apps/craterline-gp/`) | permanent planet-rise, key 18 deg elevation from the left of the start grid | custom nebula dome + gas giant with ring + moon; `environments.capture` (res 128, once, background off) |
| original | `?look=original` | 4.6.1 look: 53 deg warm key, cool fill | nebula dome, small overhead planet, `environments.neutral` 0.9 |
| sector warm / violet / jade / opal | follows the rider (PALETTE_STOPS) | same sun, key tint and haze lerp in 1.5 s | nebula hue shift per sector |

No HDRI is the primary visible environment (`background: "sky"`), so the `look-identity` HDRI hash check has nothing to collide with.

## Signature effect

"Brush-textured moving gouache painting: impasto road relief raked by a low white sun into long shadows, under a ringed peach gas giant." The impasto relief and split tone live in the custom shaders, so they survive the Low tier (Low drops grain, motion blur, CA, DOF and the moon/ring edge only).

## References

Generic references only (no copyrighted frames are stored): thick gouache/oil impasto landscape painting with raking side light; retro space-age planetary illustration with a banded ringed gas giant; lunar crater rim photography at low sun angle.

## Budget row

Race <= 150 draws High, <= 120 Low; 3 PCSS cascades (1 on Low); grain on every tier but Low; motion blur and CA only on boost (High/Ultra); DOF only in menu/results; textures <= 2k. Before: menu 122, race 99 draws (`budget.json`). After: phase 2.

## Before/after card frames and distinctness results

Phase 2 (remote captures, sibling judge). See `docs/prds/game-upgrades-47/lanes/g15.md` "Phase-2 plan".
