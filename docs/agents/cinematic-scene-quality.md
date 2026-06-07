# Cinematic Scene Quality

Version: 1.1.0

Use this guide when an AI coding agent builds a cinematic Aura3D scene or edits the `cinematic-scene` template.

## Target Experience

A cinematic Aura3D scene should feel like realtime previs in the browser:

- asset-backed or high-quality procedural scene content;
- clear hero subject;
- visible environment or stage;
- intentional camera framing;
- camera motion when the prompt asks for a shot;
- lighting with key, fill, rim, practical, or environment intent;
- material contrast such as metal, glass, rubber, emissive, wet, matte, or clearcoat when relevant;
- atmosphere such as fog, particles, bloom, glow, depth haze, or color grade when the API path supports it;
- UI controls only when they help the scene, not as the first visual impression.

## Quality Ladder

Use this ladder to decide whether a cinematic scene is ready for a public demo or template screenshot.

| Level | Name | Meaning | Public demo use |
| --- | --- | --- | --- |
| L0 | Schema or text proof | The idea exists only as prompt text, JSON, or comments. | No |
| L1 | Primitive sketch | The scene renders simple boxes, labels, and symbolic objects. | Internal only |
| L2 | Asset-backed draft | The scene has some real assets but still depends on obvious draft artifacts. | Only if labeled as a draft |
| L3 | Realtime cinematic scene | Assets or procedural geometry, lighting, camera, material contrast, and atmosphere read visually. | Yes |
| L4 | Production handoff | The scene includes exportable source, assets, diagnostics, screenshots, and deployment checks. | Yes |

Aim for L3 before using a cinematic route as product proof.

## North-Star Cinematic Prompt Pattern

For a prompt like:

```text
Create a rainy neon alley at night. A lonely robot finds a glowing flower.
Make it emotional and cinematic with wet pavement, fog, rain particles,
blue rim light, neon reflections, and a slow 12-second dolly-in.
```

The scene should visibly include:

- a robot or character asset, or a clearly authored procedural substitute;
- a glowing flower or hero prop in the 3D scene;
- alley, street, studio, or stage geometry with depth and occlusion;
- wet or reflective ground material when requested;
- practical neon or emissive scene geometry when requested;
- fog, rain, particles, bloom, glow, or a bounded approximation when requested;
- a camera plan such as dolly-in, orbit, close-up, establishing shot, or reveal;
- timeline or animation behavior when the prompt asks for a shot.

Do not rely on DOM overlays to satisfy required hero props, environment, lighting, or VFX in public cinematic examples. DOM UI can supplement the route, but the scene itself must carry the visual idea.

## Camera And Shot Language

Translate film-language prompts into concrete camera behavior:

- `dolly-in`: camera moves toward the subject or stage target.
- `orbit`: camera circles the subject or product.
- `pan` or `tilt`: camera rotates while staying anchored.
- `establishing shot`: wide view with environment context.
- `close-up`: subject fills the frame.
- `hero reveal`: subject enters view through camera motion, lighting, or occluder movement.
- `over-shoulder`: camera frames from behind or beside a subject toward a target.
- `low angle`: camera sits below the subject eye line.

If a prompt names shot duration, represent it in timeline code or route UI. Do not describe a static product orbit as a cinematic shot unless the scene has intentional shot framing or motion.

## Material And Lighting Checklist

Before accepting a cinematic scene, check that the visual result contains at least some of the requested contrast:

- key, fill, rim, practical, or environment light;
- shadow or contact grounding;
- readable subject silhouette;
- material differences between hero object, ground, glass, metal, emissive, or matte surfaces;
- atmosphere that does not wash the image into a flat rectangle;
- camera framing that keeps the hero object readable.

## Aura3D advantage

Allowed:

- "cinematic WebGL scene"
- "realtime previs-style browser scene"
- "camera motion, lighting, atmosphere, and typed assets"
- "agent-written TypeScript scene"

Blocked unless separate evidence gates explicitly prove the exact claim:

- final film quality;
- Pixar-quality output;
- provider-backed prompt-to-scene runtime;
- generated production-ready 3D assets from scratch;
- replacement for Maya, Houdini, Blender, Unreal, Unity, or RenderMan.

## Preferred Starting Points

Use these first:

- `create-aura3d --template cinematic-scene`
- `sceneKits.materialLab()`
- `sceneKits.neonTunnel()`
- `sceneKits.cityBlock({ timeOfDay: "night" })`
- `sceneKits.productViewer(assets.product)` when a real product GLB exists
- public `camera`, `lights`, `material`, `effects`, `timeline`, and `interactions` helpers from `@aura3d/engine`

Keep the output as editable TypeScript. If the scene cannot be made visually credible with current public APIs, label it as future work instead of presenting it as a production-quality cinematic demo.
