# @aura3d/audio

`@aura3d/audio` owns browser audio-context lifecycle control, clips, sources, buses, mixing, listener transforms, spatial attenuation, effects, and scene audio bridges.

## Public API

- `AudioSystem`, `AudioContextManager`: locked/unlocked lifecycle, disposal, and browser context abstraction.
- `AudioClip`, `AudioSource`: clip buffers, playback state, gain, looping, start/stop controls, and source disposal.
- `AudioBus`, `AudioMixer`: grouped routing and gain mixing.
- `AudioListener`, `SpatialAudio`: listener transforms, distance attenuation, pan data, and spatial parameters.
- `SceneAudioBridge`: scene-node to audio-source transform synchronization.
- `FilterEffect`, `ReverbEffect`, `AudioEffect`: effect contracts for filter and reverb-style processing.

## Verification

Audio lifecycle, source state, bus/mixer behavior, spatial calculations, scene bridges, and browser unlock/playback behavior are covered by `tests/unit/workstream5-input-audio-scripting-editor.test.ts`, `tests/unit/workstream5-runtime.test.ts`, and `tests/browser/audio-browser.spec.ts`. Export and import consistency is covered by `pnpm verify:exports` and `pnpm verify:imports`.
