# Hoops hotfix-432: the hand was a metre above the bounce (found on the live 4.3.1 page)

## What the live page showed

`hoops-prod-capture.spec.ts` drives https://aura3d.auraone.ai/apps/showcase-aura-hoops-3d/ (4.3.1, Quick Play, default camera, human handler standing then holding W; `?diag=1&qaDt=0.0167` only adds probes and a 60 Hz step). `before-4.3.1-prod/` holds six of its frames: the handler's hand is at hip height and the ball is a long way in front of and below it, standing and running, in every phase, although the bone-space probe said palm and ball were within 0.001 m horizontally.

## Cause

The athletes and the ball are `scaleMode: "fit"` models, which the renderer grounds on their lowest point (`T(-centerX, -minY, -centerZ)` inside the model matrix). Hoops placed the athletes at `y + 0.96` ("origin at the centre") and the ball by its centre height. So every athlete was drawn 0.96 m above his own ring, shadow and the bouncing ball (the ball bounced a metre below the drawn hand in every pose), and the fitted ball rotates about its lowest point, so its centre also wobbled by up to a radius. Every probe read the bones in the model's native space (which has its own +0.96 m origin), so each one agreed with itself and never with the screen.

## Fix (this branch)

- Athletes sit at floor height (`.position(0, 0, 6)`, `setPosition(a.x, a.y, a.z)`): the bone to world conversion (`0.96 + a.y + local y`) was already right for a grounded model.
- The ball node is placed at `centre - R*(0, radius, 0)` for the spin of the frame, so the drawn ball centre is the sim ball.
- New screen-space probe `tests/browser/hoops-dribble-screen.spec.ts` (`?diag=1&qaDt=0.0167&qaStep=1`, default camera): projects the drawn palms (red right, orange left), ball centre (green), hips (white), foot (cyan) and the athlete's floor ring position (magenta) through the live camera, draws the markers on the page and measures palm-to-ball distance in ball diameters at the meet and the floor contact. Lesson M15.

## Frames (software WebGL2, 480x300, default camera, consecutive 60 Hz steps, a frame every 2 steps)

- `before-marked/` (4.3.1 code): the magenta ring and cyan foot markers sit on the floor a metre BELOW the drawn athlete's feet; the athlete floats above his ring.
- `after-marked/` (this fix): the athlete stands on his ring, the palm markers sit on the drawn hands, the ball beside them. 15 standing frames (about 2 bounce cycles from phase 0.47 to 0.49) and 15 running frames (about 2 cycles); 14 of them were read at full size, plus 13 of the production frames above and 5 `before-marked` frames.

Screen-space numbers (palm dot to ball dot, in ball diameters; the dot is the bone-space palm, which now coincides with the drawn hand): meet 0.47 standing / 0.49 running; floor contact 1.2 standing / 1.38 running (palm 0.45 m / 0.54 m above the floor, ball centre 0.13 m). These two floor-contact numbers are what the owner sees as "the hand is above the ball at the bounce": it is physically right (the hand follows the ball down and lets go), they are not a contact criterion.

## Not verified

- The automated "drawn feet on the floor / drawn ball centre equals sim ball" check (`handle.bounds()`, beacon `drawn`, `handProbe.bounds`) was fixed after the last run and has not run on the remote runner yet.
- The `after-marked` run is the local build under the dev server, not the deployed page: the production page can only be re-captured after a deploy.
- Frames are software GL at 480x300 (the 1440x900 DPR 1 and 960x600 DPR 2 production captures were too slow to finish: 4 and 2 frames per hour).
- AI handlers: the AI path shares the same placement code, but the screen-space run covered the human handler only.
- Other games that place fitted models by their centre may hover the same way (Diamond was fixed by its own lane).
