# Legacy AI Runtime Archive

This directory preserves the pre-agent library legacy runtime workflow prompt-runtime work that was removed
from the active Aura3D agent library workspace after the `pre-cutover-2026-05-27` tag.

The archived work includes provider proxy experiments, prompt-to-scene routes,
`AuraSceneIR` authoring/runtime surfaces, cinematic prompt lab templates, and
their old tests/tools/reports. It is intentionally outside the active
`packages/*`, route registry, template registry, public docs, and agent library release
gate.

agent library uses source-code workflow:

- coding agents write TypeScript/JavaScript app code
- users bring their own assets
- Aura3D provides the stable API, asset deployment pipeline, templates,
  diagnostics, docs, and static deployment checks

Do not import archived files from active packages. Port code back only through a
source-code workflow task and rename it around its new role.
