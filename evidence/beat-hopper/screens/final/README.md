# Beat Hopper: final screens

Route: `/apps/showcase-beat-hopper/` (`?autoplay=1` plays hands-free; O toggles the autopilot).
Runner: headed Chrome on a real GPU (Apple Metal) via REA, production build served on :8790.

| viewport | frame | meaning |
|---|---|---|
| 1280x720 | 1280-01-title.jpg | title screen |
| 1280x720 | 1280-02-early.jpg | run start, skater bot in the centre lane |
| 1280x720 | 1280-03-duck.jpg | bot ducking under a plasma gate |
| 1280x720 | 1280-04-action.jpg | beat-orb collect burst |
| 1280x720 | 1280-05-jump.jpg | bot mid-jump with burst |
| 1280x720 | 1280-06-results.jpg | SET COMPLETE results after a no-input run |
| 390x844 | 390-01-title.jpg | title screen |
| 390x844 | 390-02-early.jpg | run start, skater bot in the centre lane |
| 390x844 | 390-03-action.jpg | beat-orb collect burst |
| 390x844 | 390-04-duck.jpg | bot ducking under a plasma gate |
| 390x844 | 390-05-late.jpg | late run, speaker crates passing |
| 390x844 | 390-06-results.jpg | SET COMPLETE results after a no-input run |
| 720x450 | card-1x.jpg | card: most impressive gameplay moment (LANCZOS downscale of card-2x) |
| 1440x900 | card-2x.jpg | card: most impressive gameplay moment |

Checked in the frames: Bot is violet-lit with a cyan rim (not grey/untextured) and animated: run, duck, jump and lane changes differ frame to frame. Speaker crates and duck bars now need a real clear (no pass-through scoring).

Results: Results card reached (no-input run: SET COMPLETE 50, 3 misses). ?autoplay=1 played 4 min (140k, x5) without losing a life.

Console page errors: none.

Known issues: Bot is small at the 1280 default camera but bright and findable.
