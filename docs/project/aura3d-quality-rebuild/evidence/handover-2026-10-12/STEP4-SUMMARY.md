# Handover execution evidence — 2026-10-12 (Muse session evergreen-heliosphere)

All numbers below were recomputed by the executing agent from run artifacts
(overall mean-abs-diff per `prompts/handover/tools/cmpfx.py`), not copied from
child-agent summaries. Frames in `contact-1..3.png` are 03-mid, 1280x720,
baseline main `4ea7c9c7e` (left) vs merged main (right), and were visually
inspected by the agent (this runtime can read PNGs).

## Merged

| PR | Merge commit | Content |
|---|---|---|
| #1328 | ca239c3cd | looked templates (6 starters) + template audit |
| #1331 | 427441edc | ES2022 build target for root starters |
| #1322 | ad5c13ab3 | batch B effects (6 games) |
| #1321 | 076943cdb | batch C effects (6 games) |
| #1329 | 000b4284a | batch A effects (6 games) |
| #1332 | 85ed0f43c | .vercelignore fix (benchmarks/ + tests/ needed at build) |
| #1333 | 9efe8f192 | gate volumetric fog on A3D_QR_POST (none-arm stall fix) |
| #1334 | open (draft) | 4.0.0 version preparation, owner merges + publishes |

17 stale PRs closed after file-level verification (#367 etc.); kept: #1304
(compiler partial fix, evidence commented), #1067 (audio-clock proof, re-port
candidate).

## Step 4 runs (merged main, L4)

- defaults all-18: run 38311108338 **SUCCESS** (zero forbidden reads; the
  pre-merge baseline job 38288741937 failed on forbidden-capture-flag).
- -post all-18: run 38311111335 SUCCESS, zero errors.
- none all-18: run 38311114527 — gravity-post + courier-rush deterministic
  draw-ready timeouts (ungated volumetric CPU march); fixed by #1333 and
  re-verified green in 11m57s (run 38318842740, fps 4.0/3.7, no missing shots).
- gameplay: run 38311117279 SUCCESS. Input-to-state parity defaults vs prod
  in all 17 probed games (movedNodes/changedLeaves match; turbo-drift is not
  in the probe config). Zero page/console errors under defaults. fpsClean
  defaults below prod build (effects cost; worst neon 30.0 vs 54.8, bank 8.8
  vs 16.4 — prod is a different build, treat as directional).
- flicker: run 38311220091 SUCCESS (timeline, arms default/-post/none).
  Static games luma-std ≤0.52 (gallery 0.52, orbital 0.11, bank 0.02);
  pulse-tunnel range 35–50 (the old 37→128 gate flash is gone);
  mech-hangar/courier variance is camera cuts (luma range spans scene
  changes at low MAD), not shimmer.
- audio: run 38311223186 SUCCESS. Local peaks equal or lower than production
  on every sounding game; no 0 dB clipping locally (loudest bank-shot −1.0,
  same as prod); neon-swarm idle loop present on prod (−2.2 dB) absent locally.

## Per-game acceptance on merged main (defaults vs pre-pass baseline)

PASS = overall MAD ≥10 in ≥3 shots, luma within ±12% (dark four +40%),
clipped <2%, fps ≥85% of main, no errors. Partials are named, not hidden.

| Game | fps ratio | MAD shots | verdict |
|---|---|---|---|
| aura-clash | 0.94 | 5/5 | PASS |
| blockfall-reactor | 0.82 | 4/4 (21) | PARTIAL fps |
| skyline-runner | 0.93 | 3/4 | PASS |
| turbo-drift | 0.90 | 4/4 | PASS (one shot luma −12.3%) |
| siege-golf | 0.90 | 4/5 | PASS |
| aurora-lander | 0.87 | 4/4 | PASS (static timeline frame) |
| neon-swarm | 0.86 | 4/5 | PASS |
| gravity-post | 0.85 | 5/5 (49–57) | PASS (absolute 3.0 fps, pre-existing) |
| courier-rush | 0.96 | 2/4 overall, 3/4 lit | PARTIAL diff |
| pulse-tunnel | 0.95 | 2/4 overall, 4/4 lit | PARTIAL diff (flash fixed) |
| mech-hangar | 0.91 | 5/6 | PASS |
| vault-breakers | 0.92 | 4/4 | PASS |
| rooftop-buckets | 0.92 | 5/5 | PASS |
| gallery-shift | 0.88 | 4/4 | PASS |
| deep-recovery | 0.81 | 0/5 overall, lit 8–37 | PARTIAL diff+fps |
| patrol-wing | 0.80 | 3/5 | PARTIAL fps |
| bank-shot | 0.73 | 0/5 overall (7.3–7.6), lit ~10 | PARTIAL diff+fps |
| orbital-defense | 0.85 | 0/5 overall, lit 12–19 5/5 | PARTIAL diff (97% authored black) |

Batch A fps root cause (bisects 38302450159/38303732778/38303735851 +
main recheck 38305085502 + fog-swap 38306282204 + vol-off 38307478359):
flag lanes do not explain the drop; the ungated volumetric march + contact
shadows cost ~25%. Shipped pattern: volumetricQuality "off", no contact
shadows (courier/mech exceptions documented in code).

## Flags (step 5) — all ship `dev`

Fresh L4 promote runs on main `4ea7c9c7e` (track0):
- looks 38289723797 FAIL — only prd13-neon-arcade regresses (0.076→0.527);
  18 base scenes identical. Agent visually reviewed the frames: looks-on is
  a coherent darker grade with no artifacts; the mechanical gate cannot pass
  it because the three.js twin renders no look. Owner call to flip.
- tiers 38289728461 FAIL/no-effect — LPIPS identical to 5 decimals alone.
- compiler 38289773524 FAIL — 18/18 regressed (0.041→0.267).
  With #1304 merged in (38290827889): 0.189, 12/18 regressed. #1304 stays
  draft with these numbers.
- world/game/webgpu/strict: no promotion evidence exists; ship dev.

## Runners / spend (step 2)

40 idle `gcp-cpu-*` VMs stopped (verified 15 RUNNING = GPU fleet, 41
TERMINATED). 15 GCP GPU VMs + 30 Azure VMSS runners were kept for this
session's captures and are **still running** — teardown was not executed
(owner decision; `prompts/handover/tools/teardown-runners.sh` deletes the
whole fleet irreversibly).

## Owner-gated remainders

1. Merge #1334, publish 4.0.0 with NPM_TOKEN + OTP, tag after verify.
2. `vercel-auraone --prod` (preview Ready: aura3d-gj7nczxw6-veerone.vercel.app).
3. Runner teardown-or-keep decision (GPU VMs still billing).
4. Delete dead branches: qr/fxa-fps-f..i (batch-A duplicates),
   qr/examples-effects (merged), qr/effects-pass-batch-a/b, qr/fx-pass-batch-c,
   qr/examples-effects-templates, qr/examples-es2022, qr/none-volumetric-gate,
   qr/vercelignore-benchmarks-shared, qr/release-4.0.0-v2 after merge.
5. Known leftovers: gravity-post 3 fps and courier 2.6 fps absolutes
   (pre-existing), turbo headlight glow stronger than main, #1067 audio
   re-port, asset-lookdev still reads `?debug` (not a game route).

---

## Pass 2 — 2026-10-13 (owner reopened completion; partials closed)

The owner rejected the 12 PASS / 6 PARTIAL verdict above and reported the
games did not fully load on the Vercel instance. Two workstreams followed.

**Vercel load blocker (root cause).** The deployed `/aura-assets/*.glb`
files were 131-byte Git LFS pointers, not binaries. Fixed by #1336
(merged `59126080e`): the site build now fails closed on LFS pointers and
the deploy uses a remote LFS-materialized `marketing-dist` artifact
(`lead-site-build.yml`). Corrected build 38323321262: 0 pointers, 202/202
real `glTF` GLBs.

**Per-game acceptance closure.** The 7 PARTIAL games above, plus
margin hardening for turbo-drift-circuit and neon-swarm, were fixed in
four isolated batches, each verified at its exact branch head (legacy
boot path, L4, same acceptance rules and baseline 38288741937 as above),
then merged one at a time:

| PR | Head | Games | Final-head L4 run |
|---|---|---|---|
| #1337 | `4c7a5499a` | courier-rush, pulse-tunnel | 38329194983 |
| #1338 | `95f81be47` | bank-shot, turbo-drift-circuit | 38342179366 |
| #1339 | `9e7328969` | deep-recovery, orbital-defense | 38341196894 |
| #1340 | `345966025` | blockfall-reactor, neon-swarm, patrol-wing | 38339647019 |

Courier's near-black action frame was a real tower-collision defect, not a
grade problem; its +995% action-shot luma is that bug fix against a
near-black baseline frame. No acceptance threshold was lowered.

**Merged-main re-verification** (main `e1233b78a`, L4, defaults run
38343225261 vs baseline 38288741937; `-post` 38343227242 and `none`
38343229676 both SUCCESS — the none arm's only console output is 70
`EFFECT_ZERO_PIXELS` watchdog notes, expected with vfx off, zero page
errors):

| Game | fps ratio | MAD shots | verdict |
|---|---|---|---|
| aura-clash-showcase | 0.94 | 5/5 | PASS |
| blockfall-reactor | 0.99 | 4/4 | PASS |
| skyline-runner | 0.97 | 3/4 | PASS |
| turbo-drift-circuit | 0.92 | 3/4 | PASS |
| siege-golf | 1.03 | 4/5 | PASS |
| aurora-lander | 0.99 | 4/4 | PASS |
| neon-swarm | 0.99 | 4/5 | PASS |
| gravity-post | 0.89 | 6/6 | PASS |
| courier-rush | 1.00 | 4/4 | PASS |
| pulse-tunnel | 0.97 | 4/4 | PASS |
| mech-hangar | 0.92 | 5/6 | PASS |
| vault-breakers | 0.87 | 4/4 | PASS |
| rooftop-buckets | 0.90 | 5/5 | PASS |
| gallery-shift | 0.89 | 4/4 | PASS |
| deep-recovery | 0.86 | 5/5 | PASS |
| patrol-wing | 0.94 | 3/5 | PASS |
| bank-shot | 0.95 | 5/5 | PASS |
| orbital-defense | 0.97 | 5/5 | PASS |

**18/18 PASS.** Thin margins, stated plainly: deep-recovery fps 0.86;
patrol-wing and skyline-runner pass on exactly 3 shots; turbo passes on
opening/mid/action (title 9.94) with one shot at luma −12.7%.

- Gameplay 38343232348 SUCCESS: zero page/console errors under defaults in
  all 17 probed games (turbo-drift is not in the probe config); input
  changes state in every probed game; defaults-vs-prod movedNodes/
  changedLeaves parity in 16/17. Orbital-defense's prod variant is
  unobservable in both this and the previous run (draws 0, canvases 0,
  45 s ready timeout on the old production build) while the local build
  responds to rotate/fire — a probe blind spot, not a local regression.
- Flicker 38343234969 SUCCESS: per-game delta-std table matches run
  38311220091 closely (courier 13.84 vs 13.85, skyline 0.861 vs 0.863;
  mech-hangar improved 4.56 vs 5.36). Static games ≤0.48.
- Audio 38343237764 SUCCESS: no local clipping (loudest local peak
  pulse-tunnel −8.0 dB); every game sounding in both builds is quieter
  locally than on production; blockfall/pulse patterns identical to run
  38311223186.
- Preview from merged main (site build 38347827037, prebuilt deploy):
  https://aura3d-90eej6133-veerone.vercel.app — landing + 18/18 game
  routes serve 200 HTML and 202/202 GLBs are byte-exact `glTF` via
  authenticated `vercel curl`. Runtime load proof for the production
  alias follows the production deploy (preview SSO blocks L4 runners).

Release: #1334 refreshed onto `e1233b78a` (`76b452748`) and merged at
`fb280dedd`; exact-commit dry-run helper merged as #1341
(`release-plan-dryrun.yml`). The first dry run exposed two latent
release-tooling defects, both fixed before publishing: a genuine
`@aura3d/controls <-> @aura3d/input` dependency cycle that
`publish-all.mjs` refused to order (#1342, deterministic cycle break),
and `sourceIdentity` crashing with EISDIR on the tracked symlink
`public/packs` (#1343, hash symlinks by target in both copies). Dry run
38352157252 at main `5ef9e98a3` then succeeded: 24 tarballs, all
sha256-verified against `release-plan.json`, all unpublished 4.0.0. The
local `--from-plan` publish from a fingerprint-identical checkout
(source fingerprint `8e87a300…`) stopped on the first package with
npm `EOTP` — the account enforces 2FA on publish, so the remaining step
needs the owner's one-time code (`NPM_OTP`), then tag `v4.0.0`, GitHub
release, and production verification. npm still serves 3.0.1.
