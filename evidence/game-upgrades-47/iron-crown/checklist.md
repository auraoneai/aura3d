# Iron Crown WP-15 acceptance checklist

Status per row: done / done-interim / partial / blocked (E-x | WP-36) / phase 2. Pixel, capture and judge acceptance lines are phase 2 in every row.

| ID | Pri | Acceptance (PRD) | Phase-1 status |
|---|---|---|---|
| IC47-L1 | M | fighter crops >= 95 vs outer ring <= 35; foot crop 15% darker; follow-spot filter pcss; outdoor p95-p5 >= 140 | done (code, unit-tested: PCSS follow-spot, rims, suns 72/10/18/8, rim false); crops published (`window.__AURA_QA__.crops`: fighter-p1/p2, foot-p1/p2, outer-ring-left/right, from the presented view-projection, unit-tested); luma phase 2 (`luma-bands.json` declares the spread bands) |
| IC47-L2 | M | Neo-Tokyo mean 45-65, darkFrac <= 0.20, clip <= 0.06; no weak key; contact feet diff >= 4 | done (code); luma phase 2 (banded in `luma-bands.json`) |
| IC47-L3 | S | heavy-attack shadow extent differs >= 25% from idle | done by the engine default (skinned shadows default-on); capture phase 2 |
| IC47-E1 | M | source differs on all 6; day means span >= 40; top rows differ >= 18; <= 6 MB each | done (code; HDRIs from the E-A catalogue, sizes unit-tested); luma phase 2 |
| IC47-E2 | M | Neo-Tokyo idle diff >= 2; Monastery ground p95 +10; reduced streaks <= 50% | done (code, reduced-motion halving unit-tested); pixels phase 2 |
| IC47-E3 | S | shaft crop >= 8 over side crop; Colosseum top vs fight row >= 20 | done (shafts, Colosseum ochre fog and dust gusts); pixels phase 2 |
| IC47-E4 | C | no solid-void; top vs middle >= 12 | declined (documented): E1's per-venue HDRIs already draw every outdoor sky; a Preetham/gradient sky would replace the six distinct HDRI skies E1 accepts on. Revisit only with an owner call |
| IC47-P1 | M | stagesRan matches; hue L1 >= 0.35; Crown p95 >= 170 | done (code); captures phase 2 |
| IC47-P2 | S | Colosseum R/B >= 1.15, Monastery <= 0.92; LUT hue shift >= 6 deg | done (4 .cube LUTs, 17^3, `scripts/make-luts.mjs`, typed `lut` assets bound through `grade.lut` on Dock, Colosseum, Airstrip, Monastery; luts.test.ts checks R/B and mean hue shift on the lattice); pixels phase 2 |
| IC47-P3 | S | K.O. bg variance <= 40%; no DOF in neutral; no pulse on reduced motion | done (unit-tested); variance phase 2 |
| IC47-M1 | M | reflection r >= 0.3; floor p95 >= 120; texture gates | partial: per-venue finishes, SSR mirror and 4 CC0 detail-map sets (Tiles141, Concrete034, Gravel043, PavingStones151; webp, PROVENANCE.md) done; box probe blocked (E-G: probes not on the engine root, not consumed by the runtime) |
| IC47-M2 | S | 3 px edge band >= 25 brighter on all stages | done (rim + clearcoat); pixels phase 2 |
| IC47-A1 | M | 0 shared keys; validate --release | blocked (WP-36): 28 borrowed keys listed in the lane report with replacements |
| IC47-A2 | M | Dock <= 300, Monastery <= 300, Neo-Tokyo <= 350 | done-interim (static mesh consolidation per material); remeshes blocked (WP-36); measured phase 2 |
| IC47-A3 | S | no stand-in clips; 2 fighters <= 9 MB | blocked (WP-36) |
| IC47-V1 | M | liveCount 0 within 1.2 s; hit crop >= 300 amber px in 80 ms; block hue 180-210 | done (code, runtime VFX on, pack unit-tested); real-GPU run phase 2 |
| IC47-V2 | S | idle bg diff >= 2; <= 2,000 particles | partial (ambient embers, motes, dust and win confetti wired, budget unit-tested; Airstrip shimmer pass not in the engine) |
| IC47-V3 | C | decal visible 10 s; flare within 2 | done (code): lens flares on the Crown follow-spot and the low Dock/Airstrip suns (frustum occlusion, none on Low); K.O. scorch decal parked below the floor, moved under the loser, kept for the scene; pixels phase 2 |
| IC47-AN1 | M | feet <= 0.03 m while hands >= 0.10 m; hit frame within 1 frame | done (layering default, forwarded speed); measurement phase 2 |
| IC47-AN2 | S | >= 3 bg cells diff >= 2; crowd stddev +10% after K.O. | partial (Crown crowd bob and K.O. jump; Neo-Tokyo neon stutter; Monastery prayer flags in the instance wind); swinging lanterns and banners wait for WP-36 hanging-lantern/banner assets; no fighter has tail bones |
| IC47-C1 | M | 3 intro + 1 K.O. shot with bars; report passes; intro <= 4.0 s | done (camera only, inside the 1.35 s intro); motion report phase 2 |
| IC47-C2 | S | bbox share 22-30% at 1280, >= 18% at 390 | partial (fov 40, lowered lens, FOV kick via feel punch); bbox share phase 2 |
| IC47-H1 | S | HUD <= 14% / 22%; licensed fonts; ui_hud >= 7 | partial (forged CSS; plate and timer slams synced to the C1 intro shots); 6 stage thumbnails wait for WP-36 |
| IC47-W1 | M | top-row stddev >= 8; <= 60 draws | done-interim (instanced primitive backdrops, 2-4 draws per venue; WP-36 assets later) |
| IC47-W2 | S | primitives -80%; crowd <= 12 draws | blocked (WP-36: spectators, truss, dais) |
| IC47-PF1 | M | <= 300 desktop, <= 220 phone; <= 1.5M tris; JS +5% | partial (floor deck 38 -> 14 draws, static consolidation); measured phase 2 |
| IC47-PF2 | C | 0 new GLB fetches on repeat; switch <= 50% | done by the engine (E-H cache on by default; no game call needed); measurement phase 2 |
