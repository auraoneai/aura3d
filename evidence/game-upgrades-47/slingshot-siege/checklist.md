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
