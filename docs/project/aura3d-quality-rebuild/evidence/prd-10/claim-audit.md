# S16 — Audit des claim strings PRD-10

Inventaire `rg` des affirmations factuelles dans `PRD-10-world-building-environment-systems.md` et `evidence/prd-10/phase-1..6.md`, et leur statut de preuve à date (main@8eafb415+, 2026-10-10). Statuts : `unit` = couvert par un test unitaire vert ; `remote` = preuve GPU/browser attendue (run id à rattacher) ; `stale` = contredit par le code actuel ; `accepted` = accords contractuels.

## Phase 1 (phase-1.md)
- "tsc clean (0 errors)" — `unit` (refait sur main post-merges : packages/rendering typecheck vert).
- Depth ordering bg vs opaque quads, pixels attendus (left/right/center) — `remote` : `qr-prd10-world-pass-depth.spec.ts` (T1.11 ; ordering fixé côté lane par #820, preserve depth côté prd01 = #822).
- "`createTerrainTileGrid`/`createNamedEnvironmentPreset` : seuls les stubs throwing + re-exports" — `unit` (rg, #34 owner 15).
- phase-1.md affirmait "none is anticipated" sur la profondeur — `stale` : contredit par le run 37497949014 (pixel 51 < 150) ; à corriger quand T1.11 est verte.

## Phase 2 (phase-2.md)
- GPU height readback ≤ 1e-4 m — `remote` (`qr-prd10-terrain-gpu-cpu.spec.ts`, S1).
- Splat bake GPU ±1/255 vs CPU — `remote` (`qr-prd10-terrain-splat-bake.spec.ts`, S1).
- 0 crack pixel sur 120 frames flyover — `remote` (`qr-prd10-terrain-cracks.spec.ts`, S2).
- WGSL terrain = "structural placeholder" — `stale`-attendu : T2.4 (P2) non implémenté, à faire correspondre à la réalité WGSL.

## Phase 3 (phase-3.md)
- InstanceChunkGrid / scatter planner / wind UBO / foliage lobe — `unit` (`prd10-scatter.test.ts` etc., 98 tests).
- "determinism asserted by checksum" — `unit` ; double-preuve browser demandée par S5 — `remote`.
- Grass/scatter Path S draws — `stale` : aucun pass scatter/grass Path S n'existe (S6 à implémenter ; `grassOpaquePass` est du code mort).
- "kit/hero item producers join as their Path S passes land" — `remote`.

## Phase 4 (phase-4.md)
- Pass order reflection → terrain → sky → sceneCopy → water — `unit` (ordering validé dans `world-frame-passes.test.ts`, #820) ; pixels — `remote`.
- "water.surface submits 0 box primitives" — `remote` (S9).
- CPU↔GPU-order wave agreement ≤1e-3 m — `remote` (`qr-prd10-water-gerstner.spec.ts` à écrire, S9).
- "Detail normal/foam/caustics are procedural stand-ins" — `stale` si S13 livre les vraies atlases (10-S13 ouvert).

## Phase 5 (phase-5.md)
- place/fill/poisson/room/street determinism + checksums — `unit` (98 tests).
- "Bake was run here, sha256-pinned" — `unit` (manifest test) ; re-bake double-hash demandé par S8 — `remote`.
- "24 kit GLBs untextured + noise/caustics only" — `stale`-risque : S13 exige le contenu §6.6 complet (HDRIs, espèces feuillage, kits texturés) — non livré.

## Phase 6 (phase-6.md)
- biome/time-of-day handlers, flags, degradations — `unit` (`prd10-biomes.test.ts`, 32 tests dont Q-15-6).
- "hdri/space-default-512-*.f32" — `stale` : le fichier n'existe pas (10-S13 : produire ou corriger phase-6.md).
- prd10.biome "always resolves interior-neutral" — `stale` : corrigé par #833 (Q-15-6), la source est muette sans signal world.
- T6.5 EnvironmentPresetPack exposureFactor — `remote`/`stale` : adoption #267 non fermée.

## Croisé
- "All 12 chunks compile (GLSL + WGSL)" — `unit` (registration prouvée par #829 test) ; compile macos-14 — `remote` (`qr-prd10-chunks.spec.ts`).
- IC-0 baseline — `stale` : `IC-0.md` absent, à produire sur GitLab macOS.

Conclusion : la majorité des claim strings est `unit`-couverte ; les lignes `stale` (scatter pass, S13 assets, IC-0, phase-1 depth note, WGSL) sont les suivantes à traiter ; tout le reste attend les run ids remote (bisect `none;world` bloqué sur #422).
