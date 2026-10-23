# Where the Wind Wanders on Aura3D: rendered frames

Rendered by `tests/browser/where-the-wind-wanders-port.spec.ts` on the remote software-WebGL2 runner (ACR run
`wind-20261023T050400Z`, SwiftShader, 960x540 viewport, 480x270 JPEG): `start.jpg` (the meadow at the start
position), `walked.jpg` (4 seconds of walking east) and `end.jpg` (after the replayed 2,098-step run that collects the
three letters and rings the bell). Measured: terrain/foliage cover 60% of the frame, 252+ distinct colours, 3,820
foliage cards in one draw, 94 draw calls.

Everything is procedural; the original's painted sprite art is not reproduced (see
`examples/where-the-wind-wanders-port/PORTING-NOTES.md`). These frames show the port's own look, not a pixel comparison
with the original.
