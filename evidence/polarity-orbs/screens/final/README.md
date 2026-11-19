# Polarity Orbs: final screens

Route: `/apps/showcase-polarity-orbs/` (`?autoplay=1` plays hands-free; O toggles the autopilot).
Runner: headed Chrome on a real GPU (Apple Metal) via REA, production build served on :8790.

| viewport | frame | meaning |
|---|---|---|
| 1280x720 | 1280-01-title.jpg | title screen over the magnetic causeway |
| 1280x720 | 1280-02-early.jpg | intro camera at run start |
| 1280x720 | 1280-03-action.jpg | ball under a flux-gate arch with orb rows |
| 1280x720 | 1280-04-mid.jpg | same moment that used to put the camera inside the arch; view now clear |
| 1280x720 | 1280-05-results.jpg | GAME OVER card after a no-input run |
| 390x844 | 390-01-title.jpg | title screen over the magnetic causeway |
| 390x844 | 390-02-early.jpg | intro camera at run start |
| 390x844 | 390-03-action.jpg | ball under a flux-gate arch with orb rows |
| 390x844 | 390-04-mid.jpg | same moment that used to put the camera inside the arch; view now clear |
| 390x844 | 390-05-late.jpg | late run, x5 combo |
| 390x844 | 390-06-results.jpg | GAME OVER card after a no-input run |
| 720x450 | card-1x.jpg | card: most impressive gameplay moment (LANCZOS downscale of card-2x) |
| 1440x900 | card-2x.jpg | card: most impressive gameplay moment |

Checked in the frames: Ball and orbs readable; gyro rings turn smoothly (130 ms burst). Deck/rails visible all run (fixed: culled after ~420 m). Flux-gate arches raised so the chase camera no longer flies through the keystone.

Results: Results card reached (no-input run: GAME OVER 680, 191 m). ?autoplay=1 played 4 min without losing a life.

Console page errors: none.

Known issues: none
