# GU47 lane eh: WP-8 (E-H) camera, animation, crowd kit, GLB cache

- Branch: `gu47/eh` (worktree `/Users/gurbakshchahal/platforms/aura3d-gu47/eh`)
- Base commit: `f797808be`
- Wave: 1 (phase 1, code). Nothing was run in a browser, remotely or on a GPU.
- Scope: `briefs/scope-eh.md`; PRD contract lines 263-278, WP lines 434-439, PRD §4.1 E-H row.

## Rows

| ID | Pri | Status | Commit | Notes / evidence |
|---|---|---|---|---|
| EH-1 contract `rigs.rail` | M | done | 707378f5b | Predecessor's uncommitted `contracts/camera.ts` reviewed and kept: `stubCameraRigFactories.rail` delegates to `createRailRig` (lazy arrow, cycle-safe). S19 tree-shake gate unchanged (typical 11979 gzip, everything 22625 gzip, identical to base). `tests/unit/gu47/eh/contract-rail-rig.test.ts`. |
| EH-2 `playLayer({ speed })` | M | done | c1f7467ea, e061f0b49 | Contract `AuraPlayLayerOptions.speed` (predecessor); forwarded as the layer action `timeScale` (`actorAnimationHandle.ts`). `tests/unit/gu47/eh/actor-play-layer-speed.test.ts`. |
| EH-3 `actor.pose.setLocalRotation` | M | in progress | c1f7467ea (types) | |
| EH-4 `handle.part(name)` | M | pending | - | |
| EH-5 TypedGLBActor `crossFadeTo` / `playLayer` | M | pending | - | |
| EH-6 root render sources cast/receive shadows | M | pending | - | |
| EH-7 crowd kit | M | pending | - | |
| EH-8 `GlbResourceCache` | M | pending | - | |
| EH-9 tests + receipt spec `crowd-kit` | M | pending | - | |

## Handoffs

| to lane | file:symbol | change | why |
|---|---|---|---|

## Handoffs received

| from lane | item | status |
|---|---|---|

## Verification

- Base (`f797808be`, predecessor files stashed): 16 covering files, 99/100 pass; 1 pre-existing failure `tests/qr/prd04/unit/typed-glb-actor-snapshot.test.ts > material variants` (ENOENT `fixtures/asset-corpus/materials-variants-shoe.glb`, LFS fixture absent in the worktree).
