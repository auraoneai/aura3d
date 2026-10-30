# Slingshot Siege identity sheet (GU47 WP-22, lane g12)

"Tilt-shift seaside siege diorama through one day": a painted wooden toy siege on a chalk sea-stack island, filmed
through a tilt-shift lens from a crisp morning to a lantern-lit starry night. Source of truth: the look table
`apps/showcase-slingshot-siege/src/game/look.ts` (one row per chapter), the art direction
`apps/showcase-slingshot-siege/src/art/direction.ts` (audit record `direction.audit.json` beside it) and the VFX
preset pack `apps/showcase-slingshot-siege/src/game/vfx.ts`. All numbers are software WebGL2; frames, judge results
and distinctness numbers are phase 2.

## Palette

| Role | Name | Hex |
|---|---|---|
| primary | chalk cliff | `#ece7da` |
| primary | sea teal | `#2f8f9d` |
| primary | bleached sand | `#e9d6a8` |
| primary | driftwood | `#a08466` |
| accent (day, ch0-ch4) | pennant red | `#e2483d` |
| accent (night, ch5) / reserved objective | lantern amber | `#ffb347` |
| island turf (ch1 dustier `#94a05e`) | sea-meadow turf | `#7c9a52` |
| shallows / wet rock | | `#5fb3ae` / `#5f5b52` |

## Variants (chapter c opens at `?level=5c`; luma targets `slingshot-siege--ch0` ... `--ch5`)

| Chapter | Time of day | Look preset | Image light (E-A catalogue) | Visible sky | Sun el / az, colour, intensity | Fog (colour, near-far m) | Output preset | Grade (contrast, sat, temp) | Bloom thr / vignette | Practicals |
|---|---|---|---|---|---|---|---|---|---|---|
| ch0 Driftwood Cove | crisp morning | outdoor-day | `spruit_sunrise` x1.0, rot 118 | gradient `#4a8fd0` to `#f2dcc2`, light cloud | 35 / 118, `#ffe2c2`, 3.2 | `#e6dccd`, 40-320 | daylight-outdoor | 1.06, 1.05, +0.04 | 0.9 / 0.18 | - |
| ch1 Quarry Rise | dusty noon | outdoor-day | `outdoor-midday` x1.0, rot 160 | gradient `#2e6fb8` to dusty `#dcd8c6` | 62 / 160, `#fff5e4`, 3.6 | `#dcd3bd`, 30-240 | daylight-outdoor | 1.10, 0.95, +0.08 | 0.9 / 0.18 | - (dust: E4) |
| ch2 Greenhouse Perch | misty overcast | overcast | preset `autumn_field_puresky` x1.6, rot 40 | gradient grey `#97a3ac` to `#ced4d7`, 90% cloud | 48 / 100, `#e4eaf0`, 1.5, soft PCSS | `#c8cfd2`, 14-150 | daylight-outdoor | 0.97, 0.86, -0.06 | 0.9 / 0.20 | - (mist: E4) |
| ch3 Windmill Gap | golden hour | golden-hour | `kloppenheim_06_puresky` x1.0, rot 145 | Preetham turbidity 4.5, golden cloud | 14 / 145, `#ffb26a`, 2.8 | `#e2aa7c`, 30-260 | cinematic-film | 1.08, 1.08, +0.28 | 0.85 / 0.22 | sun flare |
| ch4 Gull Keep | stormy red sunset, drizzle | golden-hour | `belfast_sunset_puresky` x2.2, rot 215 | Preetham turbidity 9, 65% storm cloud | 8 / 215, `#ff7c4c`, 2.4 | `#b56c5e`, 22-200 | cinematic-film | 1.12, 1.10, +0.35 | 0.8 / 0.26 | 2 window points, sun flare (drizzle: E4) |
| ch5 Moon Roost | starry night, lantern light | polar-night | `deep_space_starfield` x1.0 | gradient night `#050a1a` to `#1a2848`, 1400 stars | 30 / 300 (moon), `#9db8e8`, 1.1 | `#0e1729`, 30-220 | neon-night | 1.08, 0.90, -0.22 | 0.6 / 0.30 | 2 window points, lighthouse spot, harbour lantern |

Every chapter: one shadowed sun (PCSS, two cascades fitted to the island), no ambient, no hemisphere, no fill
directionals, fog on, sun contact shadows, a miniature AO radius (0.30 m), the animated world-water sea to the
horizon with shoreline foam.

Environment sources: 5 distinct HDRIs (spruit_sunrise, outdoor-midday, autumn_field_puresky, belfast_sunset_puresky,
deep_space_starfield) plus kloppenheim_06_puresky (E-A notes outdoor-midday is the same sky as kloppenheim_06; they are
used at different rotations and for different chapters). None of them is the game's primary visible environment: the
visible background is the chapter's sky node (`environment.background: "sky"` in the art direction), so the
`look-identity` primary-HDRI rule does not apply. Secondary IBL uses (PRD §6.1) and their rotation/intensity are the
table columns above.

## Signature effect

"Tilt-shift miniature focus band that keeps the toy fort crisp over a real sea horizon, through six times of one
seaside day." The band is the E-C tilt-shift DOF (`tiltShift { bandCenter, bandWidth }`), retargeted every frame from
the projected fort, sling and live shot (`app.post.setEffect("depthOfField", ...)`). High tier and up; on Low the
engine drops DOF and the painted toy palette, the sky and the sea horizon carry the diorama (PRD §6.4 fallback cue).

Distinct from G06 pips-big-leap ("shallow-focus miniature DOF", forest platformer, moss and toadstool palette) and G14
cross-hop ("tilt-shift blur bands + moving sun", chalk mint and butter palette): Slingshot Siege is the only game whose
band rides a projected flight lane over a real sea horizon, and the only seaside chalk/teal/sand palette.

## Before / after card frames, budget row, distinctness results

Phase 2 (remote captures of `slingshot-siege--default` and `--ch0` ... `--ch5`; sibling judge against G13 dot-dash-3d
and G23 where-the-wind-wanders-port, the arcade genre group). Budget rows: `budget.json` beside this file.
