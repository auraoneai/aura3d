# Ion Circuit (heatsink-port) identity sheet: "Alien blue-hour canyon" (GU47 WP-29, lane G19)

Genre group: racing (G02, G03, G04, G15, G18, G19, G21, G22, G24). The only coloured-twilight racer.

## Palette

| Role | Hex | Use |
|---|---|---|
| teal haze (primary) | `#0f3a40` | base fog, below-horizon sky |
| aurora violet (primary) | `#9f8cff` | aurora, top fill, wake tail, checkpoint sparks |
| sunset magenta (primary) | `#ff5ab4` | upper sunset band, kill sparks |
| sunset amber (primary) | `#ffb02e` | lower sunset band, afterburner wake, barrel blasts |
| copper drone (accent) | `#c8743a` | drone hull heat, hit sparks |
| ion cyan (reserved objective) | `#40e0ff` | boost, objectives, cruise wake, causeway veins |

District fog: each of the 8 districts pulls the haze 30% toward its HUD colour over 120 m (Bonewake `#c9a0ff`, Shard Ascent `#ff7ae0`, Luminous Reef `#9f8cff`, Rift Crossing `#40e0ff`, Crown Rise `#ff5ab4`, Astral Shelf `#7fe8ff`, Resonance Well `#b46cff`, Echo Return `#ffb02e`).

## Variants (look table `examples/heatsink-port/art/look.ts`)

| Variant | URL | Time of day | Sky / environment | Key | Post |
|---|---|---|---|---|---|
| twilight (default) | `/apps/showcase-heatsink-port/` | alien blue hour, sun ~15 deg up behind a magenta-to-amber band | authored aurora/planet dome (primary, no HDRI background); IBL only: `sunset-dramatic` 1k rotated to the sun azimuth (-48.4 deg), intensity 0.7 | `[220, 92, -248]` `#ffe0dc` 2.9, 3 cascades / 220 m, drone casts | bloom 0.6/1.0, GTAO 4x4, motion blur, CA 0.0012, grain 0.025, vignette 0.28, god rays, grade sat 1.08 |
| original | `?look=original` | teal night (4.6.x) | same dome at today's values; neutral room IBL 1.0 | `[180, 260, -120]` `#ffd9b0` 2.6, 2 cascades / 160 m | bloom 0.6/1.0, grade 1.05/1.08/1.0, vignette |

Secondary IBL use: `sunset-dramatic` is G01's primary magenta-sunset sky. Here it is IBL only (background off), rotation -48.4 deg, intensity 0.7, so the `look-identity` primary-HDRI hash check does not apply (`environment.background: "sky"`).

## Signature effect

`ion-wake`: a 60-segment camera-facing ribbon from the drone's last 1.2 s, cyan head fading to violet at cruise, amber under the afterburner (`world.ts`, IC-18).

## Distinctness

- vs Thermal Drift (G03 heatsink): no warm foundry palette, no heat haze, no sodium rain; cold teal/violet base with a sunset band only on the horizon.
- vs Craterline GP (G15 strange-orbit-port): no painted terracotta sectors, no brush texture; photographic twilight dome.
- vs Roadster Rush (G02, custom blue-hour dome): G02 is charcoal/tangerine/cobalt with backlit skyway traffic; G19 is an alien canyon with a ringed planet, aurora and an ion wake.

## Phase 2 (not in this commit)

Before/after card frames, the budget row with measured numbers, the sibling-judge results vs Thermal Drift and Craterline GP.
