# Aura Hoops 3D: audit-fix evidence (lane G07, 2026-10-29)

All captures ran on the remote ACR runner (`tools/remote-acr/run.sh`, `az-auraone-gurbaksh`), headless Chromium on
software WebGL2 (SwiftShader), not on a real GPU. A page load costs several minutes there and a frame several seconds,
so no first frame is judged: court numbers are taken 60 s after a court switch and gameplay numbers 25 s or more after
ready. Spec: `tests/browser/audit-fix/aura-hoops-3d.spec.ts` (tags `@screens`, `@play`, `@sweep`). Decode a run log with
`node decode.mjs <acr-run.log> <out-dir>`; each folder below has the frames and a `meta.jsonl` with one record per shot
(luma stats, `diagnostics()` draw calls and render path, `lighting.diagnostics().contactShadows`, and a game-evidence
snapshot).

| Folder | Build | Remote run |
|---|---|---|
| `v4.3.7-courts/` | tag `v4.3.7` | g07-v437b-134932 (`courts all`) |
| `before-base-4.5.0/` | `audit-fix/integration` b2dba3713 | g07-before-124037 (screens, phone touch) |
| `before-base-4.5.0-play/` | same | g07-before3-135550 (`@play`) |
| `before-base-4.5.0-courts/` | same | g07-before4-135927 (`@sweep`, courts part) |
| `after-play/` | `audit-fix/g07` 3440ac315 | g07-final-play-135544 (`@play`) |
| `after-courts/` | same | g07-final-sweep-135926 (`@sweep`, courts and Rucker/Shanghai AO-off) |
| `after-results/` | `audit-fix/g07` 72f27e589 | g07-final2-results-144757 |
| `after-screens/` | `audit-fix/g07` 72f27e589 | g07-final2-screens-144440 (copied to `../screens/final/`) |
| `after-ao/` | same | g07-final2-ao-144830 |

## Before and after

- **Touch (C1), 390x844, `isMobile` + `hasTouch` (coarse pointer):** base: `.a3g-touch` box 0x0 and all 7 buttons 0x0,
  `sticks: []`, p0 stays at (0, 8.6) with speed 0. Branch: host 390x844, 5 buttons 49x51 (SHOOT, CROSS, PASS, SPRINT,
  HESI), move stick 128x128, MENU button; dragging the stick up moved p0 from z 8.6 to 5.01 at 6.49 m/s (Sprint_Loop),
  and a SHOOT tap released a shot (`release — early 0%`, `fga 1`).
- **Escape (C2, C14), 1280x720:** one Escape opens the menu in both builds. Base: play keeps running behind it (ball
  y 0.89 then 0.50 over 25 s), closed menu not inert. Branch: ball and p0 identical across 25 s with the menu open
  (frozen), and the closed menu has `inert` and `aria-hidden="true"`.
- **Results card (C22 item 4, checklist line 38):** base: no results screen exists (game over is a 30 s centre message).
  Branch (`?diag=1&qaTarget=1&simsteps=30`): game over at 279 s after ready; the card shows RUN WON, HFY 1 - 0 SHN,
  field goals 1/1 (100%), 1 dunk, 0 steals, 0 blocks, MENU and REMATCH.
- **Team kits (C8):** base frames: both teams in the same grey and white kit, team told apart only by a faint ring.
  Branch: home orange jersey with dark shorts on round rings, away (Shanghai Neon) on the light alternate jersey with
  purple shorts on square rings (`teamKits` switches the away side to the light jersey when the two primaries are under
  2:1 contrast; unit-tested for all 56 pairings).
- **Six courts, 4.3.7 vs 4.5.0 (C12, LIGHT-06):** table in `docs/upgrade-4.5.0/aura-hoops-3d.md`, "Measured on the
  remote runner". Shanghai +4.0%, Orbit +3.5%, Rucker +8.1%, Venice +7.1%, Athens +5.7%, Manila +5.6%; 0% clipped
  pixels everywhere; contact-shadow pass executed on every 4.5.0 court.
- **AO on/off (C12, LIGHT-06):** Rucker, Shanghai, Orbit; AO darkens the feet-and-ball crop by 2.0%, 2.6% and 3.4%
  (table in the upgrade guide).
- **Draw calls (C20):** steady live play at 1280x720, base 289-340, branch 384-397 in the busiest frames (three kit
  materials per athlete), 231-368 elsewhere. Per court at the check spot: base 276-325, branch 278-347.

## Known limits

- Software GL only. Frame time, 120 Hz smoothness and the GPU look need the owner on real hardware.
- The dev harness serves `/aura-assets/*` only from the root `public/aura-assets`, so the two route-local kit GLBs were
  copied there for the run context only (never committed). Production copies route-local assets for this route
  (`marketing/scripts/build-showcase-routes.mjs`, `copyRouteLocalAuraAssets`).
- Every run log (base and branch) has a few `404` console errors from the harness (`@probe.gl/*` entry points missing
  on disk), not from the game.
