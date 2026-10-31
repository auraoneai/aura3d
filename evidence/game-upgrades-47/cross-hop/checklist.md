# Cross Hop GU47 checklist (WP-24, lane g14)

Status per acceptance line. "phase 2" = needs remote captures, measured budgets or judging. "WP-36" = needs generated assets.

| Row | Acceptance | Status |
|---|---|---|
| CH47-01 | every theme p95-p5 >= 140; darkFrac < 0.05; clip < 0.01 | phase 2 (bands in luma-bands.json) |
| CH47-01 | sun row 2 cascades, none skipped; no ambient-flattens/weak-shadow; no lights.ambient | code done (2-cascade PCSS sun, ambient removed; art-direction audit passes); diagnostics phase 2 |
| CH47-02 | theme3 p95 >= 170, theme4 >= 180; bottom third +15 %; means 50-80; +15 draws max | code done (12 pooled points, lamp posts in existing pools, +0 draws); pixels phase 2; lamp model WP-36 |
| CH47-03 | no box sky or sun disc; row 0 vs row 240 differ >= 25 on themes 0-4; +8 MB max | code done (gradient sky, boxes and sun sphere removed); HDRIs from the catalogue (+0 MB in the app); pixels phase 2 |
| CH47-04 | theme0 top-third stddev -30 %; player crop spread not lower; fog colours >= dE 10 apart | dE done (unit test); pixels phase 2 |
| CH47-05 | top 20 % and bottom 10 % variance <= 50 % of the player band; DOF in stagesRan; absent at quality low | code done (band follows player each frame, crops published); pixels and stagesRan phase 2 |
| CH47-06 | 5 distinct preset ids; theme4 clip 0.2-2 %; theme0 clip < 0.2 % | 5 ids done (unit test); clip phase 2 |
| CH47-07 | >= 5 ground materials; river crop spread >= 60; lava mean >= 170; +6 draws max | 5 surface pools done (+5 draws); pixels phase 2 |
| CH47-08 | player crop spread +25 %; thumbnail chroma +15; material >= 7 | code done (cream override removed in the diorama look); pixels phase 2 |
| CH47-09 | coin axis ratio <= 1.3 ... no primitive platform pools | blocked (WP-36) |
| CH47-10 | each <= 600 KB; no sphere canopies; theme pairs same_game false | blocked (WP-36) |
| CH47-11 | player 15-20 % of frame height; horizon 18-28 % from top; no inside-geometry frames | code done; horizon line conflicts with the PRD camera numbers (lane report); phase 2 |
| CH47-12 | scale.y 0.75-1.15, never uniform 1.25; yaw <= 45 deg/frame; no double frames; animation >= 7 | done (unit tests); judging phase 2 |
| CH47-13 | >= 8 distinct kinds in the beacon log; death hues >= dE 15; liveCount <= 96 | 11 kinds and dE done (unit tests); beacon log and liveCount phase 2 |
| CH47-14 | emitter on every theme but Downtown; <= 2,000; emitter region differs >= 2 over 5 s | done (unit test); pixels phase 2 |
| CH47-15 | >= 2.5x dressing instances; unit test over 500 rows; arch visible on theme change; <= 200 draws | scatter done (unit test, 6 slots/row); arch WP-36; draws phase 2 |
| CH47-16 | vision names lane type >= 90 % | partial (primitive furniture); vision phase 2; furniture models WP-36 |
| CH47-17 | HUD text >= 12 px, opacity >= 0.75; banner within 300 ms; ui_hud >= 7 | code done (tabletop theme, Suisse Works); judging phase 2 |
| CH47-18 | <= 200 draws; <= 170 MB, no growth over 20 restarts; budget.json | partial: static pools already submit only on key change (CH-E3); 1024 px critters and lazy loads not done; budget.json committed; measured phase 2 |
| CH47-20 | all categories >= 7; same_game false >= 0.8 vs 4 peers; 6 themes at 25/60 s; 0 warnings | art direction done; judging phase 2 |
| CH47-19 | rows 20-25 change monotonically <= 4 luma/row; no jumps > 6 except the swap | code done (unit test on the key blend); pixels phase 2 |

## Phase 3 (4.7.1)

| Item | Acceptance | Status |
|---|---|---|
| Views better than 4.6.2 | blind panel >= 2 of 3 per view, at most 3 rounds | theme1 3/0, theme2 2/1 (g14p3r3), theme3 3/0, theme4 3/0 (g14p3r2): vivid look default. theme0 0/3, theme5 1/1/1 (g14p3r3): 4.6.2 look kept |
| `?look=` switches | vivid, original, diorama force a look both ways | done (`defaultLookFor`, unit test) |
| Rubric (PRD 1.2 goal 1) | every category >= 7 | not met: min 3 -> 4 (shadows); ui_hud 7; look-judgement.json (+ alt) |
| Distinctness vs cloud-runner-port | same_game false >= 0.8 | 0.842, pass (sibling/cloud-runner-port-g14p3r2.json) |
| Final screens and card | retaken on the release build | done (g14p3s1), card previews rebuilt; screens-fresh clear |
| game-checks | 0 errors, fewest warnings | 0 errors, 14 warnings (luma-band, bands written for the diorama; not widened) |
| Assets | coin, logs, pads, stones, kits, arches, lamp | blocked (WP-36) |
