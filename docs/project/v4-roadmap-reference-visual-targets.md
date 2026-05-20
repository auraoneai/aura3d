# V4 Reference Visual Targets

> Historical note: This V4 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


V4 is not a demo pass. It is a product build toward G3D Visual Engine V4: an installable SDK/runtime/toolchain for developers building high-quality browser 3D applications.

These targets define what the renderer, asset pipeline, workflow APIs, apps, templates, screenshots, and Three.js comparisons must prove. This document is not visual completion. Generated local fixtures cannot satisfy flagship proof.

## Universal Rules

- Apps, examples, screenshots, and reports are proof artifacts. The product is the installable `@galileo3d/engine` SDK, public `createG3DApp` runtime, workflow APIs, `create-g3d` scaffolder, Vite templates, diagnostics, docs, and external consumer build path.
- Every flagship scene must be reproducible from public APIs only.
- Every flagship scene must have a same-scene Three.js comparison.
- Every release screenshot must identify the asset source, license, environment, renderer backend, resolution, warnings, draw calls, and source file path.
- Every real asset must have provenance and license metadata.
- Bootstrap assets under `fixtures/assets/v4/` can drive early wiring and regression checks, but they cannot count as product-quality flagship evidence.
- A generated primitive-only scene cannot satisfy flagship proof.

## Premium Product Configurator

Product surface:

- `apps/product-studio-pro`
- `examples/product-configurator-v4`
- `templates/v4-product-viewer`
- `workflows.productConfigurator`
- `createG3DApp`
- same-scene Three.js benchmark

Visual target:

The scene must look like a commercial catalog/product configurator: real glTF/GLB product mesh hierarchy, HDR studio lighting, environment reflections, contact shadows, turntable camera, and variant controls. The product cannot be a primitive approximation or generated blocky stand-in.

Required proof:

- G3D screenshot from the app.
- G3D screenshot from the example.
- G3D screenshot from a fresh external template app after production build/static preview.
- Three.js screenshot of the same scene.
- Diff image and parity report.
- Public API reproduction test using `createG3DApp` and `workflows.productConfigurator`.
- Diagnostics report covering textures, materials, variants, draw calls, memory estimate, and unsupported features.

Unacceptable output:

- Single object on a flat background with no real material variation.
- Procedural boxes/cylinders posing as a product.
- Local monorepo imports that cannot work from a packed package.
- Screenshot-only proof without external install/build proof.

## Material Studio Pro

Product surface:

- `apps/material-studio-pro`
- `examples/material-studio-v4`
- `fixtures/v4/materials/material-library.json`
- physical material API
- same-scene Three.js material matrix benchmark

Visual target:

The material matrix must make physically different surfaces read differently to a human. Chrome, brushed metal, gold, painted metal, matte plastic, glossy plastic, rubber, glass/transmission, clearcoat car paint, fabric/sheen, emissive material, and textured ceramic/stone must be distinguishable under HDR/IBL.

Required proof:

- G3D material matrix screenshot.
- Three.js material matrix screenshot.
- HDR/IBL debug view screenshots.
- Base color, normal, roughness, metallic, emissive, diffuse IBL, specular IBL, and tone-mapped output debug views.
- Material diagnostics for unsupported or bounded extensions.
- Documentation for each supported material feature and limitation.

Unacceptable output:

- Material balls that differ only by base color.
- Bloom/vignette hiding poor lighting.
- No color-space evidence.
- Extension names without visible behavior or diagnostics.

## HDR Interior Scene

Product surface:

- `apps/scene-studio-pro`
- `examples/interior-scene-v4`
- interior/architecture workflow APIs
- same-scene Three.js benchmark

Visual target:

The scene must feel like a real interior/gallery/retail space: multiple assets, walls/floor, believable camera framing, texture variety, HDR exposure, shadows that anchor objects, and both environment and punctual lighting.

Required proof:

- G3D interior screenshot.
- Three.js same-scene screenshot.
- Shadow debug screenshot.
- Lighting-only screenshot.
- Postprocess off/on comparison.
- Stats report with object count, draw calls, texture count, memory estimate, and warnings.

Unacceptable output:

- Empty room made of simple planes without production assets.
- No shadows or contact grounding.
- One product dropped into a blank test scene.
- Only UI polish around low-quality rendering.

## Complex glTF Asset Review

Product surface:

- `apps/asset-studio-pro`
- `examples/asset-gallery-v4`
- `inspectAsset`
- `createAssetDiagnostics`
- `createCompatibilityReport`
- production glTF corpus tooling

Visual target:

The asset review workflow must load real glTF/GLB assets with materials and textures intact. It must show useful diagnostics instead of silent fallbacks. The corpus must include embedded textures, external textures, GLB, compression paths where available, material variants, texture transforms, cameras, lights, animations, skins, morphs, alpha materials, and material extension coverage where supported.

Required proof:

- 25+ asset corpus manifest with license/provenance.
- 12+ rendered asset screenshots.
- At least 5 assets with advanced material feature evidence.
- At least 3 animation/skin/morph evidence screenshots or reports.
- Diagnostics for unsupported extensions and fallback reasons.
- Browser corpus visual runner.

Unacceptable output:

- Fallback primitives in place of failed loads.
- Compatibility claims without visible screenshots.
- Missing license/provenance fields.
- Treating importer success as renderer quality proof.

## Animated Character Preview

Product surface:

- `apps/animation-studio-pro`
- `examples/character-viewer-v4`
- character/animation workflow APIs
- timeline and scrub UI

Visual target:

The character viewer must show a real skinned or morph animated character/creature/avatar with lighting and material quality matching the rest of V4. Timeline controls must play and scrub the animation.

Required proof:

- Default pose screenshot.
- Playing animation screenshot.
- Scrubbed timeline screenshot.
- Skin/morph diagnostics.
- Animation clip metadata.
- Public API reproduction test.

Unacceptable output:

- Generated skeleton-only fixture counted as final proof.
- Animation data detached from visible mesh/material output.
- Timeline UI without verified playback.

## Interactive Showcase Pro

Product surface:

- `apps/interactive-showcase-pro`
- `examples/interactive-showcase-v4`
- public interaction APIs
- camera/select/variant/lighting controls

Visual target:

The interactive scene must remain visually credible while interactive. It must include camera controls plus at least one meaningful interaction such as selection, variant change, animation trigger, or lighting change.

Required proof:

- Initial screenshot.
- Post-interaction screenshot.
- Runtime stability report.
- Interaction test proving state changes and canvas output changes.
- Three.js comparison for a comparable interactive scene.

Unacceptable output:

- Static screenshot pretending to be interactivity.
- Buttons that do not affect scene state.
- Low-quality rendering hidden by UI chrome.

## Environment Targets

The required environments are:

- `studio-softbox-hdr`
- `gallery-neutral-hdr`
- `outdoor-overcast-hdr`
- `warehouse-industrial-hdr`
- `night-neon-hdr`

Before visual acceptance, each environment must have a real file path, license, provenance, resolution, dynamic range description, and checksum. Generated local environment maps may test plumbing only.

## Material Targets

The required material set is:

- chrome
- brushed metal
- gold
- painted metal
- matte plastic
- glossy plastic
- rubber
- glass/transmission
- clearcoat car paint
- fabric/sheen
- emissive
- textured ceramic/stone

Before visual acceptance, each material must have a G3D screenshot, Three.js comparison screenshot, debug-view evidence, and an explicit support status.

## Hard Stop

V4 remains partial progress until `pnpm v4:release` passes. Passing `pnpm v4:fixtures` only proves that the V4 asset and visual target plan is structured enough to start building HDR/color-management next.
