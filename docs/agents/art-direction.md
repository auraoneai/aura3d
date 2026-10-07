# Art Direction for Aura3D Agents

Version: 3.0.0 (supersedes `cinematic-scene-quality.md`)

Every scene an agent ships has a look: an environment, a key light, a shadow,
a background, fog, a grade. This doc is the API-level companion to the
`aura3d-art-direction` skill — the skill owns the process, this doc owns the
values.

## The look does the work

A look preset supplies, as one unit:

- image-based environment light and reflections (IBL),
- a key light at a defined elevation/azimuth with full-strength shadows,
- a background (sky, backdrop or declared void),
- fog / atmosphere tuned to the palette,
- an output post grade (`output.preset`),
- DPR and quality caps (`looks.appOptions`).

```ts
import { createAuraApp, looks, model, scene } from "@aura3d/engine";
import { assets } from "./aura-assets";

createAuraApp("#app", {
  scene: scene().add(looks.preset("product-studio")).add(model(assets.product)),
  ...looks.appOptions("product-studio")
});
```

## Genre recipe rows

Pick the row by genre, then read the full table in
`packages/aura3d-cli/skills/aura3d-art-direction/references/look-recipes.md`.

| Genre | Look | Camera | Post grade | Signature accent |
| --- | --- | --- | --- | --- |
| platformer | `outdoor-day` | `follow` (side-on) fov 50 | `daylight-outdoor` | coin gold on saturated greens |
| racing | `golden-hour` | `chase` fov 60 | `cinematic-film` | headlight amber on warm asphalt |
| fighting | `arena-fight` | `follow` (side-on) fov 45 | `arena-fight` | spotlight rim on dark arena |
| arena shooter | `space` | `orthographic` (top-down) | `space` | laser magenta on graphite |
| sports/table | `interior-industrial` | broadcast high angle | `product-studio` | felt/turf green, line white |
| product viewer | `product-studio` | `orbit` fov 40 | `product-studio` | brand color on plinth |
| character showcase | `character-showcase` | `orbit` fov 35 | `product-studio` | cloth accent, catchlights |
| outdoor environment | `outdoor-day` | `follow` fov 55 | `daylight-outdoor` | greens + horizon fog |
| interior | `interior-warm` | `perspective` fov 50 | `product-studio` | warm pools on wood |
| night city | `night-city` | `follow` street level | `neon-night` | neon signage, wet reflections |
| space | `space` | `orbit` fov 50 | `space` | single hard key, rim |
| underwater | `underwater` | `follow` fov 55 | `underwater` | caustic shafts, biolume |
| cinematic | `golden-hour` | `dolly` fov 45 | `cinematic-film` | teal shadow vs amber key |

`output.preset` ids are one of `product-studio`, `daylight-outdoor`,
`neon-night`, `space`, `underwater`, `arena-fight`, `cinematic-film`.

## The 12-item hard checklist

Before any screenshot counts as evidence:

1. IBL on (environment light present — not a void),
2. key shadow at full strength, contact shadow under the subject,
3. DPR ≥ `min(dpr, tier cap)` via `looks.appOptions`,
4. background is a sky/backdrop or explicitly declared — never a bare void,
5. fog or atmosphere for depth on outdoor/interior scenes,
6. grade comes from the look's `output.preset` — no hand toneMapping,
7. subject occupies 15–70% of frame height by genre,
8. no pure-primary primitives as the subject,
9. characters are animated (idle at minimum),
10. HUD lives in DOM, not in-world geometry,
11. no debug overlay in shipped frames,
12. `aura3d look lint` is clean (15 codes: `look/no-ibl`, `look/no-lights`,
    `look/solid-void`, `look/ambient-kills-ibl`, `look/ambient-flattens`,
    `look/weak-shadow`, `look/low-dpr`, `look/double-aa`, `look/debug-overlay`,
    `look/primitive-subject`, `look/fake-effect-names`, `look/multiple-looks`,
    `look/expansion-mismatch`, `look/flat-palette`, `look/capture-branch`).

## The look-dev loop

```bash
aura3d look capture --route / --shots opening,mid,action --viewports desktop,mobile
aura3d look judge --validate look-judgement.json   # rubric scores per frame
aura3d look lint                                    # static + runtime lint codes
```

1. Capture the route.
2. Judge each frame against the 12-category rubric
   (`aura3d-art-direction/references/quality-bar.md`, printable via
   `aura3d look rubric`).
3. Apply the single highest-leverage fix — lint codes first, then the weakest
   rubric category.
4. Re-capture. Repeat until every category reads 7+, the 6-round cap, or two
   flat rounds.

## Failure patterns that kill the look

`aura3d-art-direction/references/failure-gallery.md` lists the nine canonical
frames (void background, flat shading, ambient soup, floating subject,
primitive soup, fake-effect primitives, debug HUD, renderer overrides,
capture-only lighting) with the lint code each trips.

## Claims

A look claim without a captured frame is `prototype`. See
[visual quality standard](../project/showcase/visual-quality-standard.md) for
the release bar and `aura3d-evidence-review` for claim labels.
