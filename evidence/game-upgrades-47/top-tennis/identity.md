# Aura Slam 3D (top-tennis) identity sheet: "World Tour broadcast" (GU47 WP-11, lane G01)

A long-lens TV tennis game on a world tour: each venue has its own hour and climate. Source of truth for every number
below: `examples/aura-slam/view/look.ts` (`VENUE_LOOKS`), `examples/aura-slam/art/direction.ts` and
`examples/aura-slam/view/vfx.ts`. All visual numbers are software WebGL2 and are measured in phase 2.

## Palette

| Role | Hex | Swatch use |
|---|---|---|
| primary: navy acrylic | `#14284a` | New York night court, scorebug base |
| primary: racing green | `#1f4d36` | London turf surround, sponsor boards |
| primary: terracotta | `#c4653f` | Paris clay |
| primary: teal | `#2f8f8a` | Dubai / beach courts |
| accent: electric yellow | `#d8ff3e` | ball, trim, ball trail |
| reserved objective: out-call red | `#ff3b30` | out-call ring, net fault LEDs (never decorative) |

## Variants (target `top-tennis--<variant>`, param `?venue=`)

| Variant | City | Time of day | Sky / HDRI (E-A id, intensity) | Key | Fog | Output preset (exposure) | Burst / mark |
|---|---|---|---|---|---|---|---|
| `default` (hard) | New York | floodlit night 21:30 | `rooftop_night` 1k, 0.35, background | floodlight-bank key 58/180 #e6eeff + 4 corner floods | `#0b1426` 0.008, 4 light cones (TT-E2, pending) | arena-fight (1.0) | hard-skid `#6cc8ff` / `#c9d6e3` 9 s |
| `grass` | London | late morning 11:00 | `kloppenheim_02` 1k, 0.9, background | sun 40/120 #fff1dc 2.6, PCSS 0.9 | `#cfdbe6` 0.005 | daylight-outdoor (1.0) | grass-flick `#a8c78e` / `#cfe0b4` 12 s |
| `clay` | Paris | 18:30, 18-degree golden raking light | `venice_sunset` 1k, 0.8, background | sun 18/250 #ffc27a 3.1, PCSS 0.6 | `#e3a46a` 0.008 | cinematic-film (1.0) | clay-puff `#e88d63` / `#8e3e1f` lasts the set |
| `desert` | Dubai | noon 12:30, white-hot haze | `outdoor-midday` 1k (2k asked of E-A), 1.1, background | sun 72/10 #fffaf0 4.0, PCSS 0.4 | `#e8d2b0` 0.016 + volumetric at High+ | daylight-outdoor (1.3) | hard-skid `#f2c08a` / `#d7c19c` 9 s |
| `beach` | Tropical Beach | sunset 19:10, magenta sky | `sunset-dramatic` 1k (2k asked), 0.85, background | sun 8/290 #ff8f72 2.4, PCSS 0.8 | `#e09a86` 0.01 | cinematic-film (1.0) | hard-skid `#91e7de` / `#b9e3df` 9 s |
| `moon` | The Moon | lunar day, one hard sun, Earth in view (TT-E3 pending) | `deep_space_starfield` 1k (2k asked), 0.05, background | sun 25/60 #ffffff 4.4, PCSS 0.05 | none | space (1.2 from the preset) | regolith-drift `#cedbff` / `#6f747a` 30 s |

Sun angles: elevation / azimuth in degrees, engine look basis (azimuth 0 = toward the broadcast camera, 90 = +X). Every pair
of sun venues differs by at least 40 degrees of azimuth (unit test). `?look=original` keeps the 4.6.1 frame (four-light
rig, flat backdrop, 4.6.1 post) for before/after captures.

## Signature effect

`signatureEffect`: "Surface-coloured ball marks that persist where the ball landed, venue-tinted bounce puffs, and a seated
crowd whose heads follow the rally."

- Ball marks: `app.effects.decal` per bounce in the venue's mark colour (one merged decal batch, at most 96 on court;
  clay marks last the set). Bounce puffs: registered `clay-puff` / `grass-flick` / `hard-skid` / `regolith-drift` bursts
  coloured from `VENUES[].particleColor`. Out calls: a red ring at the mark.
- Crowd heads follow the rally: TT-AN1 (see the lane report for status).
- Low tier: marks and puffs stay (runtime particles are tier-capped, decals are one batch); reduced motion halves every
  burst and skips the ace flash; `?vfx=off` drops them.

## Distinctness (PRD §6.1, sports group G01, G07, G08, G09, G10)

- Primary visible environment: `rooftop_night` (boot venue). G01 is listed first in the sports group, so WP-38 assigns a
  shared primary to G01 (PRD §6.1 last paragraph). Other HDRIs are secondary venue skies.
- Known file overlaps for WP-38: `outdoor-midday_1k.hdr` is a byte copy of `kloppenheim_06_puresky_1k.hdr`
  (`public/hdri/ATTRIBUTION.md`); `rooftop_night`, `venice_sunset`, `outdoor-midday` and `deep_space_starfield` also appear
  in other sports rows of §6.1 (G07, G08, G10). The `look-identity` check compares primary environments only.
- No rooftop prop or cyan floodlit Moon shared with Diamond: the Moon here is a hard white sun on grey regolith; the two
  `rooftop*Meshy` props are replaced by tennis-only models in TT-A2 (WP-36 assets).
- Signature string is unique among live games (ball marks + bounce puffs + head-following crowd).

## Budget row (PRD WP-11)

<= 150 draws at 1280 High, <= 170 at 390x844, <= 450k tris, <= 96 MB GPU textures, active venue <= 18 MB download, frame
time +20% max. Before: 115-126 draws at 1280, 151-165 at 390 (`evidence/aura-slam/audit-2026-10-29/after/meta.jsonl`); after:
phase 2 (`budget.json`).

## Frames and judge results

Phase 2: before/after card frames per venue, sibling judge vs the other sports games, look judge round (TT-H3).
