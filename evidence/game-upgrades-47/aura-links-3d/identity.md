# Aura Links 3D (G10) identity sheet: "Golf-broadcast postcard tour"

GU47 WP-20, PRD lines 781-811. Genre group: sports (G01 top-tennis, G07 aura-hoops-3d, G08 aura-diamond-3d, G09 aura-fc-3d, G10). The only open-landscape, natural-light sports game. Look table: `apps/showcase-aura-links-3d/src/game/lighting.ts` (`COURSE_LOOKS`); art direction: `apps/showcase-aura-links-3d/art/direction.ts` (audit `art/direction.audit.json`); VFX pack: `apps/showcase-aura-links-3d/src/game/vfx.ts`. Variant param: `?course=<id>` (exists); `?look=original` mounts the 4.6.2 rig.

## Signature effect

Golf-broadcast camera language: a three-shot hole flyover under letterbox bars, a live shot tracer on every drive and a low cup cam on short putts (LINKS-12). Survives every tier: on Low and under reduced motion the flyover becomes a cut to the hole card shot and the tracer stays.

## Tour palette (art direction)

| Role | Hex |
|---|---|
| links fairway | `#2d7a3e` |
| bunker sand | `#d8b878` |
| harbour sea | `#154c79` |
| pin white | `#f2f0e2` |
| accent (tracer gold) | `#ffd257` |
| reserved objective (pin flag) | `#ff4d3d` |

## Variants (six courses, six places and hours)

| Course (`?course=`) | Place and hour | HDRI (E-A catalogue, 1k) | Sky use | HDRI rotation | Sun az/el | Key | Fog | Grade (contrast / sat / temp / tint) | Post | HUD accent | Palette |
|---|---|---|---|---|---|---|---|---|---|---|---|
| stAuroras | marram dunes and a lighthouse on a cold northern shore; cold sunrise, sea haar rolling in | `spruit_sunrise` | drawn sky + IBL 0.92 | 40.7 deg | 95 / 12 | `#ffd6ae` 2.9 (3600 K) | height haar `#c4cfd6` | 0.97 / 0.86 / -0.12 / 0.02 | bloom 0.30, vignette 0.10, sun flare (High) | `#4fd6a0` | `#5f7d6a` `#c4cfd6` `#d6c39a` |
| mapleHollow | parkland maples over still ponds; warm late afternoon | `autumn_field_puresky` (PRD: 2k, handoff) | drawn sky + IBL 1.0 | 181.4 deg | 235 / 30 | `#ffc58a` 2.7 (3900 K) | exp2 warm haze `#d9b48a` | 1.06 / 1.10 / 0.18 / 0 | bloom 0.36, vignette 0.14, film grain (High) | `#ff5c7f` | `#3f6b3a` `#b8452c` `#e3c48f` |
| cinderRim | a basalt crater rim above lava pools; dusk, lava light and god rays through ash | `industrial_sunset_puresky` | drawn sky + IBL 0.8 | 211.4 deg | 265 / 7 | `#ff9a5a` 2.5 (2600 K) | height ash `#6b5348` + god rays (High) | 1.12 / 1.04 / 0.25 / 0 | bloom 0.50, vignette 0.18, sun flare (High), lava glow points | `#f5a02b` | `#2b2522` `#7a6a4a` `#d8541f` |
| cloudTerrace | alpine terraces above a cloud sea; hard cobalt noon | `outdoor-midday` (PRD: 2k, handoff) | drawn sky + IBL 1.1 | 110.6 deg | 160 / 62 | `#fffaf0` 3.3 (5800 K) | faint exp2 `#bcd6f2` (clear air) | 1.12 / 1.06 / -0.04 / 0 | bloom 0.24, no vignette | `#4d8bff` | `#6d9a58` `#e8f2f8` `#2f5fae` |
| neonBay | a wet harbour front under a neon skyline; floodlit night in teal and magenta | `rooftop_night` | IBL only 0.6 over a navy backdrop `#0a1430` | 237.6 deg | floodlight key 120 / 45 | `#fff1dc` 3.0 (4800 K), moon rim `#7f9dff` | exp2 navy `#0b1532` | 1.14 / 1.18 / -0.08 / 0.06 | bloom 0.62, vignette 0.20, two mast spots + light cones | `#19e0ff` | `#0a1430` `#1f6a52` `#ff3fd2` |
| mareCourse | the regolith of a lunar mare; airless black-sky day under an earthrise | `deep_space_starfield` (PRD: 2k, handoff) | drawn sky + IBL 0.25 | 0 (no sun in the HDRI) | 40 / 25 | `#ffffff` 3.6 (5900 K), earthshine rim `#7fa6ff` | none (no fog node) | 1.18 / 0.90 / 0 / 0 | bloom 0.30, vignette 0.16 | `#a98dff` | `#000000` `#8e9096` `#3d6fd8` |

Every course: one shadowed key (PCSS, 3 cascades on High; PCF, 1 cascade on Low), the HDRI as the fill, an E-A rim instead of any ambient or hemisphere light, its own fog and grade. Sun vectors are at least 25 deg apart pairwise and the HUD accents at least 30 deg apart in hue (unit tests `tests/unit/aura-links-3d/course-look.test.ts`).

HDRI rotation puts each HDRI's brightest texel (measured offline from the 1k files: spruit 54.3 deg az at 7.9 deg el, autumn field 53.6 at 29, industrial sunset 53.6 at 4, outdoor-midday 49.4 at 4.7, rooftop night 242.4 at 4) on the course key's azimuth; phase 2 checks the drawn sun against the shadows.

## Primary environment and shared HDRIs (PRD §6.1)

- Primary visible environment in the art direction: `spruit_sunrise` (the boot course, St. Auroras). The other five are per-variant skies of the same game, each with its own rotation and intensity above.
- Overlaps with genre neighbours (resolved by WP-38 per PRD §6.1): `outdoor-midday` (G01 noon haze, G07 noon, G08 desert noon), `rooftop_night` (G01, G07, G08; Links uses it as IBL only behind navy), `deep_space_starfield` (G01, G07, G08), `spruit_sunrise` (G08 spring sunrise). `outdoor-midday_1k.hdr` is a byte copy of `kloppenheim_06_puresky_1k.hdr` (E-A attribution), the sky the 4.6.2 golden-hour preset used.

## Phase 2 (not in this sheet yet)

Before/after card frames per course (desktop 1280x720 and phone 390x844), the budget rows (`budget.json`), the luma bands and the sibling-judge results vs Hoops, Diamond, FC and Top Tennis (LINKS-19).
