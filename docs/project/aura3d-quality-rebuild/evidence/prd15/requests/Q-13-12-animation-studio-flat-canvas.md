# Q-13-12 — animation-studio live canvas renders flat (Skills gate uniqueBuckets)

**Lane:** 13 (templates / agent tooling)
**Filed by:** Lane 15 (PRD-15, PR #357 wave-7 triage)
**Severity:** gate-blocking once Skills gate reaches the template browser phase

## Finding

`animation-studio`'s `#live-canvas` renders only its clear color under the
Skills-gate harness: `assertTemplateLookFloor` passes `brightPixels` on luma
but `uniqueBuckets <= 8` fails. The release-render capture
(`tests/reports/release-screenshot.png`, 960×540) shows the same flat frame —
3 colors total, no scene content. So the readPixels path is not at fault: the
canvas genuinely presents a cleared frame.

## Evidence

- Branch (`qr/prd15-40-removal`, wave-7 capture rewrite): browser failed twice,
  `uniqueBuckets` assertion at look-floor.ts:233.
- `origin/main` worktree (7758a2710, same harness command): identical —
  `browser failed` ×2, `failures=1`.
- The bespoke `A3DRenderer` path in `src/scene-player.ts` is not registered in
  `__AURA3D_LIVE_APPS__`, so look-floor's stepped capture cannot drive it; the
  rAF `poseAt` loop runs but the presented backbuffer stays uniform.
  `renderer.render()` at scene-player.ts:820 may be drawing into a target that
  never blits to the default framebuffer, or the draw list is empty.

## Request

Lane 13 to debug why `renderer.render` leaves the canvas backbuffer uniform
under this template (offscreen-only pipeline? empty render list? context
creation silently degraded?) and either fix the scene-player render path or —
if the template legitimately cannot satisfy a floor — relax its own T3.12
assertion. Lane 15 will not weaken a lane-13-owned gate.
