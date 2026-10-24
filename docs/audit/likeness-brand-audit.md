# Likeness and brand audit (2026-10-24, branch `game-rework`)

Scope: every GLB under `public/aura-assets/` (486 files) and the per-app model files, checked for photographic faces, lettering, crests and real brand or product marks. This is an engineering review of rendered pixels, not legal advice.

## Method and limits

- `tools/likeness-audit/dump-textures.mjs` writes the base-colour textures of every GLB onto labelled contact sheets (13 sheets, 378 textures; 7 files needed a fallback parser for webp, spec-gloss and external images). Most Meshy atlases are shard collages, so marks are not readable there.
- `tools/likeness-audit/render-views.mjs` is a CPU rasteriser (bind pose, base-colour texture, front, side and back). It was run on the 20 models listed below, which are the characters and vehicles that matter. Models not listed were reviewed from their atlases only (props, buildings, tracks, effects) and are marked "atlas only".
- Verdict scale: HIGH (a recognisable real mark, product or face scan is visible), MEDIUM (a real brand or venue name is visible, or a close replica of a real product), LOW (stylised, no real mark seen), OK.

## Fixed in this branch (athletes repainted by body region, no textures)

Tool: `tools/hoops-athlete-retexture/retexture.mjs` with a per-sport config (palette, trousers or shorts, sleeves, cap or helmet, boot colour, joint-only classification). Rig (15 joints) and the 23 clips are unchanged; each model is four or five flat-colour material primitives; no image or texture remains. Defaults still reproduce the Hoops models byte for byte (`bfc264d0`).

| Model | Seen before | Used by | Now |
|---|---|---|---|
| `hoopsAthleteBig`, `hoopsAthleteGuard` | photographic-style face, "CRETIS 13" lettering, swoosh-style marks on shorts and shoes, chest tag | Hoops | `hoopsAthleteBigClean.bfc264d0`, `hoopsAthleteGuardClean.178e3649` (Hoops lane) |
| `diamondAthlete` | yellow "A" monogram on a navy cap, navy pinstripes, face | Diamond | `diamondAthleteClean.ef3c43ea` (white kit, plain navy cap) |
| `fcSoccerStrikerMeshy` | swoosh-style marks on chest, shorts and socks, club crest, sleeve badge, back lettering and number, realistic face | FC | `fcSoccerStrikerClean.2e335ee3` |
| `fcGoalkeeperMeshy` | swoosh-style marks on chest, shorts and boots, club crest, back lettering, realistic face | FC | `fcGoalkeeperClean.4194514e` |
| `linksGolferAthleteMeshy` | swoosh-style mark on the shirt, back number, realistic face | Links | `linksGolferAthleteClean.5a04c740` |
| `rzQuarterbackMeshy` | league-shield-style badge on the chest, "SNIKE" and number lettering, helmet marks | Red Zone | `rzQuarterbackClean.2397b4cd` |
| `rzDefenderLinemanMeshy` | jersey lettering and numbers, helmet marks | Red Zone | `rzDefenderLinemanClean.deec33d6` |

Wiring: asset url, hash, size and material names updated in `src/aura-assets.ts`, `aura.assets.json`, `apps/showcase-aura-fc-3d/src/aura-assets-v2.ts`, `apps/showcase-red-zone-3d/src/aura-assets-v2.ts` and `apps/showcase-aura-diamond-3d/src/aura-assets.route.ts`. FC's team tint now targets the kit material only (`target: /-kit$/`). The eight original GLBs were removed from the tree (still in git history). `tests/unit/likeness-audit/clean-athletes.test.ts` pins hashes, sizes, rig, clips, no textures and that no manifest references an original.

Cost: the repainted models are flat colour with ragged region edges (the Hoops lane noted the same). Close-ups (Links, Diamond) look plainer than before; on-field distance in FC and Red Zone is fine. A better look needs new art, not more repainting.

## Not fixed (needs an owner decision)

| Asset | Used by | What is visible | Verdict |
|---|---|---|---|
| `teleopWaymoHero`, `teleopWaymoTraffic` | Teleoperator (`apps/showcase-teleoperator`, `-v2`) | a Jaguar I-PACE with "JAGUAR" tailgate lettering and grille badge, "WAYMO" side lettering, roof sensor pod | HIGH |
| `teleopCybercab` | Teleoperator | replica of Tesla's Cybercab body | HIGH (product likeness) |
| `teleopCorvette` | Teleoperator | Corvette crossed-flags badge on nose and tail, "Corvette" text, a recognisable model | HIGH |
| `teleopTaxi`, `teleopSedan`, `teleopSuv`, `teleopVan`, `teleopPickup`, `teleopBus`, `teleopCablecar` | Teleoperator | atlas only: real-vehicle photo-style atlases, marks not checked in render | MEDIUM, unreviewed |
| `rooftopAthleteDefender`, `rooftopAthleteShooter`, `rooftopDefender.*`, `rooftopLayupScorer.*`, `rooftopShooter.*` (+ V2 variants) | no app (retired rooftop route), but tracked and served under `/aura-assets/` | atlas is a photographic face scan: skin, eyes, ears, beard, brand-style shoe marks | HIGH while served |
| `showcaseCcByFormulaOpponent`, `showcaseCc0FormulaRaceCar`, `showcaseDetailedRaceCircuit` | showcase race routes | "SKETCHFAB", "SDC PERFORMANCE" decals and Pirelli "P ZERO" tyre text | MEDIUM (real brands; CC-BY attribution must be honoured) |
| `turboTsukubaVisualTrack`, `showcaseTsukubaCircuit` | turbo race routes | "Tsukuba Circuit" logo and signage (a real venue) | MEDIUM |
| `courierVan`, `courierTrafficHatch` | Drift & Deliver | a close replica of a classic real van; hatch looks photo-derived; no logos seen on the van render | MEDIUM (design likeness) |
| `rooftopShooterMeshyV1`, `rooftopDefenderMeshy` (preview: "23" jersey, swoosh-style shoe marks) | listed in FC and Red Zone v2 manifests, unused by code | marks in the Meshy atlas | MEDIUM, unused |

Recommended follow-ups, in order: (1) replace the Teleoperator vehicles with generic generated cars (Meshy text prompts, no brand words); (2) delete the rooftop photo-scan GLBs together with their manifest entries (`aura.assets.json`, `src/aura-assets.ts` types and blocks, `tools/showcase-library/route-gates.json`, `tests/browser/showcase-release-asset-probe-config.ts`, `docs/project/showcase-launch-evidence.json`, `tests/qr/prd06/games/rooftop-buckets.spec.ts`); (3) strip the Pirelli, SketchFab and circuit marks from the formula and Tsukuba textures or swap the models; (4) re-render the unreviewed vehicles.

## Reviewed, low risk

- Stylised or fantasy characters: `auraClashPlayerRig`, `auraClashRivalRig` (painted fantasy faces), `showcaseStylizedMaleRunner`, `showcaseAdventurerRunner`, `showcaseWalkAnimatedGirl`, `skylineArcticRunnerHero`, `neonRainCourierHero`, `mechHero*`, `bunker*` (armour), `gallery*` (atlas only). Licences of the CC-BY packs still need their attribution lines.
- `tennis-athlete`, `tennis-mascot`: flat white silhouette, no marks.
- Props, buildings, tracks, planets, effects: atlas only; no faces or brand marks seen. Fictional lettering exists on `courierVan` atlas and `showcaseArcadeController`, none matching a known mark.

## Live on `main` today (for a hotfix decision)

Games that currently ship a model with marks or a real-looking face: Hoops (fixed on `game-rework` only), Diamond, Links, FC, Red Zone, Teleoperator, plus the rooftop face-scan files served as static assets. In FC the body material is replaced by a flat colour at runtime, so the marks are probably not visible in play, but the files still carry them.
