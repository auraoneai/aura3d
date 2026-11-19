# The Bellkeeper's Walk: final real-GPU frames

Route: `/apps/the-bellkeepers-walk/`

Runner: headed Chrome on a real GPU (Apple Metal) via REA, production build (http://127.0.0.1:8790).

| frame | viewport | state | meaning |
|---|---|---|---|
| `1280-01-title.jpg` | 1280x720 | title | title card with controls incl. O autopilot |
| `1280-02-walk.jpg` | 1280x720 | early play | keeper walking (legs mid-stride) with crook and kite |
| `1280-03-oak-letter.jpg` | 1280x720 | discovery | first letter beneath the old oak |
| `1280-04-windmill.jpg` | 1280x720 | second venue | the windmill letter; sails turning, mill on the ground |
| `1280-05-shore.jpg` | 1280x720 | third venue | Glasswater shore letter by the jetty |
| `1280-06-bell.jpg` | 1280x720 | peak | the bell rings, hanging from its yoke |
| `1280-07-results.jpg` | 1280x720 | results | Stillwater Isle card, keeper in the boat |
| `390-01-title.jpg` | 390x844 | title | title card |
| `390-02-walk.jpg` | 390x844 | early play | keeper walking, framed in portrait |
| `390-03-oak-letter.jpg` | 390x844 | discovery | oak letter |
| `390-04-windmill.jpg` | 390x844 | second venue | windmill letter |
| `390-05-results.jpg` | 390x844 | results | results card, keeper in the boat |
| `card-2x.jpg` / `card-1x.jpg` | 1440x900 (1x: 720x450) | card | the keeper with her crook by the old oak, kite flying over the lake, cottage and villager behind |

## Checked in the frames

- keeper body renders at the player (was missing: skinned body nested in the moving group) and is 30-45% of frame height
- legs differ between frames 0.7 s apart; crook held; kite and string fly
- no camera inside tree crowns or the windmill sail sweep (fixed); portrait camera keeps her in frame (fixed)
- cottages, windmill and bell frame grounded; bell hangs from the yoke

## Known issues

- 1280-05-shore was captured before the portrait/hop camera refinement (landscape unchanged except hop aim)
- the windmill letter frame shows a sail close behind her by design (the letter is pinned to a sail)
