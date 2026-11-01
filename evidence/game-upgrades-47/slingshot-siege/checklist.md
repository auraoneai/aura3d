# Slingshot Siege GU47 checklist (WP-22, lane g12)

Phase 1 (code) status per row is in `docs/prds/game-upgrades-47/lanes/g12.md`. Phase 2 items:

- [x] Remote capture `slingshot-siege--default`, `--ch0` ... `--ch5` at 1280x720 and 390x844 (25 s and 60 s shots).
- [x] Declare `luma-bands.json` from the WP acceptance numbers (committed in phase 1).
- [x] Commit the decoded `luma-after.json` (phase 3: from g12p3r3).
- [ ] SS47-M2 island cell spread +15: capture `?surfaces=0` against the default (same chapter) and compare the island cells.
- [ ] SS47-H1 level sign legible at 390x844 (SDF text, chapter name), not overlapping the fort crop.
- [ ] Fort crop sharpness vs far-headland crop (SS47-P1), DOF on/off within 10%.
- [ ] Draw counts: level 1 <= 200, Gull Keep (ch4) <= 260, dressing <= 12, water <= 3 (SS47-PF1).
- [ ] fortFraction >= 0.18 at 1280, >= 0.12 at 390 (SS47-C1).
- [ ] Sibling judge against dot-dash-3d and where-the-wind-wanders-port (arcade group).
- [x] Retake the card frame (`screens-fresh`): phase 3, g12p3r3 build.
- [ ] Admit WP-36 assets (lane report asset table) and drop primitives to <= 8 (SS47-A1).

## Phase 3 (4.7.1)

- [x] Relit day look (ch0-ch4): camera-side sun, textured cliffs, no fog/mist/drizzle/glare, seabed sea by day, solid blocks.
- [x] Blind panel vs 4.6.2: default and ch0-ch4 better 3/0/0 (g12p3r2b and g12p3r3); every chapter defaults to the GU47 look; `?look=original|gu47` both work.
- [x] Rubric before/after (`rubric-before/`, `rubric-r2/`): minimum 3 -> 4; ui_hud 7; the rest 4-6 (lane report).
- [x] Final screens + card frames retaken (g12p3r3), card previews rebuilt; game-checks 0 errors, 12 luma-band warnings.
- [ ] Day sky on software WebGL2 draws as flat pale grey-blue whatever the sky node says (engine handoff).
- [ ] Re-declare the day `spread >= 170` and fort cell `>= 100` bands for the panel-verified front-lit look (band owner; not widened here).
- [ ] WP-36 assets: block GLBs, slingshot, rotor, pennant, set pieces, dressing, boar clips, HUD icons (material_quality, modeling_assets).

## Phase 4 (4.7.2)

- [x] Cast shadows read on software WebGL2: day key rakes in from the left (azimuth 280-292), the puresky image light cut to 0.22-0.25 (its sun disc was lighting the island unshadowed), PCSS 0.6-1.0, longer contact shadows, sea grass and tufts cast. Rubric shadows 4.5/5 -> 6/6.
- [x] Glossy clear-coat sea (seaReflection 1.6 by day, 0.08 at night), lacquered wood/stone blocks; flat sea at night (world water off: the white night sea is gone). Screen-space reflections tried (g12p4r5) and dropped: streaks on the turf.
- [x] Blind panel vs 4.6.2 on the shipped build g12p4r9: default and ch0-ch5 better 3/0/0 (g12p4r9a, g12p4r9b, g12p4r9c).
- [x] Distinctness: sibling judge vs dot-dash-3d same_game false at 0.949, vs where-the-wind-wanders-port at 0.912 (`p4-sibling/`).
- [x] WP-36 slingSeaStackIsland admitted (import-meshy, licence + rights rows) as `sling_seaStackIsland`, drawn once as the far islet (1 draw, no shadow, no collider); art-direction contract updated.
- [ ] Rubric every category >= 7: not met (min ibl_reflections 3.5; judge sees the sea as a flat plane on software WebGL2).
- [ ] Remaining 26 WP-36 rows: blocked, Meshy keys refuse API calls (moved to a later release).
- [ ] Final screens retake on the phase-4 build: the screens shard was cancelled by the scheduler's no-GL_META hang guard (g12p4r9-8); screens stay on the g12p3r3 build.
- [ ] Luma bands for the shadowed look (darkFrac, fort cell 5, ch1 mean, ch4 fort crop): 14 luma-band warnings, bands not widened; re-declare from g12p4r9 with panel tags g12p4r9a/b/c (band owner).
