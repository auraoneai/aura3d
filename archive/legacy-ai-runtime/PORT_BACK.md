# source-code workflow Port-Back List

Only these categories may be ported from this archive into agent library:

- renderer lifecycle helpers that support `createAuraApp`
- GLB/glTF metadata extraction for the asset CLI
- camera, light, material, animation, interaction, VFX, and timeline helpers
  that operate from source code, not provider JSON
- diagnostics snapshots, screenshot helpers, and route health utilities
- small generated/demo assets that are necessary for tests or templates

Rules for porting back:

- rename the code around the source-code workflow role before exposing it publicly
- keep provider proxy, prompt-to-IR compilation, `AuraSceneIR`, prompt fidelity
  gates, and cinematic director APIs archived
- add docs and compile tests for any public export
- keep templates and examples focused on agent-written source code and user
  assets
