# Athlete rebuild: Hoops, Diamond, Links (4.3.1)

The 4.3.0 repair (`split-bridges`: stretched triangles get their own rigid vertices) passed `assets validate --skin` but left white hairline tears on the shorts, hems and shoulders. This replaces it with a rebuild like the Aura FC fix.

## What shipped

`tools/aura-athletes/rebuild-athlete.ts` (runs `tools/aura-fc/rebuild-legs.mjs` and `rebuild-arms.mjs`, which gained `capSleeves`, `capRadius` and `palms`). Region comes from the palette cell and row each vertex samples (cells 1 and 7 carry the face detail by row).

- **Jersey:** the old shell is replaced by a clean tube measured from the old torso (half width and depth per height) on the straight skeleton axis, Hips/Spine/Chest weights, closed into the neck.
- **Legs:** thigh, shin, shorts (Hoops) or pants down to the ankle (Diamond, Links), socks, shoes straightened, smooth hip, knee and ankle weights.
- **Arms:** sleeves with capped hems, upper-arm and forearm tubes, mitten and thumb, smaller shoulder caps (`--cap-radius 0.075`).
- **Kept:** head, hair, eyes, brows, mouth, shoes, palette texture, skeleton, clips, bone names and IBMs.
- **Links golfer:** the Diamond body in the Links palette on the Links skeleton, as in 4.3.0.
- **Palm points:** the forearm follows shoulder, elbow and the games' calibrated palm point, so the dribble (Hoops `PALM_OFFSET`), bat (Diamond `RIG.palmR`) and club (Links `RIG.palmR`) grips are unchanged. Centroid of the drawn hand in forearm bone space, target vs rebuilt: Hoops (-0.117,-0.245,0.137) vs (-0.117,-0.245,0.147); Diamond (-0.158,-0.296,0.060) vs (-0.154,-0.288,0.065); Links (-0.117,-0.245,0.137) vs (-0.114,-0.240,0.142). The Diamond drawn-grip and batter-grip unit tests pass with `RIG.palmR` untouched.

## Numbers (`aura3d assets validate --skin`, 23 clips x 10 poses)

| asset | before (4.3.0) | after |
|---|---|---|
| hoopsAthleteBig | 1.60x after splitting 810 triangles (17.9x originally) | 1.56x, 0 triangles over 1.6x, no split, no cut |
| hoopsAthleteGuard | 1.60x after splitting 496 (21.4x) | 1.55x, 0 over |
| diamondAthlete | 1.60x after splitting 1224 (30.8x) | 1.54x, 0 over |
| linksGolferAthleteMeshy | 1.64x, 5 over | 1.54x, 0 over |

`tests/unit/athletes-rebuild/skin.test.ts` holds the 1.6x ceiling for all four.

## Frames (software GL, real games)

`p3ath2-hoops`, `p3ath2-diamond`, `p3ath2-links` (gameplay filmstrips), `p3ath2-hdrib` (Hoops chase-camera dribble frames, `p0-*`) and `p3ath2-dgrip` (Diamond grip frames, `grip-*`). Jerseys, shorts, pants, sleeves and hems read as intact surfaces in Hoops run and dribble, Diamond stance, swing and fielders, and the Links address and swing: no shards, slabs or holes. Not the owner's 3 to 4 m front-left close-up: the frames are the games' own cameras.

## Not clean

- The Hoops dribble probe (`tests/browser/hoops-dribble-probe.spec.ts`) fails its running case in both runs (palm height 0.709 m vs 0.6 and horizontal palm to ball 0.205 m vs 0.2 in the last run; 0.19 m meet and 0.315 m horizontal in the earlier one) while the standing case passes. The hand centroid is within 1 cm of the previous palm model, so this is the run-to-run spread of the running dribble, not the rebuild; a baseline run on the 4.3.0 assets did not finish in time to confirm.
- Shoulder caps are small spheres, visible as a slight knob on sleeveless white jerseys.
