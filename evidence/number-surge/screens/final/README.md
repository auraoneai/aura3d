# Number Surge: final screens

Route: `/apps/showcase-number-surge/` (`?autoplay=1` plays hands-free; O toggles the autopilot).
Runner: headed Chrome on a real GPU (Apple Metal) via REA, production build served on :8790.

| viewport | frame | meaning |
|---|---|---|
| 1280x720 | 1280-01-title.jpg | title screen |
| 1280x720 | 1280-02-early.jpg | run start, number ball at 10 |
| 1280x720 | 1280-03-action.jpg | ball grown and passing a gate pair |
| 1280x720 | 1280-04-gates.jpg | picking the better gate of a pair |
| 1280x720 | 1280-05-results.jpg | RUN OVER card after a no-input run (wall 1 not smashed) |
| 390x844 | 390-01-title.jpg | title screen |
| 390x844 | 390-02-early.jpg | run start, number ball at 10 |
| 390x844 | 390-03-action.jpg | ball grown and passing a gate pair |
| 390x844 | 390-04-gates.jpg | picking the better gate of a pair |
| 390x844 | 390-05-late.jpg | late run, ball in the thousands |
| 390x844 | 390-06-results.jpg | RUN OVER card after a no-input run (wall 1 not smashed) |
| 720x450 | card-1x.jpg | card: most impressive gameplay moment (LANCZOS downscale of card-2x) |
| 1440x900 | card-2x.jpg | card: most impressive gameplay moment |

Checked in the frames: No escort robot cluster beside the ball. Gates and boss walls visible all run (road rebases every 120 m). Riot guards stand on the wall (static; walk cycle not verified in motion). Ball motion smooth in a 130 ms burst.

Results: Results card reached (no-input run: RUN OVER, 300 m). ?autoplay=1 ran 2,700 m, lost at a 10,320 wall, showed results ~3 s and restarted.

Console page errors: none.

Known issues: none
