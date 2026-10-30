# aura-fc-3d GU47 checklist (WP-19, lane g09)

Every acceptance line of WP-19 with its phase-1 status. "phase 2" = needs remote captures, measured draws or the judge; the code it measures is in place unless the line says otherwise.

| Row | Acceptance | Status |
|---|---|---|
| FC47-L1 | Munich and Glacier top row <= 45 (134-151 today) | phase 2 (sky colour via the E-A background override, no studio HDRI painted) |
| FC47-L1 | pitch cells 55-95 | phase 2 |
| FC47-L1 | darkFrac 0.05-0.35 | phase 2 |
| FC47-L1 | draws within 5% | phase 2 (expected deltas in budget.json) |
| FC47-L2 | spot shadow requested, casterIsSpot, mapRendered and sampled | requested: unit (art-direction test, one shadowed spot per night venue); rendered/sampled: phase 2 |
| FC47-L2 | blob batch 1 draw | done in code (one instanced `fc-flood-pools` plane batch); measured: phase 2 |
| FC47-L2 | pitch cell spread >= 18 | phase 2 |
| FC47-L3 | player crop >= 20 over crowd crop on Munich and Kyoto | phase 2 (crops `player`, `crowd` published); irradiance volume blocked (probes not on the engine root) |
| FC47-S1 | Uyuni mean 150-190, p5 <= 120, grid spread >= 30 | phase 2 |
| FC47-S1 | Glacier <= 401 draws | phase 2 |
| FC47-S1 | Lagos top-row R-B >= 40 | phase 2 |
| FC47-S2 | S4 in stagesRan at High | phase 2 (volumetricFog with lightPosition + godRayDensity on Munich, Glacier: unit) |
| FC47-S2 | top-row spread -20% vs bottom; cost logged | phase 2 |
| FC47-S3 | rain node Munich, snow node Glacier | done (unit) |
| FC47-S3 | +2 draws max | phase 2 (one weather node per venue) |
| FC47-P1 | stagesRan differs Munich/Kyoto/Glacier | phase 2 (arena-fight / neon-night / cinematic-film) |
| FC47-P1 | 3x3 vectors differ >= 15 pairwise; distinctness gate passes | phase 2 |
| FC47-P2 | pitch hue differs >= 8 deg Munich vs Kyoto | unit on the LUT maths (turf green); pixels: phase 2 |
| FC47-P2 | LUT bound in receipt | phase 2 (bound on the look grade: unit) |
| FC47-P3 | bank cell p95 >= 230, clip < 1% | flares in code on the two far banks at night (42425fcc6, unit `lens-flares.test.ts`); pixels on the `flood-bank` crop: phase 2 |
| FC47-M1 | pitch stddev >= 6 | phase 2 (acg-grass005 tiled 24x16) |
| FC47-M1 | validate --release | phase 2 |
| FC47-M1 | draws unchanged | expected 0 delta (materials only) |
| FC47-M2 | kit p95-p50 >= 25; material >= 7 | phase 2; sheen interim (fabric rim 0.45), number decals blocked (WP-36 number sheet) |
| FC47-M3 | bottom row p5 <= 120 and >= 25 below top | phase 2 |
| FC47-M3 | flipped player correlation >= 0.5 | phase 2 |
| FC47-M3 | <= 480 draws | phase 2 (`?mirror=off` fallback ready) |
| FC47-A1 | `primitives.` 34 -> <= 14 | partial: 26 lines with `primitives.` in scene.ts after PF1 batching; rest blocked (WP-36 football kit) |
| FC47-A1 | no diamond/hoops keys | blocked (WP-36) |
| FC47-A1 | game-checks 0 errors | done (0 errors) |
| FC47-A2 | >= 3 venue-only props per venue; dome hash same; within PF1 | blocked (WP-36 venue sets) |
| FC47-V1 | effects active within 0.5 s of a goal | phase 2 (pack fires on the goal event: unit) |
| FC47-V1 | pyro in >= 2 of 3 goal frames | phase 2 |
| FC47-V1 | 0 floating dots in 10 action frames | phase 2 |
| FC47-V2 | Glacier sky G-R >= 25 | phase 2 |
| FC47-V2 | 3 fewer planes | done (unit: no `fc-aurora-<n>` planes, 3 ribbons) |
| FC47-AN1 | crowd diff >= 3x baseline after a goal; motion report; crowd <= 16 draws | blocked (WP-36 rigged fans and clips) |
| FC47-C1 | cutThisFrame on shot changes; replay >= 3 s; portrait fit test passes | done in code (1b4600c18): `setPose(..., { cut: true })` on every shot change, replay playback 3.0 s, portrait fit >= 19.5 m at 390x844 (unit `broadcast-package.test.ts`); live cutThisFrame read: phase 2 |
| FC47-H1 | lower third on goal | done in code (unit wiring); pixels: phase 2 |
| FC47-H1 | in-world score matches state | done in code (947db1df5): SDF digit reel, evidence `inWorldScore` vs `score`, unit `scoreboard-text.test.ts` |
| FC47-H1 | text >= 12 px | done (unit over hud.ts) |
| FC47-H1 | no system-ui | done (unit) |
| FC47-W1 | >= 8 prop keys within 10 m per venue; within PF1 | blocked (WP-36 steward, photographer) |
| FC47-PF1 | <= 360 draws (Uyuni <= 480) | phase 2 (stands 14 -> 1, hoardings 4 -> 1 batch) |
| FC47-PF1 | JS +40 KB max | phase 2 |
| FC47-PF1 | 6 before/after rows | before rows in budget.json; after: phase 2 |
