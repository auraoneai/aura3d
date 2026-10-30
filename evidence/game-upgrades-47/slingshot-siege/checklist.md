# Slingshot Siege GU47 checklist (WP-22, lane g12)

Phase 1 (code) status per row is in `docs/prds/game-upgrades-47/lanes/g12.md`. Phase 2 items:

- [ ] Remote capture `slingshot-siege--default`, `--ch0` ... `--ch5` at 1280x720 and 390x844 (25 s and 60 s shots).
- [x] Declare `luma-bands.json` from the WP acceptance numbers (committed in phase 1).
- [ ] Commit the decoded `luma-after.json`.
- [ ] SS47-M2 island cell spread +15: capture `?surfaces=0` against the default (same chapter) and compare the island cells.
- [ ] SS47-H1 level sign legible at 390x844 (SDF text, chapter name), not overlapping the fort crop.
- [ ] Fort crop sharpness vs far-headland crop (SS47-P1), DOF on/off within 10%.
- [ ] Draw counts: level 1 <= 200, Gull Keep (ch4) <= 260, dressing <= 12, water <= 3 (SS47-PF1).
- [ ] fortFraction >= 0.18 at 1280, >= 0.12 at 390 (SS47-C1).
- [ ] Sibling judge against dot-dash-3d and where-the-wind-wanders-port (arcade group).
- [ ] Retake the card frame (`screens-fresh`).
- [ ] Admit WP-36 assets (lane report asset table) and drop primitives to <= 8 (SS47-A1).
