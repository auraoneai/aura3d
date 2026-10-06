# Genre looks in the frame

What each genre's look must visibly deliver, at capture time.

| Genre | The frame must show | Kills the look |
| --- | --- | --- |
| platformer | blue sky with depth fog, long grass-edge shadows, warm key on the hero, gold pickups glowing | void background, ambient-only light, floating platforms |
| racing | low warm sun, orange rim on the car silhouette, asphalt reflection, fog band at the horizon | noon-flat light, grey void, no specular on bodywork |
| falling blocks | saturated piece hues against a dark glossy board, bloom on line-clear, rim on the stack edge | washed-out palette, flat board, no glow on clears |
| fighting | top spotlight cones, rim on both fighters, crowd silhouettes in shadow | both fighters evenly lit, empty void arena |
| character showcase | 3/4-front key, rim separating hair/shoulder from backdrop, ground contact shadow | flat fill, floating feet, void |
| night city | neon signage, wet-street reflections, sodium pools, window glow | pure black background, one uniform dark |

## Per-genre VFX palette

| Genre | Accents (emissive 3–5× bg) | Motion cue |
| --- | --- | --- |
| platformer | coin gold, spring green, hazard red | land dust puff, jump trail |
| racing | brake amber, exhaust white, dial cyan | speed lines, tire smoke |
| falling blocks | per-piece neon hue, clear flash white | line-clear flash, lock click glow |
| fighting | impact spark orange, meter cyan | hit sparks, knockback flash |
| character | cloth accent, eye catchlight | footstep dust, hair/cloth sway |
| night city | sign neon, puddle rim | steam wisps, window flicker |
| sports/table | felt green, chalk white, spot warm | ball trail, score flash |
| interior | warm pool amber, accent object hue | dust motes, lamp flicker |
| underwater | caustic teal, biolume cyan | bubbles, particle drift |
| space | laser magenta, engine white | debris drift, shield ripple |

## HUD style

DOM HUD only. Type color follows the look: warm cream on golden-hour, neon
cyan on night-city, high-contrast white on product-studio. Pause/menu layers
inherit the grade (a blur + dark grade band reads as one scene, a raw solid
overlay reads as a bug).

## Lighting story per template

| Template | Key story | Shadow story | Depth cue |
| --- | --- | --- | --- |
| `mini-game` | warm afternoon key 40° | grass-edge shadows toward camera | fog band at far platforms |
| `racing-starter` | low sun behind the car | long streaks across asphalt | haze silhouettes the horizon |
| `falling-blocks-starter` | soft top key | piece self-shadow on stack | board gloss reflection |
| `fighting-game` | overhead spot cones | rim shadows under both fighters | crowd fades to black |
| `character-controller` | daylight key 3/4 front | contact shadow under feet | fog to horizon on the run |

## Mood one-liners

- platformer: cheerful daylight, saturated palette, motion reads as play.
- racing: speed sells through low sun, glare, and horizon haze.
- fighting: drama lives in the dark crowd and the spot's hard edge.
- blocks: rhythm is the palette — every piece hue distinct at a glance.
- character: the silhouette is the gameplay; rim keeps it readable.
