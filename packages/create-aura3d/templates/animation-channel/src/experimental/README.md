# Quarantined experiments (negative-regression fixtures only)

These three modules are **rejected** Aura3D 1.0.10 animation experiments. They are
kept here as historical / negative evidence only. They are **NOT** imported by
`src/main.ts`, `index.html`, or any release-facing route, and they are **NOT**
referenced by any release-facing npm script.

| File | Rejected approach | Why it was rejected |
|---|---|---|
| `concept-episode-2-5d.ts` | 2.5D still-image parallax | `notTrue3D: true` — parallax over a flat image is not real 3D animation animation |
| `puppet-episode-2d.ts` | Flat 2D cutout puppet motion | `notTrue3D: true` — flat cutout motion is not real 3D animation animation |
| `image-puppet-episode.ts` | Image-derived cutout puppet | `notTrue3D: true` — still-image cutout proof is not accepted readiness |

The flagship/production animation pipeline is the **`animation-studio`** template.
This `animation-channel` template is an example; its release-facing route is
`src/sample-episode-visual.ts`.

The negative-regression Playwright specs
(`tests/{concept-2-5d,puppet-2d,image-puppet}*.spec.ts`) prove that the old
`?view=concept-2-5d`, `?view=puppet-2d`, and `?view=image-puppet` query strings
fall back to the supported sample-episode route and never mount these views or
expose their proof objects. Those specs do **not** import the modules in this
folder — they assert the views are absent. Do not wire these modules back into
the app.
