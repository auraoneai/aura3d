# Apex Overdrive: black canvas when GLBs are missing

Group C screenshot problem: the first captures were black under the HUD until two GLBs were staged. Remote software WebGL2.

## Packaging: nothing is missing

The three root-manifest GLBs the page loads (`roadsterRushSkyCar.295dcba7.glb`, `roadsterRushPlayerCar.c7f9617d.glb`, `showcaseModernBuildingOne.d3216bb2.glb`) are tracked in git and present, so a clean-worktree deploy ships them. The first capture was black only because the remote runner's slim context omits `public/aura-assets` (and `apps/showcase-roadster-rush`, `apps/showcase-port-shared`) unless they are staged (`PUBLIC_ASSETS`, `EXTRA_DIRS`). With them staged the full scene renders and no request fails (`glbs-staged.jpg`). Live site on `main`: not affected by packaging.

## Defect found: one failed GLB blanks the whole scene, silently

With the same three GLB requests aborted (`glbs-blocked-black-canvas.jpg`): no sky, no road, no cars, HUD only, `app.ready()` resolves, the page sets its ready flag, and the console shows only the browser's "Failed to load resource". Cause: the mount awaits every `model()` node with one `Promise.all` (`compiler/renderer.ts` and `compiler/compileScene.ts`); one rejection fails the production mount, and in non-strict mode the error goes only to `app.diagnostics().errors` while `app.ready()` still resolves.

## Fix in this lane

A non-strict mount failure now prints `[aura3d] RENDERER_MOUNT_FAILED: ...` to the console (says nothing will draw, points at `app.diagnostics().errors` and `strict: true`); unit test `tests/unit/render-fix/mount-failure-message.test.ts`.

## Not changed (needs a decision)

Skipping a failed model and drawing the rest (or substituting a placeholder) would keep a 404 from blanking a game, but game code that looks up that model's runtime node would then fail instead; it needs a placeholder-node design. Code released as 4.1.3 has the same behaviour.
