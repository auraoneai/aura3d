# 08-POSE — design notes vs Q-15-9 (#645)

Root cause (verified on `main` `afb475c2f`): `flattenSceneSnapshot` shallow-spreads
`snapshot`, so `renderSnapshot.camera` holds the same camera OBJECT the mount-time
spec built. Under `A3D_QR_CAMERA`, `CameraController.applyPose` (and
`camera.setPose`, rig updates, sequences, layers) write to the controller's
presented pose — reassigning `snapshot.camera` to a NEW object in some paths —
while the render path keeps reading the flattened copy. Net effect: the renderer
draws the mount-time camera forever; trauma/shake/roll/fov never reach pixels.
`diagnostics().camera.viewProjection` is computed from the presented pose, so
the diagnostic and the rasterized frame disagree — exactly the S-15 gate.

Every file on the render-path side is lane-15-owned, so the seam must come from
lane 15 — filed as Q-15-9 / issue #645. These notes are the contract we're
asking for and how lane 08 will consume it.

## Proposed seam (either is acceptable; A preferred)

**Option A — registry-level override:**
`AuraRuntimeNodeRegistry.setCameraOverride(pose | undefined)` where
`pose = { position, target, up, roll, fov, near, far }` (the presented-pose
shape). `resolveCameraFrame` (or its successor in `compiler/camera.ts`) consults
the override FIRST; when unset it resolves from spec as today — flag-off output
is byte-identical by construction.

**Option B — controller-level setter:**
`productionController.setCameraOverride(pose | undefined)` on the render-loop
owner (`createAuraApp.ts` internal), called once per presented frame from the
08-LOOP onFrame tick before `renderer.render`.

## Call sites that must read the override (verified, all lane 15)

- `compiler/renderInput.ts:136` — builds the camera VP the renderer submits.
- `compiler/renderer.ts:92,282` — main render path + shadow/depth prepass.
- `compiler/postprocess.ts:229` — post FX needing the same VP (motion/DOF).
- `sceneMath.ts:129-131` — `createViewProjection` helper: also where
  `spec.up`/`spec.roll` compose into the up vector (Q-15-1 follow-up).
- `frameLoop.ts:151` — diagnostics `camera.viewProjection` must report the
  same matrix the renderer used (equality within 1e-6 is the S-15 assert).

## What lane 08 does when it lands

1. `CameraController` publishes the presented pose into the seam each frame the
   rig pipeline is active (inside the armed onFrame tick — the 08-LOOP hook).
2. `applyPose`/`setPose`/`use(rig)`/`cut()` all funnel through the same publish
   path so every mutation reaches the renderer, not just rig updates.
3. Browser test `camera-pose.spec.ts`: trauma emit + shake layer + roll +
   fov ramp → `diagnostics().camera.viewProjection` equals the VP the renderer
   submitted (read back via the seam or a diagnostics echo) within 1e-6;
   isometric/orbit projection preserved under flag.
4. Flag-off: seam never written → byte/pixel-identical output.

## Kill criteria / done-when

- With `A3D_QR_CAMERA` on, a rig/sequence/trauma-driven scene shows the
  rendered camera tracking `diagnostics().camera.viewProjection` within 1e-6
  on every presented frame (browser run, macos-14).
- With the flag off, current captures are unchanged.
