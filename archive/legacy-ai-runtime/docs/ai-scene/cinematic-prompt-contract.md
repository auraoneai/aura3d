# Cinematic Prompt Contract

Aura3D cinematic previs treats natural-language scene requests as cinematic direction, not as loose text
to be painted by the browser. Provider output must normalize into structured scene intent
before it reaches the renderer.

The contract requires:

- scene type, mood, environment, hero subject, supporting props, lighting, camera, VFX, materials, and timeline
- concrete camera movement, shot duration, framing, and target tracking when prompted
- material descriptors for hero objects and ground surfaces
- asset requirements with semantic tags, fallback priority, source, and license metadata
- VFX descriptors for rain, fog, dust, sparks, glow, water, fire, or smoke when prompted
- backend preference and quality target
- negative constraints that block final-film-quality or provider-key-in-browser claims

Public demos can run in fixture mode, mock mode, or live-provider mode. Fixture and mock mode
must be deterministic and no-key. Live-provider mode must go through the server-side
`@aura3d/ai-scene-server` proxy so raw OpenAI, Anthropic, Gemini, or local-model credentials
never enter browser bundles.

The north-star prompt uses this contract to resolve the Robot Expressive GLB, a renderer-owned
glowing flower prop, procedural rainy-neon-alley geometry, wet pavement material, neon practical
lights, rain/fog/glow VFX evidence, and a 12-second dolly-style timeline.
