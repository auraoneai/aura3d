# Aura Slam impact sounds

`racket.wav` and `bounce.wav` (48 kHz, mono, 16-bit, 0.9 s each: three separately recorded 0.3 s takes per file) are
byte-for-byte copies of the recordings the previous live game shipped (`apps/showcase-top-tennis/public/toptennis/assets/audio/` at tag `v4.1.2`; that legacy folder was removed when the route switched to this native game). The repository does not record where they were originally recorded or under
which licence beyond that they are bundled with our own game; confirm the source before publishing them outside the
showcase.

`audio/audio.ts` slices them (0.24 s per take, at offsets 0, 0.3 and 0.6 s) and falls back to a procedural impact if
they cannot be fetched or decoded.
