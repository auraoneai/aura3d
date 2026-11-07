# Metal and glass that must read

Use `material.studioMetal({ color, roughness })` and `material.studioGlass({ tint, ior, thickness })` for product shots,
trophies, spheres and anything where chrome, steel, gold or clear glass is the subject. They carry sensible reflection
settings (full metalness, no clearcoat, `envMapIntensity` 1 for metal and 1.25 for glass, absorption tint and
`thickness` for glass), wrap `material.metal` and `material.glass`, and every option still overrides.

Why they exist: chrome and glass only show what they reflect or refract. A near-uniform probe (`environments.neutral()`,
plain `environments.studio()`) plus a pale backdrop leaves both invisible, and raising `envMapIntensity` only brightens
the same flat reflection. Clear glass additionally needs physical transmission, which is off unless
`A3D_QR_MATERIALS_TRANSMISSION` is on; without it the glass draws as an opaque white ball and the console prints
`TRANSMISSION_DEGRADED`.

What the helpers do automatically:

- A scene that uses either helper and authors no `environments.*` node or look binds the `softbox` environment itself.
  An authored environment or look always wins.
- `createAuraApp` turns physical transmission on for a scene that uses `material.studioGlass`. A source that sets the
  flag explicitly (`?a3d-qr=-materials.transmission`, `qualityRebuild.flags`) wins. It is decided from the scene given
  to `createAuraApp`; a later `setScene` does not re-decide it.

To choose it explicitly: `environments.studio({ preset: "softbox" })`, or `environments.preset("softbox")` (background on).
`environments.studio()` and `environments.neutral()` without the option render exactly as before.

The `softbox` probe is a structured studio: an overhead softbox, a tall key softbox, two strip lights, a windowed fill
with mullions and two dark flags over a gradient room, at the neutral probe's mean brightness so diffuse lighting
matches. It is embedded in the package (about 230 KB of base64 in its own lazy chunk), so no `/aura-environments` fetch
and no copied file; `public/aura-environments/softbox.*` (about 0.5 MiB) ships the same bytes. Regenerate with
`node_modules/.bin/tsx tools/environments/bake-softbox.ts`.

Glass shows the opaque scene behind it, so put it in front of a mid-tone or graded backdrop, not plain white. The helpers
cannot add a backdrop for you.
