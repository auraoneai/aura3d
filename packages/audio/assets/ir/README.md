# IR files

Impulse responses for `ReverbSend` presets (PRD-09). These are algorithmically
generated IRs — mono 24 kHz pink-noise bursts with an exponential decay and a
per-preset lowpass — not recorded responses, so their provenance is
`generated` rather than a licensed sample. Lengths match `PRESET_IR_SECONDS`
in `src/game-sound/ReverbSend.ts`; both Opus (`.webm`) and AAC (`.m4a`)
encodings ship per preset.

Regenerate with `ffmpeg` using `anoisesrc` + an `exp(-6t/T)` amplitude
envelope, `lowpass` per preset (small-room 6 kHz, street 5.2 kHz, hall 4.2 kHz,
hangar 2.8 kHz, underwater 1.4 kHz).
