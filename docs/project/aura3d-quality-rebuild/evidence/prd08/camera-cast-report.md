# camera-cast report

- apps/showcase-blockfall-reactor/src/camera-feel.ts:92 — cameraSpec.position = … → none — direct write to camera-spec value — migrate to app.camera.setPose/setFov or rigs.fromSpec (style b)
- apps/showcase-blockfall-reactor/src/camera-feel.ts:93 — cameraSpec.target = … → none — direct write to camera-spec value — migrate to app.camera.setPose/setFov or rigs.fromSpec (style b)
- apps/showcase-blockfall-reactor/src/main.ts:1557 — spec.position = … → none — direct write to camera-spec value — migrate to app.camera.setPose/setFov or rigs.fromSpec (style b)
- apps/showcase-blockfall-reactor/src/main.ts:1561 — spec.position = … → none — direct write to camera-spec value — migrate to app.camera.setPose/setFov or rigs.fromSpec (style b)
- apps/showcase-blockfall-reactor/src/main.ts:1577 — spec.position = … → none — direct write to camera-spec value — migrate to app.camera.setPose/setFov or rigs.fromSpec (style b)
- apps/showcase-blockfall-reactor/src/main.ts:1581 — spec.position = … → none — direct write to camera-spec value — migrate to app.camera.setPose/setFov or rigs.fromSpec (style b)
- apps/showcase-cinematic-architecture/src/main.ts:500 — Object.assign(app.scene.camera as unknown as …, cameraPaths[controls.cameraPath].createC) → approximate (app.camera.use(app.camera.rigs.fromSpec(merge))) — dynamic updates merged into a spec
- apps/showcase-courier-rush/src/main.ts:1394 — Object.assign(chaseCamera as unknown as …) → approximate (app.camera.use(app.camera.rigs.fromSpec(merge))) — spec fields kept verbatim: offset
- apps/showcase-patrol-wing/src/main.ts:805 — Object.assign(chaseCameraSpec as unknown as …) → approximate (app.camera.use(app.camera.rigs.fromSpec(merge))) — spec fields kept verbatim: offset, targetOffset
- apps/showcase-patrol-wing/src/main.ts:854 — Object.assign(chaseCameraSpec as unknown as …) → approximate (app.camera.use(app.camera.rigs.fromSpec(merge))) — spec fields kept verbatim: offset
- apps/showcase-patrol-wing/src/main.ts:1051 — Object.assign(chaseCameraSpec as unknown as …) → approximate (app.camera.use(app.camera.rigs.fromSpec(merge))) — spec fields kept verbatim: targetOffset
- apps/showcase-skyline-runner/src/feel.ts:476 — cameraSpec.offset = … → none — direct write to camera-spec value — migrate to app.camera.setPose/setFov or rigs.fromSpec (style b)
- apps/showcase-skyline-runner/src/feel.ts:477 — cameraSpec.targetOffset = … → none — direct write to camera-spec value — migrate to app.camera.setPose/setFov or rigs.fromSpec (style b)
- apps/showcase-skyline-runner/src/feel.ts:479 — cameraSpec.fov = … → none — direct write to camera-spec value — migrate to app.camera.setPose/setFov or rigs.fromSpec (style b)
- apps/showcase-skyline-runner/src/main.ts:1704 — platformerCamera.mode =… → none — direct write to camera-spec value — migrate to app.camera.setPose/setFov or rigs.fromSpec (style b)
- apps/showcase-skyline-runner/src/main.ts:1704 — platformerCamera.targetNode =… → none — direct write to camera-spec value — migrate to app.camera.setPose/setFov or rigs.fromSpec (style b)
- apps/showcase-turbo-drift-circuit/src/main.ts:2760 — Object.assign(racingCamera as unknown as …, chaseCameraTuning) → approximate (app.camera.use(app.camera.rigs.fromSpec(merge))) — dynamic updates merged into a spec
- apps/showcase-turbo-drift-circuit/src/main.ts:3761 — mountedEvidence.camera.mode =… → none — direct write to camera-spec value — migrate to app.camera.setPose/setFov or rigs.fromSpec (style b)
- apps/showcase-turbo-drift-circuit/src/main.ts:3762 — mountedEvidence.camera.targetNode =… → none — direct write to camera-spec value — migrate to app.camera.setPose/setFov or rigs.fromSpec (style b)

19 construct(s): 0 exact, 6 approximate, 13 manual
