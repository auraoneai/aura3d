# Chroma Roll (splat-rush-port), GU47 WP-26 identity sheet

"Paint carnival at golden hour": a wet-paint ribbon road through a low-sun painted sky. Lane G16. Look table: `examples/splat-rush-port/look.ts`; art direction: `examples/splat-rush-port/art/direction.ts`; preset pack: `examples/splat-rush-port/vfx3d.ts`.

## Palette

| Role | Hex |
|---|---|
| Zenith (ink teal) | `#1f4a63` |
| Horizon (apricot) | `#f3a96b` |
| Rose band | `#e8798a` |
| Cloud sea (lilac) | `#a99bc9` |
| Sun / accent | `#ffc58a` |
| Ink outline (plum) | `#3b1f3f` |
| Rails (plum enamel) | `#6a3a6c` |
| Gate colours (reserved, most saturated) | `#f0433a`, `#f9c647`, `#5ecaf0`, `#b868e8` |

## Variants

| Variant | URL | Time of day | Sky | IBL (GLBs only) |
|---|---|---|---|---|
| carnival (default) | `?look=carnival` | golden (<= 500 m), rose dusk (3,500 m), violet twilight with 120 stars (>= 6,500 m), from the run distance | custom five-stop sunset dome (`CARNIVAL_SKY_FRAGMENT`), 1.6 deg sun disc, cirrus | `kloppenheim_06_puresky_1k`, intensity 0.65, rotation 145 deg, background off |
| original | `?look=original` | noon (4.6.0) | four-stop canvas gradient | neutral room 0.8 |

Primary visible environment: the custom dome (`environment.background: "sky"`), so `look-identity` does not hash an HDRI as this game's primary sky. Secondary IBL-only use of `kloppenheim_06_puresky` is shared with G23 (where-the-wind-wanders) and last-train (`examples/last-train-port`, intensity 0.8, rotation 0); this game differs in rotation (145 deg) and intensity (0.65).

## Signature effect

Hand-inked cel paint carnival at sunset: plum-inked toon ribbon road under a golden-to-violet painted sky with gate-coloured paint splashes.

Distinctness: not noon-blue (Cumulus Dash / cloud-runner G25 is mid-morning cobalt; Serpentine G17 is an indigo-coral evening colour script on a serpent road). G20 ninja-runner also has an evening by distance and ink outlines, but indigo/persimmon with a vermilion scarf ribbon on rooftops; this game's dome is ink-teal over apricot with a lilac cloud sea and a gate-colour paint palette.

## Frames, budget row, judge results

Phase 2 (remote captures). Budget: `budget.json`.
