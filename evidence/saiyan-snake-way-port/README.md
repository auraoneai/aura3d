# Saiyan through the Snake way! port: frames

Five 480x270 JPEG frames from the remote browser spec `tests/browser/saiyan-snake-way-port.spec.ts`
(ACR run `ssw-b-20261023T051217Z`, SwiftShader WebGL2, 960x540 viewport downscaled for the log).
The spec replays the original game's recorded outbound input and captures the frame at each step count:

| File | Step | Moment |
| --- | --- | --- |
| `start.jpg` | 30 | Check-in strip, Goku at the start of the road |
| `kaio-ken.jpg` | first checkpoint at the highest recorded Kaio-ken rung | Aura shells lit |
| `traffic.jpg` | 1800 | Ki orbs, barriers and oni on the road |
| `late-road.jpg` | 4800 | Late stages of the snake |
| `end-of-road.jpg` | 5433 | End of the road |

What these frames do and do not show:

- Simulation parity is claimed by `tests/unit/saiyan-snake-way-port/reference-replay.test.ts` (183
  recorded snapshots, 46 fields each, within 1e-6 of the original) and by the in-page replay in the
  browser spec. It is not claimed from the pictures.
- The pictures are not a pixel match to the original. The port uses primitive figures, a gradient
  sky dome and an inline toon ramp; see `examples/saiyan-snake-way-port/PORTING-NOTES.md` for the
  divergence table. No blind "same game" judgment has been run on these frames.
