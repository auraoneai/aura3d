# IC-12: own idle, crouch and throw clips (Iron Crown)

Commit 296d7b781 on `audit-fix/g05-ic12` (cut from origin/main 47388606e, Aura3D 4.6.1).

## What changed

All six fighter GLBs gain four Meshy `animate` clips; the ten shipped clips, the geometry (position-accessor hashes) and the WebP textures are unchanged.

| State | Before (origin/main) | After | Meshy action id |
|---|---|---|---|
| idle | `Block1` (stand-in) | `Combat_Stance` | 89 |
| crouch | `Block1` (stand-in) | `CrouchLookAroundBow` | 258 |
| throw | `Triple_Combo_Attack` (stand-in) | `Over_Shoulder_Throw`, 1.3 to 3.8 s window, 4x | 421 |
| win | `Regular_Jump` (stand-in) | `Victory_Fist_Pump` | 403 |
| guard | `Block1` | `Block1` (now the only state on it) | |
| dash | `Walk_Fight_Forward` (stand-in) | unchanged, still the one stand-in | |

The fighters' original rig tasks had expired (Prism returns 404 on `GET /rigging/<id>`), so each fighter was re-rigged from the same remeshed mesh at its original height (Kenji 1.80 m, Volt 1.78, Boulder 2.00, Seraph 1.85, Jinx 1.70, Sovereign 2.05). The new rigs have the same 24 joint names but different joint placement, so `tools/iron-crown-clips/retarget-clips.mjs` moves each clip onto the admitted skeleton through the bind pose. On Kenji, 400 sampled vertices of the admitted mesh land 0.65 cm (mean) from where the fresh rig puts them in the new clips, max 13.8 cm; copying the channels by joint name gives 1.42 cm mean, max 10.6 cm. Task ids, credits and checks per fighter: `apps/showcase-iron-crown/aura-evidence/meshy/ironcrown*.ic12-clips.json`.

Meshy jobs: 6 rigging + 24 animate in the shipped set (102 credits by the task records); 5 rigs at 1.8 m that were discarded for the wrong height and 15 extra animate candidates for action selection bring the ledger (`aura3d meshy ledger --game iron-crown`) to 50 jobs, 172 credits estimated. All calls went through Kiro Prism.

`aura3d assets validate --skin` reports `SKIN_STRETCH` and `SKIN_JOINT_RANGE` on every fighter, on the shipped clips too (Kenji body: 2,564 of 29,334 triangles past 1.6x in `Idle`, 3,371 in `Block1`; 2,864 in `Combat_Stance`, 4,211 in `CrouchLookAroundBow`, 5,986 in `Over_Shoulder_Throw`). These are the same Meshy rigs and the new clips sit in the shipped range; per-clip counts are in the evidence JSON.

## Remote proof

Spec `tests/browser/audit-fix/iron-crown-ic12.spec.ts` on the remote runner (Azure ACR Tasks, headless Chromium, software WebGL2), Combo Lab, 1280x720. Runs `ic12-before-k`, `ic12-before-v` (origin/main) and `ic12-after-k`, `ic12-after-v` (this branch); each took 8.5 to 10 min and passed. Kenji runs pair Kenji with Volt; Volt runs pair Volt with Boulder. Idle and crouch shots are taken 45 s and 35 s into the state (steady state); throw shots are the presented frames while the game reports clip `throw`.

- `compare-ic12-kenji.jpg`, `compare-ic12-volt.jpg`: before and after, idle, crouch and throw.
- `before/<k|v>/`, `after/<k|v>/`: every frame and `meta.json` (game state and live bone world positions read through `animation.socket(bone)`).
- `live-bones.json`: the numbers below. `clip-numbers.json`: the same measures sampled from the GLB clips for all six fighters (no browser).

Live bone heights in metres and torso pitch (hips to head, degrees from vertical), second shot of each state:

| Fighter | State | Clip | Hips Y | Head Y | Higher hand Y | Torso pitch |
|---|---|---|---|---|---|---|
| kenji (kenji run) | idle | Block1 → Combat_Stance | 0.90 → 0.88 | 1.48 → 1.41 | 1.33 → 0.99 | 17.1 → 28.4 |
| kenji (kenji run) | crouch | Block1 → CrouchLookAroundBow | 0.88 → 0.54 | 1.47 → 1.05 | 1.46 → 0.64 | 15.6 → 34.2 |
| volt (kenji run) | idle | Block1 → Combat_Stance | 0.93 → 0.91 | 1.46 → 1.39 | 1.31 → 1.04 | 14.6 → 25.5 |
| volt (kenji run) | crouch | Block1 → CrouchLookAroundBow | 0.92 → 0.59 | 1.45 → 1.05 | 1.41 → 0.67 | 13.3 → 30.9 |
| volt (volt run) | idle | Block1 → Combat_Stance | 0.92 → 0.90 | 1.44 → 1.37 | 1.33 → 1.01 | 16.9 → 28.0 |
| volt (volt run) | crouch | Block1 → CrouchLookAroundBow | 0.91 → 0.59 | 1.44 → 1.05 | 1.36 → 0.67 | 12.8 → 30.9 |
| boulder (volt run) | idle | Block1 → Combat_Stance | 1.02 → 0.98 | 1.62 → 1.51 | 1.52 → 1.12 | 19.2 → 31.3 |
| boulder (volt run) | crouch | Block1 → CrouchLookAroundBow | 1.01 → 0.63 | 1.62 → 1.15 | 1.56 → 0.81 | 15.0 → 32.8 |
| kenji | throw (2 frames) | Triple_Combo_Attack → Over_Shoulder_Throw | 0.78, 0.87 → 0.85, 0.60 | 1.32, 1.48 → 1.40, 0.95 | 0.98, 1.65 → 1.06, 1.00 | 27.1, 8.6 → 27.9, 54.0 |
| volt | throw (2 frames) | Triple_Combo_Attack → Over_Shoulder_Throw | 0.81, 0.90 → 0.88, 0.65 | 1.29, 1.43 → 1.37, 0.99 | 1.02, 1.65 → 1.09, 1.04 | 26.2, 10.2 → 25.9, 48.8 |

Before, idle and crouch were the same `Block1` guard (hips 0.88 to 1.02 m, hands at head height). After, idle is a lower stance with the hands near the belt, and crouch drops the hips by 0.32 to 0.39 m and the head by 0.42 to 0.47 m on all three fighters. The throw now ends bent over the thrown foe (torso pitch 49 to 54 degrees, head down to 0.95 m) instead of a combo punch.
