# Cumulus Dash (cloud-runner-port) WP-35 acceptance checklist

Status per acceptance line: `code` (implemented, verifiable statically or by unit test), `phase 2` (needs the remote capture, judge or real GPU), `blocked (E-x | WP-36)`. Row status lives in `docs/prds/game-upgrades-47/lanes/g25.md`.

| Row | Acceptance | Status |
|---|---|---|
| CD-01 | all sun vectors within 3 deg, elevation 28 +/- 2; shadow crop 1.6x darker than lit | code + unit test (storm-look.test.ts); shadow crop ratio phase 2 |
| CD-02 | 4 cascades none skipped; grass under trees -20; +12 draws max | code (4 PCSS cascades to 160 m, scenery receives, quad removed); diagnostics and pixels phase 2 |
| CD-03 | hero silhouette vs 20 px ring >= 25 at three distances | code (look rim #9fc8ff 0.8 + hero PBR rim); pixels phase 2 |
| CD-04 | env names the HDRI; 0 errors; differs from Roadster Rush and Slingshot keys | code + unit test (`look hdri spruit_sunrise_1k`, 0.8, background off) |
| CD-05 | top cells 95-150; rainbow cell hue spread >= 0.15; draws unchanged; judge mentions a rainbow | code (storm dome, same sphere); cells, hue, judge phase 2 |
| CD-06 | clouds <= 70k tris, scene <= 560k at s=60; cloud draws <= 6 | blocked (WP-36: 3 cumulus towers, 2 deck tiles); towers drawn in the dome meanwhile |
| CD-07 | far mesa saturation <= 0.6x near track; mesa within 30 of horizon sky | code (haze #9fb8cf 0.0032, height fog); pixels phase 2 |
| CD-08 | one grade node; temperature shifts R-B >= 4; mean 105-125, p5 >= 25, p95 <= 235, clip < 0.02 | code + unit test (one node after merge); LUT later (storm-washed.cube not authored); pixels phase 2 |
| CD-09 | sky near sun +8, clip < 0.03; frame +2 ms max | code + unit test (flare; god rays High/Ultra only); pixels and frame time phase 2 |
| CD-10 | no dropped passes; S2:gtao in stagesRan; no contact-shadow warning | code (look AO node + contactShadows); stagesRan phase 2 |
| CD-11 | finale background -40% variance vs hero; no DOF in play | code + unit test (DOF title/finale only, glider blur while riding, High/Ultra, no phone); variance phase 2 |
| CD-12 | centre band mean <= 175 with p95 >= 190; validate --release; <= 32 decals | partial (darker deck at 0.72, 24 puddles <= 32); strata set and puddle mask need assets resolve; pixels phase 2 |
| CD-13 | validate --release; hero hash same; <= 200 MB textures; 0 errors | blocked (WP-36: hero retexture, staff, junipers, waystone, bridge, hut, bird) |
| CD-14 | pearl p95 >= 240, road p95 <= 225 | code (HDR pearl glow 1.55 over bloom threshold 0.9); pixels phase 2 |
| CD-15 | liveCount > 0 on launch; colours differ from defaults; <= 96 | code + unit test (7 presets incl. speed-lines, landing-dust, falls-spray; 85 at peak; trail); liveCount phase 2 |
| CD-16 | waterfall MAD >= 4 over 0.5 s; +4 draws | code + unit test (one ribbon, +1 draw, lip spray); MAD phase 2 |
| CD-17 | canopy MAD >= 2 over 1 s; birds in >= 2 of 6 screens | partial (tree wind, two drift speeds); birds blocked (WP-36 bird); MAD phase 2 |
| CD-18 | report passes; title sequence recorded; shake 0 on reduced motion; finale bounds in view | code + unit test (flyover, trauma, fovKick; reduced motion none); motion report phase 2 |
| CD-19 | no system or Google fonts; icons typed; no overlap at 640x360 and 390x844 | code + unit test (Roobert self-hosted); overlap phase 2; typed icon sprites not done |
| CD-20 | +6 draws at s=60; edge cells stddev >= 30 | partial (cairns, cord poles, hollow moss and flowers, 1 draw); arches blocked (WP-36); pixels phase 2 |
| CD-21 | values within the row at s=60/520/1100/1420/1700 | code (earlier culling, budget.json); measurements phase 2 |
| CD-22 | same_game false >= 0.8 every pair; every category >= 7, lighting/environment/atmosphere >= 8; portrait saturation >= 0.18 | code (art direction + audit record); judge and portrait phase 2 |

## Phase 3 (4.7.1)

- Default views: storm-washed look kept on title and gameplay (phase-2 blind panel win); `?look=original` unchanged.
- CD-22 rubric: `look-judgement.json`, minimum 4 (shadows), 7+ bar not met; open for 4.7.2 (see lane report). modeling_assets 5.5 and material_quality 5.5 blocked on WP-36 Meshy assets.
- CD-22 sibling: ninja-runner-port 0.828 pass, cross-hop 0.932 pass, serpentine-sky-run-port 0.746 fail (`distinct/`).
- CD-13, CD-06, CD-17 birds, CD-20 arches: still blocked on WP-36 (no borrowed or invented assets).
- Final screens: retaken on the 4.7.1 lane build (capture g25p3-r3, software WebGL2).
