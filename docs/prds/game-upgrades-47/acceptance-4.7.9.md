# GU47 acceptance record at 4.7.9: current 12-category look judgements of all 25 games

Written 2026-11-02 after the 4.7.9 release. Method: `aura3d look judge --judge prism` (Prism, claude-opus-5.5, the 12-category look prompt of `packages/aura3d-cli/src/look/judge.ts`) on the final 60 s frames of each game, up to 4 variants per game (default first), taken at the frozen commits of the continuation (`6e8a46152`, `c24731c8d` for Serpentine, Ion Circuit and Cross Hop, `319641cb9` for Thermal Drift; frames under `evidence/game-upgrades-47/<slug>/f48|f49|f50/`). Every number is a model judge on software WebGL2 at 1280x720 with the capture's canvas-only view (the DOM HUD is hidden, so `ui_hud` reads only what the canvas draws). It is not human agreement and it is not a real-GPU result (PRD D5: owner-only). The judgements are `evidence/game-upgrades-47/<slug>/look-judgement-final479.json`. Categories the judge omitted are not counted; a game's category count is 10 to 12.

**Result: no game scores 7 or more in all of its categories, and none comes close.** Only 3 of the 273 category scores reach 7 (dot-dash-3d lighting 7; dot-dash-3d composition 7; drift-and-deliver-port atmospheric_effects 7). The lowest categories are `ui_hud` (canvas-only frames), `ibl_reflections`, `shadows` and `material_quality`, the ones that software WebGL2 and the current models show least. The PRD bar (every category at 7 or more, PRD section 7) is therefore **not met**; what can still move it is new Meshy models (`modeling_assets`, `material_quality`) and a real-GPU pass (reflections, shadows), both blocked as recorded in `HANDOFF.md`.

| Game | Frames judged | Categories | At 7 or more | Mean | Three lowest |
|---|---|---|---|---|---|
| Aura Slam 3D (`top-tennis`) | 4 | 11 | 0 | 4.8 | atmospheric_effects 3, ibl_reflections 3.5, ui_hud 4 |
| Apex Overdrive (`roadster-rush`) | 1 | 11 | 0 | 5.1 | ui_hud 2, shadows 3.5, environment_world 5 |
| Thermal Drift (`heatsink`) | 3 | 11 | 0 | 5.1 | ui_hud 3.5, shadows 4.5, environment_world 5 |
| Grid Dispatch (`teleoperator`) | 4 | 11 | 0 | 5.6 | shadows 4.5, material_quality 5, ui_hud 5 |
| Iron Crown (`iron-crown`) | 1 | 11 | 0 | 4.6 | ui_hud 1, shadows 3, lighting 4.5 |
| Pip's Big Leap (`pips-big-leap`) | 1 | 11 | 0 | 4.5 | ui_hud 2, shadows 3, ibl_reflections 4 |
| Aura Hoops 3D (`aura-hoops-3d`) | 4 | 12 | 0 | 4.6 | ui_hud 3, shadows 4, environment_world 4.5 |
| Aura Diamond 3D (`aura-diamond-3d`) | 4 | 11 | 0 | 4.2 | ui_hud 2.5, modeling_assets 3, material_quality 3.5 |
| Aura FC 3D (`aura-fc-3d`) | 4 | 11 | 0 | 4.2 | ui_hud 1.5, atmospheric_effects 2.5, ibl_reflections 4 |
| Aura Links 3D (`aura-links-3d`) | 4 | 11 | 0 | 4.3 | ui_hud 1.5, ibl_reflections 3.5, composition 3.5 |
| Bunker Zero (`bunker-zero`) | 4 | 11 | 0 | 3.3 | camera 2, ui_hud 2, shadows 2.5 |
| Slingshot Siege (`slingshot-siege`) | 4 | 11 | 0 | 4.8 | ui_hud 3, ibl_reflections 3.5, atmospheric_effects 3.5 |
| Glint Courier (`dot-dash-3d`) | 1 | 11 | 2 | 6.0 | ibl_reflections 4.5, modeling_assets 5, ui_hud 5 |
| Cross Hop (`cross-hop`) | 4 | 11 | 0 | 4.5 | ui_hud 1.5, atmospheric_effects 3.5, environment_world 4 |
| Craterline GP (`strange-orbit-port`) | 1 | 11 | 0 | 4.3 | ui_hud 2, shadows 2.5, ibl_reflections 4 |
| Chroma Roll (`splat-rush-port`) | 1 | 11 | 0 | 5.0 | ui_hud 2, ibl_reflections 4.5, shadows 5 |
| Serpentine Sky Run (`serpentine-sky-run-port`) | 4 | 12 | 0 | 4.9 | ui_hud 1.5, animation_quality 3.5, ibl_reflections 4 |
| Gridlock Courier (`drift-and-deliver-port`) | 1 | 11 | 1 | 5.7 | ibl_reflections 4.5, material_quality 4.5, shadows 5 |
| Ion Circuit (`heatsink-port`) | 1 | 11 | 0 | 4.5 | ui_hud 2, shadows 2.5, ibl_reflections 4 |
| Shadowstep Gauntlet (`ninja-runner-port`) | 1 | 10 | 0 | 5.2 | ibl_reflections 4, atmospheric_effects 4.5, shadows 5 |
| Lamplight Line (`last-train-port`) | 1 | 10 | 0 | 5.4 | ibl_reflections 4.5, material_quality 4.5, modeling_assets 4.5 |
| Saltwind Highway (`roadster-hours-port`) | 3 | 11 | 0 | 5.0 | ui_hud 2, lighting 5, shadows 5 |
| The Bellkeeper's Walk (`where-the-wind-wanders-port`) | 4 | 10 | 0 | 5.3 | shadows 3.5, ibl_reflections 4.5, atmospheric_effects 5 |
| Duneglide (`silt-and-signal-port`) | 1 | 10 | 0 | 5.1 | ibl_reflections 3, shadows 3.5, material_quality 4.5 |
| Cumulus Dash (`cloud-runner-port`) | 1 | 11 | 0 | 4.3 | ui_hud 1.5, shadows 2, ibl_reflections 3 |

| Category | Games scored | Mean | Games at 7 or more |
|---|---|---|---|
| ui_hud | 21 | 2.6 | 0 |
| animation_quality | 2 | 4.0 | 0 |
| ibl_reflections | 25 | 4.3 | 0 |
| shadows | 25 | 4.4 | 0 |
| material_quality | 25 | 4.7 | 0 |
| postprocessing | 25 | 4.9 | 0 |
| atmospheric_effects | 25 | 5.0 | 1 |
| modeling_assets | 25 | 5.1 | 0 |
| environment_world | 25 | 5.3 | 0 |
| lighting | 25 | 5.4 | 1 |
| camera | 25 | 5.4 | 0 |
| composition | 25 | 5.5 | 1 |

Related acceptance facts at 4.7.9 (details in `STATE.md` and the lane docs): all 25 games have a non-blank capture at a frozen commit; every changed view has a recorded blind panel (the panel is not repeatable on animated scenes, see `lanes/g14.md`); distinctness pairs below 0.8: Ion Circuit against Thermal Drift 0.69, Saltwind 0.59 and Craterline 0.71, Serpentine against Cumulus 0.77 and Shadowstep 0.59, Hoops against Diamond 0.73, Cross Hop against Pip's Big Leap 0.79; game-checks 0 errors and 53 warnings; 25 before/after posters were composed locally (`evidence/game-upgrades-47/<slug>/poster-before-after.jpg`, git-ignored JPEGs, pair list `aura3d-gu47/posters-frame-pairs.json`).
