# Q-09-4 — `Vec3Like` name collision on `@aura3d/audio`

- **Requester:** lane 15 (PRD-15 T5.8, `unique-ownership` gate)
- **Owner:** lane 09
- **SLA:** 2 working days
- **File:** `packages/audio/src/AudioListener.ts`

## What

`Vec3Like` is exported by both `@aura3d/audio` (`AudioListener.ts`) and
`@aura3d/input` (`controls/ControlTypes.ts`) with different declarations.
Lane 08 got the same ask (Q-08-2); either side converging on
`@aura3d/scene/math`'s vector types — or one side renaming — resolves it.

## Ask

Import the shared declaration or rename the audio-side export. Allowlisted
until then.
