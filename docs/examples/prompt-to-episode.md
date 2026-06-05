# Prompt to Episode

Prompt-to-episode production uses AuraVoice for audio/timing and Aura3D for animation/rendering.

## Pipeline

1. Prompt creates episode intent.
2. AuraVoice generates script, voiceover, captions, visemes, stems, and timing artifacts.
3. Aura3D consumes those artifacts through the AuraVoice bridge.
4. Aura3D renders typed assets, primitive fallbacks, character performance, camera cuts, captions, and effects.
5. The render queue captures deterministic screenshots and video frames.
6. Evidence proves timing, captions, visemes, assets, accessibility, and route health.

## Publish blockers

- Missing audio
- Missing captions
- Missing visemes
- Missing dialogue audio stems
- Unknown contract version
- Shot-id drift during dubbing
- Timing drift over one frame at 30 fps
- Missing deterministic screenshot evidence
- Missing render/export package hashes for video, thumbnail, captions, timeline, audio stems, and evidence JSON
