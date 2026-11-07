# Lane 514: metals and glass visibility (benchmark fix 4)

Branch `lane/514-materials-env`, base `origin/main` e5387f3b0. Real GPU (headless Chrome, Metal, loopback CDP), virtual-clock shim
(`tools/shim.js` from origin/lane/504-bellkeeper), captured by `tools/cap.mjs` under the shared `/tmp/a3d-rea.lock`.

## Diagnosis (from real frames)

1. materials-1: chrome reflected a near-uniform probe (vertical stripes at best), so the sphere had nothing to mirror.
2. Clear glass drew as an opaque white ball: `A3D_QR_MATERIALS_TRANSMISSION` is not on unless a source sets it, so the forward pass logs
   `TRANSMISSION_DEGRADED` and draws without transmission. That, not the probe, is why raising `envMapIntensity` to 2.6 did nothing.
3. Not a tone-mapping or specular-occlusion problem in these frames.

## Change (additive)

- `environments.studio({ preset: "softbox" })`: structured procedural probe, baked deterministically (`tools/environments/bake-softbox.ts`),
  embedded in the package (lazy chunk, no fetch) and shipped as `public/aura-environments/softbox.*` (0.5 MiB). Plain `environments.studio()` and
  `environments.neutral()` untouched.
- `material.studioMetal({ color, roughness })`, `material.studioGlass({ tint, ior, thickness })`: wrap `material.metal` / `material.glass`.
- A scene using a studio material and authoring no `environments.*` node or look binds softbox itself; `createAuraApp` turns transmission on for
  studio glass unless a source set the flag.

## Before/after (frames/)

materials-1 benchmark source (aura r1), only the environment line and two material calls swapped (`m1/before.ts` vs `m1/after.ts`):
`m1-before.png`, `m1-after.png`; helpers with no `environments.*` node: `m1-auto.png` (mean abs diff 0.32 vs `m1-after.png`).
Glass/steel sphere contrast to surrounding backdrop (luma): glass 16.7 -> 26.1, steel 0.3 -> 52.1; steel luma std dev 33.8 -> 67.6 (`tools/roi.mjs`).
materials-3 (`m3/`): gold materials only plus preset swapped. Frame mean abs diff 7.3 vs before.

## Blind judge (`judge/`, tools/agent-eval/judge-visual.mjs rubric, 3 calls per pair, pair = our frame vs the three.js frame of runs r1, r2, r3)

| frame | aura wins | aura mean /25 | three.js mean /25 |
|---|---|---|---|
| materials-1 before | 0/3 | 13.7 | 19.0 |
| materials-1 after | 0/3 | 14.3 | 18.7 |
| materials-3 before | 1/3 | 16.0 | 17.7 |
| materials-3 after | 1/3 and 2/3 (two runs; one call in the first run failed to parse) | 16.5 / 16.7 | 17.5 / 17.7 |

The judge did not flip materials-1: it still prefers the three.js frames (larger, better-framed spheres, stronger floor shading), and the judge
scored "before" materials-1 as having a tinted glass sphere, which the frame does not show; treat the judge as noisy. Gain on the judged score is
about +0.6 on materials-1 and about +0.6 on materials-3, inside the noise.

## Pixel neutrality (`games/`)

Same shim, same frame count, origin/main served on :18515 and this branch on :18514; `baseA` vs `baseB` is the noise floor.
Valid game frames (non-black, real 3D scene): 3 of the attempted 12 games.

| game | base A vs base B | base A vs branch |
|---|---|---|
| top-tennis | 5.54 (animated, unfrozen) | 0 |
| roadster-rush | 0 | 0 |
| slingshot-siege | 0 | 0.0055 (max 44, a handful of pixels) |

The other nine (heatsink, iron-crown, aura-hoops-3d, pips-big-leap, aura-diamond-3d, aura-links-3d, aura-fc-3d, cross-hop, dot-dash-3d, bunker-zero)
rendered only the HUD over a black canvas on this loaded machine (3D assets never finished loading), so their 0 diffs are not evidence and
are NOT counted (`games/invalid-black/` shows three). The 5-game requirement is NOT met by pixels.
Code-level argument: no live game calls `studioMetal`, `studioGlass` or `preset: "softbox"` (new APIs); the only edits on shared paths are
a scene-scan that returns the same node list when no studio material is present, `qrFlagsWithStudioGlass(flags, false)` which returns the same
object, and an `EnvironmentCache` branch for the new `softbox` key.

**Superseded by the v2 neutrality run below (2026-11-07).** The "black canvas" diagnosis above was wrong: it was not machine load. The
repo-root vite server does not serve route-local `apps/<route>/public/*` (app vite configs point `publicDir` at the root `public/`; the
route dir is layered only by `tools/remote-capture.sh`), so every game whose GLBs live in `apps/<route>/public/aura-assets` got the SPA
`index.html` instead of the GLB (Bunker Zero says so on screen: "gLTF extension scan failed for /aura-assets/bzGuardMeshy.010bba7b.glb:
HTTP 200"). No LFS pointers were involved (none in either checkout).

## Pixel neutrality v2 (`games-v2/`, 2026-11-07)

Method (`tools/neutral.sh`, `tools/pairs.mjs`): per game four captures in the order base A, branch A, base B, branch B, all on the
virtual-clock shim, 90 frames of 16.667 ms, 960x540, real GPU (headless Chrome, Metal), one capture at a time under `/tmp/a3d-rea.lock`.
Each capture first waits with virtual time frozen (`frame(0)`) until the network is idle for 5 s (`CAP_NET_IDLE`), so slow loads cannot
change how much game time the measured frames cover. Base = origin/main e5387f3b0 worktree on :18515, branch = this lane's HEAD (no
uncommitted engine changes) on :18514. Games with route-local assets are served through `tools/route-public-proxy.mjs` (:18525 -> :18515,
:18524 -> :18514; the same proxy code for both sides; it only adds files that exist in `apps/*/public` and not in the root `public`).
Every frame listed as valid was opened and checked: it is the intended game page with its 3D scene drawn (not black, not the marketing
page, not another game).

| game | valid | base A vs base B (noise) | branch A vs branch B | base A vs branch A | base B vs branch B |
|---|---|---|---|---|---|
| aurora-lander | yes | 0 | 0 | 0 | 0 (all four md5 a93908dc) |
| bunker-zero `?floor=1&autostart=1` | yes | 0 | 0 | 0 | 0 (all four md5 3c5bc202) |
| dot-dash-3d | yes | 0 | 0 | 0 | 0 (all four md5 28841279) |
| bank-shot | yes | 0 / max 1 | 0 / max 1 | 0 (same md5) | 0 (same md5) |
| pips-big-leap | yes | 0 | 0.0005 / max 1 | 0 (same md5) | 0.0005 / max 1 |
| slingshot-siege | yes | 0.0013 / max 1 | 0 | 0 (same md5) | 0.0013 / max 1 |
| aura-diamond-3d | yes, dark night look in base and branch alike | 0 | 0 | 0 | 0 (all four md5 6b4a05de) |
| roadster-rush | yes (title card over the 3D street) | 0.169 / max 2 | 0.169 / max 2 | 0.168 / max 2 | 0.169 / max 2 |
| teleoperator | yes | 0.0008 / max 20 | 1.89 / max 80 | 1.89 / max 80 | 0.0018 / max 20 |
| cross-hop | frames valid, NOT deterministic under the shim | 13.9 / max 212 | 15.7 / max 220 | 16.9 | 14.8 |

Seven games (aurora-lander, bunker-zero, dot-dash-3d, bank-shot, pips-big-leap, slingshot-siege, aura-diamond-3d) have base-vs-base noise
of 0 to max 1 and base-vs-branch of 0 to max 1, inside their own noise floor. Five of them have byte-identical base and branch frames.

Non-zero diffs explained:
- **teleoperator**: multimodal, not a branch effect. Over three rounds (`games-v2/teleoperator-repeat/allpairs.txt`, 12 frames) the frame
  that differed (branch A, md5 688e1fd8) is produced byte-for-byte by origin/main too (run 3 base B and run 4 base B are 688e1fd8), and the
  most common branch frame (768b0879) is also produced by origin/main (run 4 base A).
- **roadster-rush**: the same 0.17 / max 2 residual appears between two base runs; base and branch differ by the same amount.
- **cross-hop**: traffic is not frozen by the shim (base vs base 13.9); not usable as neutrality proof, listed for completeness.

### Slingshot Siege (re-review blocker 2)

The old `games/slingshot-siege-branch.png` (mean 0.0055, max 44 vs `baseA`) is not reproducible and is run-to-run noise that origin/main
shows too:
- `games-v2/slingshot-repeat/` repeats the ORIGINAL capture method (`tools/sling-repeat.sh`: `CAP_WAIT_READY` readPixels probe, base and
  branch interleaved, 3 each). Slingshot renders one of two frames, md5 a22749a8 or 90c7a761 (mean 0.0013, max 1 apart), and BOTH
  origin/main and the branch produce BOTH (base 1, base 2, branch 1, branch 3 = a22749a8; base 3, branch 2 = 90c7a761;
  `allpairs.txt`). The v2 run adds four more (base A, branch A, branch B = a22749a8; base B = 90c7a761).
- The old frames themselves are from a different game state: the old `baseA` differs from all ten new frames by mean 2.84 / max 193,
  i.e. the 2026-11-06 session (a much busier machine) captured a different moment, and its base/branch pair differed by timing as well.
- Code level: the `EnvironmentCache` edit only adds `"softbox"` next to `"neutral"` in two boolean expressions; for every existing key
  (`neutral`, `studio`, `outdoor`, `sunset`, `night`, `indoor`, URL HDRIs, captures) `keyId()` and `reusable` evaluate exactly as on main,
  and the new loader branch runs only for `preset === "softbox"`. Slingshot uses `looks.preset(...)` (a look node), never a studio
  material, so `needsSoftboxEnvironment` returns the node list unchanged and `qrFlagsWithStudioGlass(flags, false)` returns the same
  object. No engine change was needed.

## Blind judge re-run (`judge/rerun-2026-11-07/`, frames `frames/rerun-2026-11-07/`)

Fresh real-GPU captures of the same benchmark sources (800x600 window, 640x360 canvas, matching the three.js frames), same rubric and
procedure (`tools/judge-514.mjs`, the judge-visual.mjs rubric from origin/exp/turn-gap-504, model claude-sonnet-5.5 via Prism, seed
20261106, 3 calls per pair against the three.js frames of runs r1, r2, r3 from bench505-materials).

| frame | aura wins | aura mean /25 | three.js mean /25 |
|---|---|---|---|
| materials-1 before | 0/3 | 13.3 | 19.0 |
| materials-1 after | 0/3 | 14.7 | 19.0 |
| materials-3 before | 1/3 | 16.3 | 17.3 |
| materials-3 after | 0/3 | 15.0 | 18.0 |

three.js still wins materials-1 3 of 3 and, in this run, materials-3 3 of 3 for the "after" frame (the first run gave 1/3 and 2/3). The
materials-3 before/after difference is inside the judge's run-to-run noise. Judge reasons, quoted: materials-1 "B's floor and backdrop
are washed out, its shadows are faint, and its fabric looks pinkish and flat"; materials-3 "flat, washed-out grey floor, a small trophy
and little spotlight falloff", "cooler, less spotlit look".

## Is the remaining materials-1 gap the environment / backdrop? (no)

- `m1/backdrop.ts` = `m1/after.ts` with the softbox probe painted behind the scene (`background: true`): **0 pixel difference** to
  `m1/after.ts` (`frames/rerun-2026-11-07/m1-backdrop.png`). The benchmark's own seamless cove geometry fills the whole view, so glass
  already has the cove to refract and no probe backdrop is ever visible.
- `m1/diffuse-040.ts`, `m1/diffuse-015.ts`: softbox `diffuseIntensity` 0.40 / 0.15. Both frames are identical to each other and within
  mean 0.01 / max 9 of `after`, so `diffuseIntensity` has no visible effect on this render path (noted, not changed here). Probe swap
  alone: cove wall luma 227.7 with the old studio probe (`before`) vs 235.3 with softbox (`after`); three.js cove wall 187, floor 231. The
  probe accounts for about 8 of the about 48 luma by which our wall is brighter; the rest comes from the scene's direct lights (key 2.6,
  softbox light 3, rim 2, fill 0.8) and exposure/tone on the same source.
- A minimal scene with no authored backdrop (`glass-min/`): `auto.ts` (no environments node, the shipped default) is byte-identical to
  `before.ts` (explicit softbox probe, background off). The candidate default "studio glass brings the probe backdrop"
  (`backdrop.ts`, frame `frames/glass-min/backdrop-rejected.png`) changes the backdrop but not the glass: mean luma inside the glass
  sphere 182.9 -> 184.3, and the sphere's contrast against its surroundings drops (23.0 -> 18.1). It was tried as an engine default and
  reverted; no default was changed.
- What the judge and the luma numbers point at instead (outside this lane's materials/environment scope): exposure of the white cove,
  contact-shadow strength, the fabric's red, and framing (three.js spheres are larger in frame).

## Declarations vs published 5.0.2 (`tsc -p tsconfig.build.json --declaration --emitDeclarationOnly`, compared with `npm pack @aura3d/engine@5.0.2` / `@aura3d/rendering@5.0.2`)

Touched files only, import-specifier / `.js` normalisation ignored. All additions: `material.studioMetal`, `material.studioGlass`,
`AuraStudioEnvironmentOptions` (extends `AuraEnvironmentOptionsV2` with `preset?: "studio" | "softbox"`; `environments.studio`'s parameter
widens to it), `sceneUsesStudioGlass`, `qrFlagsWithStudioGlass`, new modules `studioMaterial`, `SoftboxEnvironmentScene`,
`softboxEmbedded`, `softboxEmbeddedLoader`; `EnvironmentCache.d.ts`, `createAuraAppCore.d.ts`, `frameLoop.d.ts` unchanged.
One caveat to report: the string unions `AuraEnvironmentPresetName` and `AuraEnvironmentSourceResolution.probe.preset` gain `"softbox"`.
Widening a union is additive for inputs, but these also appear in output positions (`AuraEnvironmentNodeV2.preset`, the resolved probe),
so a consumer with an exhaustive `switch` + `never` check over them would see a new case at compile time.
