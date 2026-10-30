# Art Direction for Aura3D Agents

Version: 4.6.2 (supersedes `cinematic-scene-quality.md`)

Every scene an agent ships has a look: environment, key light, shadow, background, fog and grade. This doc owns the values; the `aura3d-art-direction` skill owns the process. Fast path: pick the genre row, apply the preset, run the loop below until the checklist holds.

## 1. Apply a look

A look preset supplies, as one unit: image-based environment light and reflections (IBL), a key light with full-strength shadows, a background (sky, backdrop or declared void), fog tuned to the palette, an output grade (`output.preset`), and DPR and quality caps (`looks.appOptions`).

```ts
import { createAuraApp, looks, model, scene } from "@aura3d/engine";
import { assets } from "./aura-assets";

createAuraApp("#app", {
  scene: scene().add(looks.preset("product-studio")).add(model(assets.product)),
  ...looks.appOptions("product-studio")
});
```

Do not override renderer options on top of `looks.appOptions` and do not hand-set tone mapping; a manual quality override also invalidates any performance measurement.

## 2. Genre recipe rows

Pick the row, then read the full table in `packages/aura3d-cli/skills/aura3d-art-direction/references/look-recipes.md`.

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

The 15 look ids: `outdoor-day`, `golden-hour`, `overcast`, `polar-night`, `alpine-snow`, `product-studio`, `interior-neutral`, `interior-warm`, `interior-industrial`, `night-city`, `neon-arcade`, `arena-fight`, `space`, `underwater`, `character-showcase`. `output.preset` ids: `product-studio`, `daylight-outdoor`, `neon-night`, `space`, `underwater`, `arena-fight`, `cinematic-film`.

## 3. Default-look facts (read before judging a frame)

Measured on the 4.1.2 lineage unless stated. Software-GL frames, not GPU.

- **No environment authored.** A scene without an environment renders with a built-in neutral environment floor, so metals are not black. In 4.1.2 builds from the published packages the engine requests `/aura-environments/neutral.manifest.json`, gets a 404, logs `ENV_FETCH_FAILED` and renders with the neutral floor anyway; the look is not the one an authored environment gives. Author a look or an environment instead of relying on the floor, and check `CHANGELOG.md` for whether the fetch is fixed in your version.
- **Vignette darkens the frame (4.2.x: 25% to 40%; fixed in 4.3.0).** Bloom does not (under 1% mean luma, measured). Up to 4.2.x the vignette multiplied display-referred bytes after the tone map, so `effects.vignette({ intensity: 0.16, smoothness: 0.65 })` cut the mean luma of a frame by about 27%. From 4.3.0 the vignette multiplies linear light inside the single tone-map stage, and the same setting costs about 6% to 18% depending on the scene (software WebGL2, `evidence/post-graph-migration/`). It is still a vignette: lower `intensity` or raise `smoothness` (above 1 keeps the centre clean) if the frame is too dark, and judge frames with the same post settings.
- **Exposure differs from three.js.** The same nominal light intensities give a brighter picture than three.js (skinned character mean luma 192 against 144 in the benchmark). Do not copy three.js intensities; judge the captured frame.
- **Default quality.** The production profile renders into 4x multisampled RGBA16F targets. It costs several times a plain frame on software GL; it is not a bug.
- **`look/ambient-kills-ibl`, `look/ambient-flattens`, `look/ambient-without-env`** fire when an ambient light flattens the IBL. Remove the ambient light instead of silencing the lint.

## 4. The 12-item hard checklist

Before any screenshot counts as evidence:

1. IBL on (environment light present, not a void).
2. Key shadow at full strength, contact shadow under the subject.
3. DPR at least `min(devicePixelRatio, tier cap)` via `looks.appOptions`.
4. Background is a sky or backdrop, or explicitly declared; never a bare void.
5. Fog or atmosphere for depth on outdoor and interior scenes.
6. Grade comes from the look's `output.preset`, with no hand tone mapping.
7. Subject occupies 15% to 70% of frame height by genre.
8. No pure-primary primitives as the subject.
9. Characters are animated (idle at minimum).
10. HUD lives in DOM, not in-world geometry.
11. No debug overlay in shipped frames.
12. `aura3d look lint` has no error-severity codes.

`look lint` codes (20): `look/no-ibl`, `look/no-lights`, `look/solid-void`, `look/ambient-kills-ibl`, `look/ambient-flattens`, `look/ambient-without-env`, `look/weak-shadow`, `look/low-dpr`, `look/double-aa`, `look/debug-overlay`, `look/overlay-default`, `look/primitive-subject`, `look/fake-effect-names`, `look/multiple-looks`, `look/expansion-mismatch`, `look/flat-palette`, `look/renderer-override`, `look/lean-import`, `look/evidence-constant`, `look/capture-branch`. Run `aura3d look lint --json` for the live list and severities.

## 5. The look-dev loop

Each round: capture, judge, change one thing.

```bash
aura3d look lint --json                      # static lint, run first
aura3d look rubric --genre racing            # prints the rubric for a genre
aura3d look judge --validate look-judgement.json [--judge self|prism]
```

1. **Capture** the route at `opening`, `mid`, `action` for desktop and mobile.
   - **Aura3D repository and AuraOne machines (no GitHub Actions, no local Playwright):** run your route's screenshot spec on the remote runner and read the PNGs from the artifacts folder:

     ```bash
     RUN_ID=look-1 SPECS="tests/browser/<your-route-look>.spec.ts" tools/remote-acr/run.sh
     # PNGs: tests/reports/remote-acr/look-1/artifacts/
     ```

   - **Your own project:** `aura3d look capture --route / --shots opening,mid,action --viewports desktop,mobile`. The default `--runner remote` never starts a browser on your machine: it writes `capture-request.json` and prints the remote-run steps, or runs your configured runner (`--remote-cmd` or `AURA3D_REMOTE_RUNNER`), and `--from <reports-dir>` collects a finished remote run. `--runner local` (explicit opt-in, warns) and the legacy `--runner gh-actions` (warns) remain, and neither is allowed on AuraOne machines.
2. **Judge** each PNG against the 12-category rubric (`aura3d-art-direction/references/quality-bar.md`); write `look-judgement.json` and validate it.
3. **Change the single highest-leverage thing:** lint codes first, then the lowest rubric category.
4. **Repeat** until every category reads 7 or more, 6 rounds are spent, or two rounds gain nothing. Record remaining gaps with their lint code or engine limitation; never paint over a gap with fake geometry.

A self-judgement is not a pass of the quality bar; only a panel round passes it. Report medians and the weakest category. If capture could not run, the result is `prototype` and the report names which step failed.

## 6. Failure patterns

`aura3d-art-direction/references/failure-gallery.md` lists nine canonical failures (void background, flat shading, ambient soup, floating subject, primitive soup, fake-effect primitives, debug HUD, renderer overrides, capture-only lighting) with the lint code each trips and the fix that removes it.

## 7. Claims

A look claim without a captured frame is `prototype`. Labels are in [claims-and-boundaries.md](claims-and-boundaries.md); the quality ladder (L0 to L4: text only, primitive sketch, asset-backed draft, realtime cinematic scene, production handoff) and the evidence workflow are in the `aura3d-evidence-review` skill; the release bar is [showcase quality gates](../project/showcase/quality-gates.md). Only L3 or better is public product proof.
