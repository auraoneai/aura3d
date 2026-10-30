# Bunker Zero identity sheet (GU47 WP-21, "Cold-War bunker lit by its own fixtures")

Phase-1 sheet: palette, variants, environment and signature as coded on `gu47/g11`. The before/after card frames, the
budget row with measured numbers and the distinctness results are phase 2 (remote steady-state captures, software
WebGL2) and are added here then.

- Game: Bunker Zero (`bunker-zero`), app `apps/showcase-bunker-zero`, genre group "Action and fighting" (with G05 Iron Crown).
- Art direction: `apps/showcase-bunker-zero/src/art/direction.ts` (`arena-shooter`, one shadowed spot key, IBL fill, 6 practicals); audit record `src/art/direction.audit.json`.
- Look table: `apps/showcase-bunker-zero/src/art/look.ts` (`BZ_LOOK`, one row per floor); light rig `src/art/lightRig.ts`; effect pack `src/art/vfx.ts`.

## Fantasy

A buried Cold-War civil-defence bunker lit only by its own fixtures: caged tungsten bulbs, mercury-vapour and sodium
lamps, flickering fluorescent tubes and red alarm beacons, with deep shadow and dust haze between the pools of light.
The only first-person, practically lit, underground game in the set.

## Palette

| Role | Hex | Use |
|---|---|---|
| primary: concrete grey | `#77756e` | board-formed concrete walls and floors |
| primary: olive steel | `#4f5531` | blast doors, cabinets, plant |
| primary: rust | `#7a3f22` | pipe runs, grates, debris |
| accent: hazard yellow | `#e8b400` | hazard yellow-black stripes, the only saturated accent |
| accent pair: hazard black | `#16150f` | stripe partner |
| reserved objective | `#ffb648` | the brass key and the elevator |

## Variants (one lamp colour per floor)

| Variant (`?floor=`) | Floor | Fixture | Lamp | Hue | Fog (30% of lamp) | IBL | Reference viewpoint |
|---|---|---|---|---|---|---|---|
| floor1 (`1`) | Stone Gatehouse | caged tungsten, 2700 K | `#ffad5c` | 30 deg | `#4d341c` | hangar_interior 0.35 | start (1,1) looking east down the gate corridor |
| floor2 (`2`) | Flooded Cellars | mercury vapour, green-teal | `#6fe3c0` | 162 deg | `#21443a` | 0.40 | (8,2) looking east over the flooded cellar |
| floor3 (`3`) | Forge Halls | forge glow from the grates (lights at grate height) | `#ff6a24` | 19 deg | `#4d200b` | 0.30 | start looking east |
| floor4 (`4`) | Officer's Vault | brass sconces over wood | `#e9cf62` | 48 deg | `#463e1d` | 0.32 | start looking east at the panelled wall |
| floor5 (`5`) | The Descent | cold fluorescent tubes (flicker) | `#cfe8ff` | 209 deg | `#3e464d` | 0.45 | start looking east |
| floor6 (`6`) | Bunker Zero | red alarm beacons + moonlit hatch shaft | `#ff2a1f` | 3 deg | `#4d0d09` | 0.25 | (12,13) looking north at the Warden under the hatch |
| killhouse (`kh`) | Kill House | white floods | `#f2f5ff` | 226 deg | `#494a4d` | 0.40 | start looking east |

Adjacent descent floors' lamp hues differ by at least 25 degrees (BZ-02; unit test `art-direction.test.ts`): 132, 143,
29, 161 and 154 degrees.

## Environment and sky

- IBL: `hangar_interior` (E-A catalogue, `/hdri/hangar_interior_1k.hdr`, 1,761,250 bytes < 2 MB), intensity 0.35 per the WP and 0.25 to 0.45 per floor, `background: false`.
- Not a primary visible environment: the art direction declares `background: "enclosed"`, so the `look-identity` HDRI duplicate rule does not apply. Secondary IBL-only users of the same file: G06 Pip's Big Leap and G08 Diamond (PRD §6.1) use it for their own worlds; Bunker Zero's use differs in intensity (0.25-0.45 IBL only) and is never seen as a background.
- Sky: none, except the F6 hatch: a 3x3 opening over the Warden arena under a night backdrop, lit by the moon key (directional, the strongest light on F6).

## Signature effect

"Gunfire lights the room": every shot, ricochet and blast throws a warm transient light (`#ffd59a`, the E-F transient
pool: Medium 2, High 4, Ultra 8 lights) across board-formed concrete between the pools of the floor's own lamps. Low
tier has no transient lights; there the muzzle sprite, sparks and bloom carry the cue (PRD §6.4).

## Distinctness (phase-1 reasoning; judged in phase 2)

- vs G05 Iron Crown (same genre group): Iron Crown is a third-person fighting stage under a single follow-spot with
  molten gold and ember crimson on black iron, outdoor and venue HDRIs as backgrounds; Bunker Zero is first person,
  enclosed, lit by many visible fixtures, concrete/olive/rust with hazard yellow.
- No other live game is first person, underground or practically lit; hazard yellow-black is not another game's accent.

## Budget row

`evidence/game-upgrades-47/bunker-zero/budget.json` (`before` from the newest committed evidence, `after` phase 2).
