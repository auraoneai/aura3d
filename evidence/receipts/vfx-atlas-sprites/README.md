# Receipt: vfx-atlas-sprites (GU47 WP-6, lane E-F)

Status: phase 2 (no frames yet). Phase 1 shipped the code and the spec; nothing here was rendered.

- What it proves: emitters with `sprite: "smoke-a"`, `"dust-mote"` and `"splash"` render as their sprites from the
  baked atlas `packages/engine/assets/vfx/aura-vfx-2k.png`, not as the analytic soft-dot.
- Spec: `tests/browser/gu47/vfx-atlas-sprites.spec.ts` on the harness `tests/browser/gu47/vfx-receipts-harness.html?mode=sprites&vfxdebug=1`
  (four columns, left to right: soft-dot reference, smoke-a, dust-mote, splash).
- Run (remote only): `RUN_ID=gu47-vfx-atlas-sprites SPECS='tests/browser/gu47/vfx-atlas-sprites.spec.ts' tools/remote-acr/run.sh`
- Commit here with `git add -f`: `vfx-atlas-sprites.png`, `vfx-atlas-sprites.json` (from `tests/reports/gu47/`) and the
  `RECEIPT vfx-atlas-sprites` log lines.
- Acceptance: `__AURA_VFX_DEBUG__().sprites` reports `ready` for the three sprites; each sprite column has coverage
  above 0.2 % and differs from the reference column (radial symmetry by more than 0.05 or edge energy by more than
  20 %); a reader confirms puffs (smoke-a), specks (dust-mote) and droplets (splash). Software WebGL2.
