# Lamplight Line (last-train-port): identity sheet (GU47 WP-31)

"The last tram before dark": one service from late afternoon at Mango Tide to blue hour at Saltlight Terminus. The sun sinks leg by leg and the lamps, windows and the tram's bulbs take over. A warm tilt-shift miniature of pastel hill towns floating on a sunlit cloud sea.

## Palette

| Role | Name | Hex |
|---|---|---|
| primary | apricot | `#f6b98a` |
| primary | rose | `#e99aa0` |
| primary | cream stucco | `#f3e6cc` |
| primary | terracotta | `#c4643f` |
| (sky/clouds) | lilac | `#a99ad1` |
| accent (only) | lamplight amber | `#ffc77a` |
| reserved objective | cherry-red livery | `#c2182f` |

Source of truth: `examples/last-train-port/bands.ts` `LAMPLIGHT_PALETTE`.

## Variants (bands, `?band=A..E`; `?look=original` is the 4.6 day/night look)

| Band | Time of day | Towns | Key | HDRI (primary IBL, background off) | Rotation |
|---|---|---|---|---|---|
| A | late afternoon | Mango Tide | sun 28 deg, #ffe3b8, 3.0, PCSS 3 cascades | belfast_sunset_puresky 1k | sun texel on the key azimuth |
| B | golden hour | Folded Gardens, Cedarbell Shrine | sun 12 deg, #ffc489, 2.6 | belfast_sunset_puresky 1k | as A (different azimuth and intensity) |
| C | storm dusk | Drowned Observatory, Monsoon Exchange | sun 6 deg, #f2a476, 1.5; practical pool on | industrial_sunset_puresky 1k | sun texel on the key |
| D | blue hour | Saltlight Terminus | sky key 0.55 #9fb2ff; sun disc 4 deg below the horizon | rooftop_night 1k | 0 (no sun texel) |
| E | moonlight (`N` / night) | any | moon 38 deg #b4c4ff 1.2 | rooftop_night 1k | 0 |

Sky: an authored dome (`sky` custom material) with each town's own hue pushed into the band's sky (`TOWN_SKY_TINT`), afterglow under the sun azimuth and band stars; the cloud sea is lit toward the sun with lilac valleys.

Shared files: belfast_sunset_puresky also appears in the rows of G04, G06, G07, G08, G20, G24; WP-38 resolves primary-sky duplicates (PRD §6.1). This game draws the HDRI as IBL only (background off); its visible sky is its own dome, so the look-identity check's `background: "hdri"` rule does not count it as a primary visible environment. rooftop_night (D/E) is shared with G01, G03, G05, G07, G08, G10, G14 the same way.

## Signature effect

Earned sky lanterns: every clean arrival releases 6-12 paper lanterns from the platform that stay aloft for the session; a catch drops one guttering lantern. One instanced emissive node (`sky-lanterns`, `examples/last-train-port/lanterns.ts`). Unique among live games (`signatureEffect` in `apps/showcase-last-train-port/art/direction.ts`).

## Budget row

Band D <= 190 draws; Low <= 152; <= 320 MB GPU; +8 MB models, +3.6 MB HDRI at 1k (three 1k files: 1.22 + 1.18 + 1.63 = 4.03 MB raw on disk; the over-run is listed in the lane report); JS +40 KB gzip max. Lights add 0 draws. See `budget.json`.

## Phase 2 (not yet measured)

Before/after card frames, band luma rows (`luma-bands.json`), sibling judge vs drift-and-deliver-port, roadster-hours-port, cloud-runner-port, and the look-identity sha results.
