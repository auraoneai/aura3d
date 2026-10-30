# Look overrides, HDRI ids and runtime light, environment, fog and post (4.7.0)

Requires `@aura3d/engine` 4.7.0 or later. On 4.6.x the override keys below are
rejected and the runtime setters do not exist: check the installed version
first and keep `environments.hdri({ texture })` with an admitted texture there.

## Look overrides

A look stays the starting point (`looks.preset(<id>, overrides)`); the
overrides retune it instead of replacing it with hand-built nodes. Every number
is clamped to the range in the comment.

```ts
looks.preset("golden-hour", {
  sun: { azimuthDeg: 250, elevationDeg: 18 },          // existing keys: sun, exposureEv [-2,2], fogDensityScale [0,3], accent, background
  background: "look",                                   // or a colour: the HDRI then lights only (background: false)
  hdri: "venice_sunset",                                // AuraHdriId, or a texture-typed asset ref
  environmentIntensity: 0.8,                            // [0,4]
  environmentRotationDeg: 120,                          // wraps into [0,360)
  key: { color: "#ffd2a1", intensity: 3.2, shadow: { mapSize: 2048 } }, // intensity [0,20]
  rim: { color: "#9fc4ff", intensity: 1.5, azimuthDeg: 70 },           // or rim: false to drop the look's rim light
  fog: { color: "#c9a27e", near: 30, far: 420 },        // or height: AuraHeightFogSpec for height fog
  grade: { contrast: 1.08, saturation: 1.1, temperature: 0.15, tint: -0.05, lut: assets.duskLut }, // temperature/tint [-1,1]
  post: "cinematic-film"                                // an AuraPostPresetId, or { bloom: false | AuraBloomOptions }
});
```

- An unknown `hdri` id throws `LOOK_HDRI_UNKNOWN:<id>`; an unknown `post` id
  throws `LOOK_POST_UNKNOWN:<id>`.
- The look's grade now emits `temperature` and `tint`, and the look's post
  preset id becomes the output preset (a `post` override replaces it).
- `background` set to a colour keeps the HDRI as light only, so a studio HDRI
  no longer paints itself as the sky behind a coloured backdrop.
- The look's emitted nodes are named `look hdri <id>_1k`, `look rim light`,
  `look fog` and `look color grade`; find them there when a capture disagrees.

## HDRI catalogue

The 17 `AuraHdriId` values, each served as a 1k Radiance file at
`/hdri/<id>_1k.hdr` (`lookHdriIds` lists them, `lookHdriUrl` builds the URL;
credits in `public/hdri/ATTRIBUTION.md`):

| Mood | Ids |
|---|---|
| Day sky | `autumn_field_puresky`, `kloppenheim_06_puresky`, `kloppenheim_02`, `outdoor-midday` |
| Sunrise and sunset | `belfast_sunset_puresky`, `industrial_sunset_puresky`, `spruit_sunrise`, `venice_sunset`, `sunset-dramatic` |
| Night and space | `rooftop_night`, `cobblestone_street_night`, `deep_space_starfield` |
| Interior and studio | `studio_small_08`, `hangar_interior`, `warm_bar`, `museum_of_history`, `indoor-workshop` |

Live games must not share a primary visible HDRI (`background: "hdri"` in the
game's art direction): the `look-identity` game-check compares the file hashes.
A different file for IBL only is fine if rotation and intensity differ.

## Runtime light, environment and fog

```ts
// a light node's runtime handle: blends over transitionSeconds
app.nodes.require("key light").setLight({ color: "#ffb36b", intensity: 2.4, direction: [-0.4, -0.6, -0.7] }, { transitionSeconds: 1.5 });
// swap the image-based light without remounting the scene
app.lighting.setEnvironment(assets.duskSky, { intensity: 0.7, background: true, rotationDeg: 90, crossfadeSeconds: 2 });
app.lighting.setEnvironmentRotation(Math.PI / 2);
// overrideSceneFog applies the change to a scene that declares its own fog node
app.atmosphere.setFog({ color: "#7d8fa6", near: 20, far: 260 }, { transitionSeconds: 3, overrideSceneFog: true });
```

- `setLight` patches `color`, `intensity`, `power`, `distance`, `direction`
  and `position`; light nodes follow `setPosition` and `setVisible` every frame
  (a hidden light drops its shadow map too).
- `app.diagnostics().lighting` reports `shadows`, `punctualLights` and
  `localShadowLights`. Local lights cast shadows besides the sun up to the
  quality tier's cap (low 0, medium 1, high 2, ultra 4); read the count on a
  capture before claiming a second shadow.

## Runtime post

```ts
app.post.setEffect("color-grade", { temperature: 0.2, contrast: 1.1 });
app.post.setEffect("bloom", { intensity: 0.6, threshold: 1.2 });
app.post.setEffectEnabled("depth-of-field", false);
```

- Effect names: `bloom`, `color-grade`, `depth-of-field`, `motion-blur`,
  `chromatic-aberration`, `volumetric-fog`, `vignette`.
- A colour grade takes a `.cube` LUT admitted as a LUT asset
  (`assets add <file.cube> --type lut` on 4.7.0), plus `temperature`, `tint`,
  `lift`, `gamma`, `gain`, `shadows`, `midtones` and `highlights`.
- Depth of field takes `tiltShift: { bandCenter, bandWidth, angleDeg }`;
  volumetric fog takes `godRayDensity` (0.05 to 1, independent of the scene
  fog); a material takes `bloom` (0 to 2, default 1) for selective bloom.

Every look number you report is "software WebGL2" until a real-GPU run exists.
Judge a change on a remote capture with per-region stats, not mean luma alone
(lesson R21 in `docs/agents/lessons-learned.md`).
