---
name: aura3d-art-direction
description: Sets the visual target and runs the look-dev loop for any Aura3D scene or game: genre look recipe, reference frames, look preset, capture, rubric judgement and iteration. Use when starting or finishing any scene, game, product viewer or template, or when a screenshot looks flat, dark, empty, floaty or placeholder-like.
---

## Look target

1. Find the genre row in `references/look-recipes.md` (platformer, racing, fighting, arena shooter, sports/table, product, character, outdoor, interior, night city, space, underwater, cinematic).
2. Pick 1-3 reference frames from `references/reference-frames.md`.
3. Write a 3-line look brief: time of day, palette, mood. Keep it next to the route file.

## Establish the contract

- Every scene gets a look. The look is the environment, key/rim light, fog, background and grade as one preset.
- Typed catalog assets for hero subjects (`model(assets.x)`), never a primitive hero.
- `looks.appOptions(id)` spreads renderer options: `quality: "auto"` and the production profile. No renderer overrides.
- Run `npx @aura3d/cli@latest --help` / `<cmd> --help` before invoking commands; read `src/aura-assets.ts` for typed asset names.

## Procedure

1. `scene().add(looks.preset("<id from the recipe row>"))` first, then typed assets, then gameplay/props.
2. `createAuraApp(el, { scene, ...looks.appOptions("<id>") })`.
3. Camera from the recipe row (rig + fov + subject frame %). The camera state is applied to the camera, not to evidence objects.
4. Ground contact: full-strength key shadow (`shadow: true`) plus a contact detail at the subject's feet.
5. HUD lives in DOM/CSS, never in the 3D scene. No debug overlay in shipped frames.

## The 15 looks

| Look | Mood | Palette key |
| --- | --- | --- |
| `outdoor-day` | clean midday, saturated | greens, sky blue, warm wood |
| `golden-hour` | warm dusk drama | amber key, teal shadow |
| `overcast` | soft even exposure | muted greys, gentle fill |
| `polar-night` | cold moonlit stillness | ice blue, long shadows |
| `alpine-snow` | high-altitude glare | white field, hard rim |
| `product-studio` | neutral softbox stage | grey stage, brand accent |
| `interior-neutral` | plain interior light | warm walls, clean fill |
| `interior-warm` | cozy pools of light | wood, amber pools |
| `interior-industrial` | warehouse cool | concrete, metal, skylight shafts |
| `night-city` | neon streets | sodium pools, neon, wet reflections |
| `neon-arcade` | saturated game glow | cyan/magenta emissive |
| `arena-fight` | spotlit ring | dark crowd, hard key |
| `space` | void + single sun | graphite, hard key, rim |
| `underwater` | teal volume | caustics, biolume |
| `character-showcase` | portrait studio | 3/4 key, rim, soft stage |

## Look-dev loop

Run until every rubric category scores >= 7, or 6 rounds, or 2 rounds with no gain:

1. Capture: `aura3d look capture --route / --shots opening,mid,action --viewports desktop,mobile` (`--runner gh-actions` is the default where the template ships `.github/workflows/aura3d-lookdev.yml`; `--runner local` is the downstream user's choice).
2. Judge: open each PNG and fill `look-judgement.json` against `references/quality-bar.md`; validate with `aura3d look judge --validate look-judgement.json`. Read `aura3d look lint` plus `app.diagnostics().look`.
3. Change the single highest-leverage thing: lint codes first, then the lowest category. One change per round.
4. Repeat. Record remaining gaps with their lint code or engine limitation — never paint over a gap with fake geometry.

Hard checklist (all must hold before claiming done):

- IBL on (environment HDRI or biome present)
- Key shadow at full strength, contact darkening at feet
- DPR >= min(devicePixelRatio, tier cap)
- Background is sky/environment, not a void (or a declared exception)
- Fog or atmosphere for depth where the genre row lists one
- Grade through the look's post preset
- Subject fills its genre frame % (see `references/look-recipes.md`)
- No pure-primary primitives as the subject
- Characters animated through the animation controller
- HUD in DOM, not in-world
- No debug overlay
- `aura3d look lint` clean of error-severity codes

## Stop and report

- Stop after the loop exits (>= 7 everywhere, 6 rounds, or 2 flat rounds) and report the final `look-judgement.json` summary with remaining lint codes.
- Label `prototype` when the loop could not run (no capture runner available): say which step failed.
- A self-judgement is not a pass of the quality bar; only a panel round passes it. Report medians and the weakest category.

## References

- `references/look-recipes.md` — the 13 genre rows (look, camera, key, palette, atmosphere, post, VFX, assets, reference frames)
- `references/quality-bar.md` — the 12-category rubric with observable anchors and the hard lint checks
- `references/reference-frames.md` — named three.js r185 examples plus what you should see in each
- `references/failure-gallery.md` — the failure patterns and the fix that removes each
- `../aura3d-core/references/boundaries.md` — the boundary list (read once, do not restate)
- [Framing and shots](references/framing-and-shots.md)
