# Receipt: vfx-trail (GU47 WP-6, lane E-F)

Status: phase 2 (no frames yet). Phase 1 shipped the code and the spec; nothing here was rendered.

- What it proves: `app.effects.trail(target, { width, life, color, widthOverSpeed? })` draws a real ribbon on the
  ribbon pass (the `VFX_TRAIL_PENDING` stub is gone).
- Spec: `tests/browser/gu47/vfx-trail.spec.ts` on the harness `tests/browser/gu47/vfx-receipts-harness.html?mode=trail&vfxdebug=1`
  (a sphere runs at 25 m/s on an 80 m track; trail width 0.6 m, life 1.5 s).
- Run (remote only): `RUN_ID=gu47-vfx-trail SPECS='tests/browser/gu47/vfx-trail.spec.ts' tools/remote-acr/run.sh`
- Commit here with `git add -f`: `vfx-trail.png`, `vfx-trail.json` (from `tests/reports/gu47/`) and the
  `RECEIPT vfx-trail` log line.
- Acceptance: ribbon length at least 30 m behind the moving node (handle `length` and `__AURA_VFX_DEBUG__().trails`),
  no `VFX_TRAIL_PENDING` note, the ribbon visible in the frame with an opaque head at the sphere and a fading tail.
  Software WebGL2.
