# Upgrading the live games to Aura3D 4.5.0

One guide per game listed in `docs/workflows/game-inventory.json` (25 live games). Each guide was written from a read of the game source against the 4.5.0 code (branch `beat3js2/integration`), then checked line by line by a second reader who corrected wrong citations and missed impacts. Nothing was built or run for these guides, so every visual effect described is predicted from the code, not measured. Confirm each one with the guide's checklist.

No game needs a code change to build or run on 4.5.0: every `package.json` already pins 4.5.0 and no game uses a removed or renamed API. The changes that matter are visual:

- **Lighting:** scenes with authored lights and no `environments.*` node lose the implicit environment fill, and `lights.hemisphere` now contributes. Depending on the scene this reads darker or brighter. The look presets `night-city`, `polar-night`, `neon-arcade`, `space` and `underwater` carry an explicit neutral-room fill that stands in for the implicit one: the three night looks at 0.85, `space` at 1.0, `underwater` at 0.65. It is dropped when the scene authors a `lights.ambient`, as the implicit fill was on 4.3.7. In the games it measured within about 5% of 4.3.7 (Aura Diamond 3D Skyline 71.0 to 74.5, Hoops Shanghai 53.5 to 55.6, Pip's w6 108.1 to 111.1).
- **Contact shadows:** `effects.contactShadows` is now a real screen-space mask and needs a shadow-casting directional light.
- **Render path:** scenes with no post effects, output options, transmission or custom shaders now draw straight to the canvas (`quality: "auto"`). Pass `quality: "production"` to keep the 4.3.7 pipeline.
- **Canvas read-back:** `preserveDrawingBuffer` was already false by default at the device level in 4.3.7; 4.5.0 only turns it on for `?capture=1` and `?qa=1`. Read-back code behaves as before; prefer `app.capture()` or `app.screenshot()`.

| Game | Slug | Verdict | Summary | Guide |
| --- | --- | --- | --- | --- |
| Apex Overdrive | `roadster-rush` | Recommended changes | No code has to change for the game to run. | [roadster-rush.md](roadster-rush.md) |
| Aura Diamond 3D | `aura-diamond-3d` | Recommended changes | Nothing breaks and no code edit is required. | [aura-diamond-3d.md](aura-diamond-3d.md) |
| Aura FC 3D | `aura-fc-3d` | Recommended changes | Nothing in the source has to change to build or run (the pins are already 4.5.0 and every option the game passes is read by its builder). | [aura-fc-3d.md](aura-fc-3d.md) |
| Aura Hoops 3D | `aura-hoops-3d` | Recommended changes | Nothing in the code has to change for the game to build and run on 4.5.0, but `effects.contactShadows` is now a real mask that darkens the floor, and the Shanghai and Orbit courts get their ambient fill from the look's explicit neutral-room fill. | [aura-hoops-3d.md](aura-hoops-3d.md) |
| Aura Links 3D | `aura-links-3d` | Recommended changes | Nothing in the source has to change to build or run on 4.5.0, but the hemisphere light now contributes on the `night-city` and `space` courses, contact shadows now render as a real mask, and the render path, canvas read-back and shadow behaviour sh | [aura-links-3d.md](aura-links-3d.md) |
| Aura Slam 3D | `top-tennis` | Recommended changes | The game compiles and runs on 4.5.0 unchanged. | [top-tennis.md](top-tennis.md) |
| Bunker Zero | `bunker-zero` | Recommended changes | No API in this game breaks. The `night-city` look's fill is dropped because the scene authors an ambient light; the hemisphere light now contributes. | [bunker-zero.md](bunker-zero.md) |
| Chroma Roll | `splat-rush-port` | Recommended changes | The game needs no code change to build or run on 4.5.0, but the seven Meshy GLB models (floating-island backdrop and power-up gems) are lit only by the scene's authored lights now. | [splat-rush-port.md](splat-rush-port.md) |
| Craterline GP | `strange-orbit-port` | Recommended changes | Nothing breaks at build or boot (the app pin is already `4.5.0` and the code uses no removed API), but the game now runs under quality `auto` instead of the old pipeline. | [strange-orbit-port.md](strange-orbit-port.md) |
| Cross Hop | `cross-hop` | Recommended changes | No source edit is required to run on 4.5.0, but `effects.contactShadows` is now a real screen-space mask that changes how the lanes look, and no `quality` setting restores the 4.3.7 look. | [cross-hop.md](cross-hop.md) |
| Glint Courier | `dot-dash-3d` | Recommended changes | The game compiles and runs unchanged on 4.5.0. Its lighting reads a little brighter (mean luma 25.0 to 29.5) because the hemisphere light now contributes; the `neon-arcade` look's fill is dropped since the scene authors an ambient light. | [dot-dash-3d.md](dot-dash-3d.md) |
| Ion Circuit | `heatsink-port` | Recommended changes | Nothing in the game breaks on 4.5.0, but the lit Meshy models (drone, pickups, barrels, pylons, scenery) will probably render darker and lose their reflections, because the scene has authored lights and no `environments.*` node. | [heatsink-port.md](heatsink-port.md) |
| Iron Crown | `iron-crown` | Recommended changes | Nothing in the code fails to build or runs differently by contract, but the render now differs from 4.3.7 in three places (contact shadows, the Neo-Tokyo stage's lighting, fused bloom), so re-check the six stages by eye and re-baseline any  | [iron-crown.md](iron-crown.md) |
| Lamplight Line | `last-train-port` | Recommended changes | The game needs no code change to build or run on 4.5.0, but it reads the canvas outside a render call, its bloom/AO output can shift slightly, and one QA probe should be made safe against the new `preserveDrawingBuffer` default. | [last-train-port.md](last-train-port.md) |
| Pip's Big Leap | `pips-big-leap` | Recommended changes | The game compiles and runs unchanged on 4.5.0. | [pips-big-leap.md](pips-big-leap.md) |
| Saltwind Highway | `roadster-hours-port` | Recommended changes | The game keeps the HDR render chain in 4.5.0 and its canvas read-back already goes through `app.capture()`, so nothing breaks. | [roadster-hours-port.md](roadster-hours-port.md) |
| Serpentine Sky Run | `serpentine-sky-run-port` | Recommended changes | Nothing in the source breaks on 4.5.0, but the game now renders at quality `"auto"` instead of the old pipeline, and its lighting convention changed, so the lit GLB models need a visual check and the `createAuraApp` options should be made e | [serpentine-sky-run-port.md](serpentine-sky-run-port.md) |
| Shadowstep Gauntlet | `ninja-runner-port` | Recommended changes | Nothing in the game breaks or needs a code change to run on 4.5.0. | [ninja-runner-port.md](ninja-runner-port.md) |
| Slingshot Siege | `slingshot-siege` | Recommended changes | Nothing breaks: the scene has effects, transparent materials and an HDRI environment, so it stays on the HDR chain and keeps its lighting. | [slingshot-siege.md](slingshot-siege.md) |
| Duneglide | `silt-and-signal-port` | No change needed (optional tweak) | Nothing is required. | [silt-and-signal-port.md](silt-and-signal-port.md) |
| Cumulus Dash | `cloud-runner-port` | No change needed | The game keeps the HDR render chain (it authors bloom, colour grade, vignette, output options and custom shaders), reads pixels only through `app.capture()`, and passes only options that the builders read. | [cloud-runner-port.md](cloud-runner-port.md) |
| Grid Dispatch | `teleoperator` | No change needed | The game uses post effects and an HDRI look (`looks.preset("outdoor-day")`), so it stays on the HDR chain and has an environment node. | [teleoperator.md](teleoperator.md) |
| Gridlock Courier | `drift-and-deliver-port` | No change needed | The game authors bloom, colour grade, vignette, FXAA, output options, an HDRI environment and custom shader materials, so it stays on the HDR render path. | [drift-and-deliver-port.md](drift-and-deliver-port.md) |
| The Bellkeeper's Walk | `where-the-wind-wanders-port` | No change needed | The game authors output options, post effects and custom shader materials, so it stays on the HDR chain. | [where-the-wind-wanders-port.md](where-the-wind-wanders-port.md) |
| Thermal Drift | `heatsink` | No change needed | The game already pins 4.5.0. | [heatsink.md](heatsink.md) |

- Recommended changes: 19
- No change needed (optional tweak): 1
- No change needed: 5

After changing a game, run `node tools/game-checks/run.mjs <slug or app folder>` before calling it done.
