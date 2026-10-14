# Continuation state — 4.0 Live Fix execution (updated 2026-10-13 after Session 2 stream disconnect)

Goal: execute `docs/project/aura3d-quality-rebuild/4.0LiveFixPlan.md` in full.
Session 1 (`01a1311c`) terminated on `HTTP 429`. Session 2 (`e6153e11`) completed Phase 1 engine parity fixes + compiler promotion (`A3D_QR_COMPILER: "default-on"`), templates (`#1364`), non-game showcases (`#1378`), Blockfall (`#1360`), Neon Corridor Strike (`#1365`), and rebased/upgraded all 17 remaining single-path game PRs onto `main` (`5a6692ead`), before disconnecting on a network stream error (`Error ID: 6f77384c-575a-4c0b-8054-99301d44e550-3767`) while downloading the final 4 L4 capture artifacts.

## 1. Merged to `origin/main` (`5a6692ead`)
- **Phase 0 & Phase 2**: `LIVE-IDENTITY.md` and `SALVAGE.md` (`#1352`).
- **Phase 1 Engine Three.js Parity Fixes (E1–E6)**:
  - `#1352` (E1), `#1353` (E2), `#1354` (E5), `#1355` (E4), `#1356` (E3 stage 1), `#1357` & `#1358` (E6), `#1359` & `#1362` & `#1363` & `#1369` & `#1376` & `0b97a9305` (E3 stage 2 single IBL + GGX footprint prefilter + neutral-room fix).
  - `1bd84e394` & `c492d8719`: Promoted `A3D_QR_COMPILER` to `default-on` (L4 run `38455588100`: `0.0367` mean LPIPS vs Three.js across 19 scenes, 0 regressions).
  - `240f152b9` (instanced `RenderItem` cache invalidation), `1a38cc006` & `97d039d8d` (`K1`–`K7`, `K9` kit manifests + `look.ts`), `cc9083a4f` (exporter parent node allowance + `/hdri/` and `/favicon.ico` in lane servers + output exposure), `79edbf8ab` (disable developer diagnostics overlay on `createGame`), `5a6692ead` (auto-inject `hud-base.css` in `mountHud`).
- **Templates & Non-Game Showcases**: `#1364` (`a318bb691`) and `#1378` (`fea96ea0f`).
- **Rebuilt Single-Path Games Merged on `main` (2 of 19)**:
  - `apps/showcase-blockfall-reactor` (`#1360`, `fe826f35f` + `5a6692ead`)
  - `examples/neon-corridor-strike` (`#1365`, `b15c08d98` + `5a6692ead`)

## 2. Open Single-Path Game PRs Targeting `main` (17 PRs — 16 Green on L4, 1 Failing S9 by 0.1ms)
- **16 PRs PASSING `qr-prd14-games.yml` on current HEAD**:
  - `#1366` (`showcase-orbital-defense`, `3924f4eac`, run `38503755425`)
  - `#1367` (`showcase-bank-shot`, `d88577bcb`, run `38488718302`)
  - `#1368` (`showcase-vault-breakers`, `b7809c94c`, run `38486986615`)
  - `#1370` (`aura-clash-showcase`, `a3944032e`, run `38486959509`)
  - `#1372` (`showcase-courier-rush`, `9b06e0f13`, run `38503695493`)
  - `#1373` (`showcase-patrol-wing`, `ce950fdb0`, run `38488355258`)
  - `#1374` (`showcase-siege-golf`, `aedb2aedd`, run `38489144755`)
  - `#1375` (`showcase-mech-hangar`, `942c13a33`, run `38491527156`)
  - `#1377` (`showcase-turbo-drift-circuit`, `1dfc76b02`, run `38492484927`)
  - `#1379` (`showcase-skyline-runner`, `e805b4458`, run `38494967179`)
  - `#1380` (`showcase-gravity-post`, `6de49003b`, run `38503738507`)
  - `#1381` (`showcase-rooftop-buckets`, `404fc579d`, run `38495518397`)
  - `#1382` (`showcase-pulse-tunnel`, `4894e0b40`, run `38487594685`)
  - `#1383` (`showcase-deep-recovery`, `6b42d2ff9`, run `38487565496`)
  - `#1384` (`showcase-neon-swarm`, `eff156bac`, run `38499948130`)
  - `#1385` (`showcase-aurora-lander`, `f308e6e16`, run `38488635727`)
- **1 PR Failing `qr-prd14-games.yml` by 0.1ms**:
  - `#1371` (`showcase-gallery-shift`, `660a5ee4d`, run `38503717381`): S1–S8, S10, S11 pass; S9 `p95 rAF interval` = `50.10ms` vs `<= 50ms`.

## 3. Remaining Plan of Attack (See End of `/Users/gurbakshchahal/Downloads/aura3d-logs.md`)
1. **Stage 1**: Fix `#1371` S9 p95 (`50.10ms -> <= 50ms`), add `gameAlias` to `marketing/scripts/build-showcase-routes.mjs`, and squash-merge all 17 open game PRs into `main`.
2. **Stage 2**: Run `lead-site-build.yml` on `main` and deploy prebuilt `marketing-dist` via `vercel-auraone deploy --prebuilt --prod` to `https://aura3d.auraone.ai`.
3. **Stage 3**: Visual quality & HUD deduplication wave across the 12 dual-HUD routes and 7 visually weak scenes (`rooftop-buckets` T-pose & orange wash, `patrol-wing` orange fog/terrain, `skyline-runner` black void & decoy crates, `blockfall-reactor` floating decoy crates, `courier-rush` timeout frame & dark city, `mech-hangar` tiled wall & crates, `aura-clash-showcase` left cutout & legacy deletion), followed by L4 re-verification and live redeploy.
4. **Stage 4**: Run consolidated `qr-azure-gpu.yml` (`games`, `gameplay`, `flicker`, `audio`, `source=production`) on `main` and write `GAME-GATES.md`.
5. **Stage 5**: Run `release-plan-dryrun.yml` at final `main` and publish `24× 4.0.0` to npm with fresh owner `NPM_OTP`.
