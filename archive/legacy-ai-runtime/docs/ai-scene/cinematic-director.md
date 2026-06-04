# Cinematic Director

Version: 0.1.0

The cinematic director translates film language into runtime plans. It does not generate final film quality; it creates deterministic realtime previs direction for Aura3D cameras, lights, timeline cues, materials, and VFX.

## Inputs

- Scene intent and mood from `AuraSceneIR`.
- Object and character layout.
- Quality target.
- Runtime capability report.
- Optional user constraints such as duration, aspect ratio, and camera style.

## Outputs

- camera plan;
- lighting plan;
- shot timeline;
- color/look preset;
- VFX plan;
- unsupported-direction diagnostics.

## Film Language Mapping

Examples:

| Prompt language | Runtime plan |
|---|---|
| establishing shot | wide camera, high framing, longer focal distance |
| close-up | tight target framing, lower depth-of-field threshold where supported |
| slow push-in | camera dolly toward target over shot duration |
| handheld | subtle procedural camera jitter, bounded amplitude |
| rim light | directional or spot light behind subject edge |
| warm sunrise | warm key light plus low-angle environment color |
| foggy | fog or particle approximation with density diagnostics |
| emotional | slower timeline, subject-centered framing, softer contrast |

## Shot Timeline

Each shot should include:

- stable shot ID;
- start and end time;
- camera ID;
- subject ID;
- movement type;
- lens/framing intent;
- transition rule;
- diagnostics.

## Copyright And Style Names

Public docs and routes should avoid named copyrighted studio or artist styles. Use descriptive terms such as `soft cinematic`, `high-contrast noir`, `warm sunrise`, or `neon rain` instead.

## Defaults

When a prompt omits camera direction, the director should produce a safe default:

- one establishing shot;
- one hero camera;
- readable key/fill/rim lighting;
- scene duration from the quality target or route default;
- no unsupported postprocess unless diagnostics declare it.
