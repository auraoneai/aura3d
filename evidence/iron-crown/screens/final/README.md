# Iron Crown: final screenshots (2026-11-18)

Route: `/apps/showcase-iron-crown/`

Runner: headed Chrome on a real GPU (Apple Metal) via REA, production build (http://127.0.0.1:8790).

| Viewport | State | Meaning |
|---|---|---|
| 1280 | `1280-01-title.jpg` | Fighter & Venue picker over the live bout |
| 1280 | `1280-02-early.jpg` | ?autoplay=1 Quick Bout, Crown Arena (neutral key), Kenji vs Mara |
| 1280 | `1280-03-action.jpg` | flying kick connecting, hit spark |
| 1280 | `1280-04-neo-tokyo.jpg` | Neo-Tokyo Rooftop (`?stage=neo-tokyo-rooftop`), Kenji vs Mara: wet floor clean around the feet (no floor "steam") |
| 1280 | `1280-05-lantern-dock.jpg` | Lantern Dock |
| 1280 | `1280-06-colosseum.jpg` | Colosseum Ruins, knockdown (standards now at the wings, not centre stage) |
| 1280 | `1280-07-airstrip.jpg` | Desert Airstrip |
| 1280 | `1280-08-results.jpg` | result card (VICTORY, stats, Next bout / Rematch / Main menu); short match via `?icdebug=1&icfinish=4` |
| 390x844 | `390-01-title.jpg` | Fighter & Venue picker on a phone |
| 390x844 | `390-02-crown.jpg` | portrait bout, Crown Arena: both fighters whole inside the HUD-safe frame |
| 390x844 | `390-03-neo-tokyo.jpg` | portrait, Neo-Tokyo Rooftop (was: camera too close, one fighter filling the frame) |
| 390x844 | `390-04-lantern-dock.jpg` | portrait, Lantern Dock |
| 390x844 | `390-05-colosseum.jpg` | portrait, Colosseum Ruins |
| 390x844 | `390-06-airstrip.jpg` | portrait, Desert Airstrip |
| 390x844 | `390-07-monastery.jpg` | portrait, Cloudstep Monastery |
| 390x844 | `390-08-results.jpg` | portrait result card |
| 1440x900 | `card-2x.jpg` | Crown Arena strike exchange under the neutral key, throne and dragon columns (`card-1x.jpg` = 720x450 LANCZOS downscale) |

## Checked in the frames

- no black screen on Quick Bout or venue switch, no page errors
- strikes reach the opponent (hit sparks at contact); fighters cannot pass through each other (push-box separation)
- no see-through holes on fighters in close crops (Boulder, Mara, Kenji, Seraph); hands intact
- Crown Arena background colour measured on a real-GPU 1280x720 frame: lit-background CIELAB C* 15.5 -> 9.7, b* 14.2 -> 1.9; all venues C* <= 11, b* <= 6
- Monastery bonsai pine and Colosseum battle standards no longer stand in the middle of the fight (wind set pieces now placed on the instance)

- Portrait framing (`?icframelog=1` logs both fighters' projected boxes): every venue on 390x844, both fighters' boxes
  stay within x 0.10-0.91, y 0.51-0.86 of the frame across a bout (HUD plates end near y 0.15, mode strip starts near 0.93);
  the win shot keeps the winner whole and the lens above the floor; the intro close-ups hand portrait to the fight lens
- Neo-Tokyo "floor steam" was the wet clearcoat floor mirroring the rooftop_night HDRI (A/B on the GPU: environment off
  removed it; SSR, rain and light shafts off did not). Environment rotation 140 -> 230 deg; the flood shaft also stops
  above head height and the back rims end 5 m out (no rim pool on the floor in front of the feet)

## Known issues

- Landscape win shot is a low hero framing that crops the winner at the knees (authored; the victory clip steps the
  winner ~0.6 m off its body point)
