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

## Fixed in the `hotfix-brand` branch (textures cleaned, geometry unchanged)

Tool: `tools/likeness-audit/clean-textures.mjs <recipe>` (waymo, corvette, cybercab, formula, tsukuba, turbo-tsukuba, rooftop), manifests updated with `apply-clean-assets.mjs` and `apply-clean-json.mjs`, locked by `tests/unit/likeness-audit/brand-clean-assets.test.ts`. Original files are deleted from `public/aura-assets/`.

| Asset | Was | Now |
|---|---|---|
| `teleopWaymoHero`, `teleopWaymoTraffic` | "WAYMO" side and tailgate lettering, "JAGUAR" lettering, leaper and "I-PACE" on the tailgate, front "JAGUAR", a roof-pod mark | all eight marks painted out of the albedo atlas with the surrounding body colour (`teleopWaymoClean`, one file for both keys). The roof sensor-pod and body shape are unchanged: that is a design likeness a texture edit cannot remove |
| `teleopCorvette` | crossed-flags badge, "Corvette" text (scrambled UV atlas, marks not locatable) | whole body atlas blurred and median-filtered so no mark stays legible (`teleopCorvetteClean`); the body shape is still a recognisable model |
| `teleopCybercab` | atlas marks | same blur and median treatment (`teleopCybercabClean`); the body is still a close replica of a real product shape, needs new art |
| `showcaseCcByFormulaOpponent` | livery full of decals ("SKETCHFAB", "SDC PERFORMANCE", "Blender", "Dubai", "GP-2021", numbers) and Pirelli sidewall lettering | livery flattened to its base blue (black panel kept), tyre sidewall lettering and ring painted black (`showcaseCcByFormulaOpponentClean`). CC-BY attribution for the model stays in the attribution files |
| `showcaseTsukubaCircuit`, `turboTsukubaVisualTrack` | "TSUKUBA CIRCUIT" logo in six textures, and a "DUNLOP" arch (a real brand the first pass missed) | logo pixels inpainted from their surroundings, the arch texture smeared past legibility (`...Clean`); one banner texture is patchy now |
| `rooftopAthleteDefender`, `rooftopAthleteShooter`, `rooftopShooter`, `rooftopDefender`, `rooftopLayupScorer` | photographic face-scan atlases, still served under `/aura-assets/` | base-colour textures smeared (faces unrecognisable); unreferenced duplicate files (`rooftopDefender.c0947539`, `rooftopLayupScorer.6201dc87`, `rooftopShooter.fd853001`) deleted |
| `rooftopDefenderMeshy`, `rooftopShooterMeshyV1` | "23" jersey and swoosh-style marks | same smear; both are unused by game code |

Verified: `rooftopDefenderV2` and `rooftopShooterV2` have no textures (flat material colours) and were left as they are. `showcaseDetailedRaceCircuit` shows no real mark in its textures (sci-fi hangar atlases) and `showcaseCc0FormulaRaceCar` is a colour palette, so neither changed.

Still open after this branch: `teleopCybertruck` (a replica of a real vehicle shape, atlas not reviewed), the other Teleoperator vehicles (atlas only, unreviewed), `courierVan`/`courierTrafficHatch`, and any asset whose problem is the model shape itself. Those need new generic art, not texture edits.

## Not fixed (needs an owner decision)

Rows for assets listed under "Fixed in the `hotfix-brand` branch" above are fixed on that branch only; this table describes `main` before the hotfix.

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

## Systematic texture pass over every served GLB (2026-10-24)

Method: `tools/likeness-audit/dump-textures.mjs` over `public/aura-assets` and every `apps/*/public` (609 GLBs, 474 base-colour textures, 16 contact sheets), every sheet read by eye; suspicious textures extracted at full size. Checked against `git ls-tree origin/main` so only tracked, deployed files count as live. Limits: a contact sheet cannot show small marks on shard atlases; only base-colour textures were dumped; GLBs under `examples/*/assets` (109) were not part of this pass; this is an engineering review, not legal advice.

| File (stem) | Where it is live | Finding | Action |
|---|---|---|---|
| `billiardsTrophyCabinetMeshy` | Bank Shot (live), Iron Crown on main | Atlas holds small framed photographs of people | Base-colour softened (`soften-basecolor.mjs`, 40x40 grid); Iron Crown no longer uses it on `game-rework` |
| `rooftopAthleteDefender`, `rooftopAthleteShooter`, `rooftopDefender` (x2), `rooftopLayupScorer`, `rooftopShooter` | Served from `/aura-assets/`, used by no app (tests and probes only) | Photographic face scans (upside-down faces, numbered jerseys) | 6 textured files softened; `rooftopLayupScorer.6201dc87` and `rooftopShooter.fd853001` have no base-colour texture and were left |
| `yellowBean` | Bean Brawl Race (live) | Pikachu-like face: black glossy eyes, red-orange cheeks, smile on a yellow body, plus a red leg patch | Cheeks and patch painted out (`cover-regions.mjs`); body, eyes and smile unchanged |
| `fighterRomanSignal`, `fighterIronLedger`, `fighterRepublicDuelist`, `fighterDealbreaker`, `fighterDragonProtocol`, `fighterKremlinShadow`, `fighterLotusStorm` | `apps/world-war-x-showcase` only: untracked in git and 404 on the live site | A photograph of a real politician in front of flags, an engraved portrait of a real person with caption, photographic skin textures, a colour-chart sheet | None in the repo (not tracked). Keep that directory out of git; delete it locally if it is not needed |
| `auraClashPlayerRig`, `auraClashRivalRig`, `clashFighterMaraMeshy`, `clashFighterRookMeshy` | Aura Clash showcase (live) | Detailed face skin textures and a close-up eye on a pink ground; unclear if photo-derived or generated | Needs a human look at full size before a decision; not changed |
| `showcaseCcByFormulaOpponent`, formula-car textures | Live | Pirelli "P ZERO" tyre texture and sponsor lettering | Covered on `hotfix-brand`; not part of this change |
| `showcaseTsukubaCircuit`, `turboTsukubaVisualTrack` | Live | Real circuit logo on signage and buildings | Covered on `hotfix-brand` |
| `teleopWaymoHero`, `teleopWaymoTraffic`, other `teleop*` vehicle atlases | Teleoperator (live) | Real vehicle photographs and brand marks | Replaced on `game-rework` by generic Meshy vehicles; textures cleaned on `hotfix-brand` |
| `courierTrafficHatch`, `courierTrafficSedan`, `courierVan` | Courier game (live) | Real-vehicle parts atlases (lights, grilles); marks not readable at sheet scale | Unreviewed at full size |
| `rzLombardiCupMeshy` | Red Zone (live) | Texture is generic, but the asset name uses a trademarked trophy name | Rename the asset key in a later change |
| `showcaseStylizedMaleRunner` | Live | Generic stylised face | No action |

Tooling added: `soften-basecolor.mjs` (downsample then smooth upscale of the base-colour atlas: layout survives, small detail cannot), `cover-regions.mjs` (flat ellipses in the body colour over named regions), `apply-softened.mjs` (writes the hash-named file, repoints manifest blocks, removes the original). Tests: `tests/unit/likeness-audit/soft-cabinet.test.ts` and `photo-textures.test.ts` judge texture content (a high-frequency detail bound separates photographs, about 17, from softened textures, about 3) and manifest hashes, not file names.
