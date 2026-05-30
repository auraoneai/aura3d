# Material Lab (three.js r180)

Five spheres showcasing visually distinct PBR materials — **metal, glass,
rubber, emissive, and clearcoat** — under studio lighting with an
image-based environment map and orbit controls.

## What it shows

- **5 spheres**, one per material, laid out in a row.
- **Metal** — `MeshStandardMaterial`, `metalness: 1`, low roughness → sharp
  environment reflections.
- **Glass** — `MeshPhysicalMaterial` with `transmission: 1`, IOR 1.5, tinted
  attenuation → refracts the environment.
- **Rubber** — `MeshStandardMaterial`, non-metal, high roughness → matte, soft.
- **Emissive** — emissive `MeshStandardMaterial` with bloom postprocessing → glows.
- **Clearcoat** — `MeshPhysicalMaterial` with `clearcoat: 1` over a colored,
  rougher base → a sharp glossy coat on top of a satin body.
- **Studio lighting** — a soft-shadow key spotlight + fill + rim lights over a
  floor that receives soft shadows.
- **Environment** — `RoomEnvironment` prefiltered with `PMREMGenerator` provides
  image-based lighting and reflections (no external HDR asset required).
- **OrbitControls** — drag to orbit, scroll to zoom (damped).

## Build command

```bash
npm install
npm run build
```

Output is written to `dist/`.

## Run command

Development server:

```bash
npm run dev
```

Or preview the production build:

```bash
npm run build && npm run preview
```

Then open the printed local URL in a browser.

## Assumptions

- Built procedurally — no external assets are loaded. The environment map is
  generated at runtime from the built-in `RoomEnvironment`, satisfying the
  "no assets" constraint while still providing real image-based reflections.
- Targets a modern WebGL2-capable browser (three.js r180 default).
- A gentle `UnrealBloomPass` (high threshold) is used so only the emissive
  sphere blooms; all other materials render through unaffected.
- Device pixel ratio is capped at 2 for performance.
