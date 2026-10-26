# Impact presets and particle size: `app.effects`

`app.effects` has a fixed set of named impact presets: `spark`, `dust`, `debris`, `ring`, `streak`, `pickup`, `explosion-small`, `muzzle`, `splash`, `bubble`, `impact-flash`, `super-flash`, `impact-decal` and `aura-burst`. Each preset carries its own speed, life, size, spread, gravity and colour.

## Contract

- `app.effects.burst(kind, position, { count?, speed?, scale?, color?, seed? })` fires a one-shot. It spawns `count` particles once and they die at the preset's life (spark 0.25 to 0.6 s, dust 0.8 to 1.6 s, aura-burst 0.5 to 1.1 s).
- `app.effects.spawn("kind", position)` with a **name** is the same one-shot. It is not a loop. Only an authored `AuraVfxEffectSpec` object passed to `spawn` is a looping effect, and you stop it with the returned handle's `stop()`.
- Size is in **world metres** and does not depend on the device pixel ratio or the canvas backing size. A 0.07 m spark is the same fraction of the frame at DPR 1 and DPR 2. `scale` multiplies the preset size.
- Game effects (`createGameEffects`, `game.effects`) forward through `burst`, with `camera: false` so the preset shake does not stack on the game's own juice.

## `points()` nodes

`size` is in CSS pixels. With `sizeAttenuation: false` the shader point size is `size · pixelRatio`. With attenuation (the default) it is `size · 0.5 · render-target height (device px) ÷ view depth`, so the node passes the bare `size` and does not apply the pixel ratio a second time.

## Verify with frames at DPR 1 and 2

After any change to presets, particles or point sizing, read frames at `deviceScaleFactor` 1 and 2 (the remote runner's `partfix` specs: `tests/browser/partfix.spec.ts` against a deployed origin, `tests/browser/partfix-local.spec.ts` against this checkout) and check the live particle count returns to zero after the preset's life (`tests/qr/prd07/unit/preset-lifetime.test.ts`).
