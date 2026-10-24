# Apex Overdrive art pass (2026-10-23)

Frames: `art-after/` (same ten scripted states as `native/`, plus `02b-cruise-no-shield`), contact sheet `compare-native-vs-art.jpg` (left: native sim build before the pass, right: after), metrics `art-metrics.json` (our own luma/RGB histogram JSD, gradient edge density, mean luma; software WebGL2, 1280x720, remote run `apex-art-4`, ACR run `ch1d6`).

What changed (apps/showcase-roadster-rush, V1 / the index game; V2 keeps its own scene):
- **Shield**: the solid emissive ellipsoid that hid the car is now a thin fresnel shell (`src/art/shield.ts`, additive, no depth write): only the rim glows, it fades in, and flickers over its last 1.5 s so the timer is readable. The capture script keeps a shield active in most frames (it injects shield pickups every few seconds), which is why it shows so often; `02b-cruise-no-shield` has none.
- **Vehicles**: the hero roadster and nine traffic types are Meshy models (`src/assets/meshy`, 16.7 MB, 300 credits), baked to the game's orientation; `?models=0` falls back to the original showcase models.
- **Exposure**: the white box trucks were blown out (white base colour + sun 2.35 + bloom threshold 0.78). Sun is 1.9, ambient 0.5, hemisphere 0.7, bloom threshold 0.9, and the trucks are cream/blue models.
- **Shadows**: directional sun shadows (2 cascades, 90 m) now work after the receiver-depth clamp (a952d9d27); only vehicles, barriers, sound walls, gantry steel and light poles cast, every small/emissive primitive has `castShadow: false`.
- **Sky**: one shaded dome (`src/art/sky.ts`): gradient, lit clouds, sun disc and corona, horizon haze, city glow, stars and a dim moon at night, driven by the time-of-day uniforms; the outer ground melts into the horizon colour (`src/art/ground.ts`).
- **Draw calls**: about 1,400 before (earlier agent's reading of `game.getState().drawCalls`) to 788-899 after (same probe, remote run).

Still weak: Meshy textures are smeary up close (box truck and bus at 1024 px show crumpled-paper normals); the roadside houses and gantries are the old low-poly props; scene lighting does not change with time of day (only the sky does); the sun disc is a soft low-contrast circle; ~880 draw calls is still heavy; no instancing of lane dashes/poles (they move per frame as nodes); V2 is untouched; not tested on a real GPU.
