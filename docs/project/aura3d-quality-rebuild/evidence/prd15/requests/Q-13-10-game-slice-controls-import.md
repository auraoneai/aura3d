# Q-13-10 → to:prd13 (qr-request, CONTRACTS §6.5)

**GitHub issue:** #689

**Files:** `examples/game-slice/main.ts` (13-owned)
**Contract served:** PRD-15 T8.1 — `packages/input/src/controls` is removed in 4.0.0
once no in-repo consumer outside 15-owned files remains. It is currently blocked
by this file.

## Requested change

In `examples/game-slice/main.ts`, move the two controls names off `@aura3d/input`
onto `@aura3d/controls` (both are exported there already):

```diff
-import { createSceneCameraControlAdapter, InputPlayback, InputRecorder, InputSnapshot,
-  InputSystem, ThirdPersonFollowControls, sampleVirtualTouchJoystickFixture,
-  type GamepadLike, type InputPlaybackSnapshot, type InputRecording } from "@aura3d/input";
+import { createSceneCameraControlAdapter, ThirdPersonFollowControls } from "@aura3d/controls";
+import { InputPlayback, InputRecorder, InputSnapshot, InputSystem,
+  sampleVirtualTouchJoystickFixture,
+  type GamepadLike, type InputPlaybackSnapshot, type InputRecording } from "@aura3d/input";
```

`@aura3d/controls` exports `createSceneCameraControlAdapter` and
`ThirdPersonFollowControls` from `packages/controls/src/engine/` — the canonical
homes. The `@aura3d/input` re-exports are the deprecated copies in
`packages/input/src/controls/`.

## rg -l output (as attached per §6.6)

```
examples/game-slice/main.ts     (13-owned — this request)
packages/input/src/index.ts     (15-owned — re-export lines kept until this lands)
packages/input/src/controls/*   (15-owned — deleted once unblocked)
```

No other in-repo file imports the `input/controls` names: every other
`@aura3d/input` importer uses core input names only (`InputSystem`,
`InputSnapshot`, `pickingRayFromCamera`, `playHaptic`, …) verified via
`rg -ln 'from "@aura3d/input"'` cross-checked against the 14
`packages/input/src/index.ts` `./controls/` re-export lines.

## Until merged

`packages/input/src/controls` and its 14 `@aura3d/input` re-export lines stay
deprecated in 4.0.0 and are listed in the release notes under "still-deprecated
surfaces" per §6.6 step 3. The lane does not wait.
