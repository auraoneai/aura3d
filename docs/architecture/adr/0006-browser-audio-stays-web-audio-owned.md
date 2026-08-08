# ADR 0006: Browser audio stays Web Audio owned

- **Date:** 2026-08-08
- **Status:** accepted
- **Workstream:** WS-2.3

## The four R11 questions

1. **Does Three.js already solve this?** Only partially. Three.js wraps Web
   Audio for listener/source placement; it does not own Aura3D cue semantics,
   typed assets, mixer evidence, or application lifecycle.
2. **Does another mature ecosystem library solve this?** Howler provides strong
   playback, sprites, fades, codec selection, and unlock handling, but its
   current 2.2.4 release would introduce another context/cache/playback owner
   beside Aura3D's required graph, spatial, effects, timeline, and typed-asset
   semantics.
3. **Does this create lasting differentiation for Aura3D?** Native playback
   does not. Typed asset validation, semantic cues, scene linkage, lifecycle,
   and evidence do.
4. **Does this belong above or below the public API?** The browser standard is
   below one thin `@aura3d/audio` API; game cues delegate into that package.

## Decision

Keep the browser Web Audio API as the sole playback/context owner. Do not add
Howler. `AudioContextManager` is the only code allowed to construct a context.
`AudioFileManager`, `AudioSource`, `AudioBus`, `AudioMixer`, and spatial/effect
wrappers remain thin lifecycle and validation adapters. `GameAudio` owns only
semantic cue mapping and evidence, delegating context creation, asset fetching,
caching, decoding, buses, gain, sources, and teardown to `@aura3d/audio`.

## Consequences

- No second singleton, unlock handler, cache, or playback graph is introduced.
- Fades, sprites, pause/resume, looping, spatial audio, typed assets, codec
  candidate selection, and disposal remain directly testable.
- The retained fixture/analysis modules do not prove runtime DSP and must move
  out of the published runtime under WS-2.6.

## Evidence

`tests/reports/audio-backend-bakeoff/report.json`, Chrome audio browser proof,
WebKit audio browser proof, and `tests/unit/audio/audio-context-ownership.test.ts`.
