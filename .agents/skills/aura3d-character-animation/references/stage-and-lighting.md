# Character staging and lighting

How to stage a rigged character so the animation itself is what a reviewer
sees.

## Stage

| Setup | When | Look | Frame |
| --- | --- | --- | --- |
| Showcase plinth | clip demos, locomotion cycles | `character-showcase` | full body, 60–70% of frame height |
| Walk path | locomotion proof | `outdoor-day` | character 25–40%, path leads forward |
| Fight pair | combat clips | `arena-fight` | both fighters inside spotlight pools |
| Interior | dialogue, visemes | `interior-warm` | head-and-torso, catchlights visible |

## Lighting reads for motion

- Rim light is what separates a moving silhouette from the backdrop — under
  `night-city` or `arena-fight` the rim does more work than the key.
- Ground contact shadow sells weight: feet must plant inside the shadow blob,
  not beside it (floating feet = `weak-shadow` / grounding lint).
- Golden-hour key gives long dramatic shadows for walk cycles; overcast gives
  even exposure for cloth and morph inspection.
- Keep the palette quiet — one accent (cloth or trim) plus neutral stage
  colors, so motion draws the eye instead of props.

## Camera for animation proof

- `follow` rig for locomotion (side-on for gait, 3/4 for turn animations).
- `orbit` for pose/morph inspection on a plinth.
- Cut between a wide framing (whole body, 60–70%) and a close framing
  (head/visemes, 40%) — never mid-body crops that amputate feet.
