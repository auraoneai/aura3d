# Look recipes — 13 genre rows

One row per genre. Use the row's look id verbatim, take its camera/framing/palette
as the starting point, then iterate in the look-dev loop. Palettes: 3 base tones +
1 accent, no pure primaries. Key = sun position `elevation°`/`azimuth°`. Subject %
is the subject's share of frame height.

| Genre | Look | Camera rig + fov | Subject % | Key | Palette | Atmosphere | Post | VFX | Reference frames |
|---|---|---|---|---|---|---|---|---|---|
| platformer | `outdoor-day` | `follow2d`, fov 50 | 18–25 | 48° / 35° (3/4 front) | saturated greens, sky blue, warm wood + coin gold | fog 0.0025 | `daylight-outdoor` | coin sparkle, land dust | `webgl_animation_skinning_blending` |
| racing | `golden-hour` | `chase`, fov 60 | 15–25 | 12° / 35° (low sun) | warm asphalt, burnt orange, charcoal + headlight amber | fog 30–180 m | `cinematic-film` | brake glow, speed dust | `webgl_materials_car` |
| fighting | `arena-fight` | `fighting`, fov 45 | 20–30 (pair) | top spot 60° / 0° | arena dark, rope colour, crowd shadow + spotlight rim | haze cone | `arena-fight` | hit sparks, knockback flash | `webgl_animation_skinning_morph` |
| arena shooter | `space` | `topDown` 60°, fov 55 | 10–15 (field) | rim 70° / 210° | deep space blue, graphite, teal + laser magenta | none (space background exception) | `space` | model muzzle flash, shield segments | `webgl_shaders_sky` |
| sports/table | `interior-industrial` | broadcast `topDown` 70°, fov 40 | 25–40 (table) | flood 55° / 45° | turf green, line white, crowd dark + ball accent | indoor haze | `arena-fight` | scoreboard pulse | `webgl_materials_lightmap` |
| product | `product-studio` | `orbit` autoframe, fov 35 | 45–70 | softbox 45° / 30° | neutral grey, white, metal + one brand accent | none | `product-studio` | sweep highlight on turn | `webgl_materials_video` |
| character | `character-showcase` | `orbit`, fov 40 | 50–70 | 3-point 50° / 35° | costume-driven neutrals + rim pick | light room haze | `product-studio` | cloth/hair motion settle | `webgl_animation_skinning_blending` |
| outdoor environment | `overcast` | `establishing` wide, fov 55 | vista | 50° / 40° | muted green, slate, fog blue + wildflower accent | fog 0.004 | `daylight-outdoor` | wind grass, drifting cloud | `webgl_lights_physical` |
| interior | `interior-warm` | medium `orbit`, fov 45 | 30–50 (anchor) | window 35° / 60° | warm wood, cream wall, book spines + plant green | dust shafts | `cinematic-film` | window bounce | `webgl_lights_spotlight` |
| night city | `night-city` | low tele, fov 35 | 20–35 (street) | neon rim 25° / 120° | sodium orange, neon sign, dark asphalt + cyan accent | fog 15–90 m, wet street | `neon-night` | sign flicker, drizzle sheen | `webgl_lights_spotlights` |
| space | `space` | `orbit` wide, fov 60 | 30–50 (planet) | star key 30° / 180° | void blue, planet limb, star field + aurora accent | none (background exception) | `space` | engine trail, planet rotation | `webgl_shaders_sky` |
| underwater | `underwater` | `follow`, fov 50 | 20–40 (creature) | godray 70° / 10° | deep blue, teal, kelp green + coral accent | scatter 0.03, caustics | `underwater` | bubble stream, silt drift | `webgl_water` |
| cinematic | `polar-night` | `establishing` dolly, fov 35 | 25–40 | moon 20° / 300° | aurora green, snow blue, night + lantern amber | snow mist 0.006 | `cinematic-film` | aurora drift, breath fog | `webgl_animation_cloth` |

Notes:

- `orbital`/`follow`/`follow2d`/`fighting`/`shoulder`/`topDown`/`chase`/`establishing`
  are camera-rig names used by the template gate; wire them through the camera
  rig spec API of the current engine version, never through evidence fields.
- "background exception" rows skip the sky-fill hard check; the look's own
  background supplies the void.
- VFX rows name models/practicals; no CSS/DOM overlays and no primitive sprite
  cards faking rain, reflections or splashes.
