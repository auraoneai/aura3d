# Drift & Deliver port: remote browser evidence

Frames are 480x270 JPEGs from `tests/browser/drift-and-deliver-port.spec.ts`, ACR run `chpa` (`drift13-20261023T074135Z`),
SwiftShader WebGL2 on x64 Linux, 2 tests passed. No side-by-side with the original exists (its frames were not captured).

| frame | what it shows |
| --- | --- |
| `start.jpg` | spawn on the x=30 street, chase camera, city canyon |
| `driving.jpg` | after 240 held-W steps (about 100 km/h) |
| `boosting.jpg` | boost held |
| `drifting.jpg` | W+D+Space for 20 steps |
| `pickup.jpg` | after collecting a coin (score 10, 1 / 174) |

Logged results: counts 225 blocks / 1688 buildings / 360 trees / 84 traffic / 174 pickups; the original's own capture runner run
against the port reproduced **all four reference hashes exactly** (6dbb0e7c, 45ad3c05, 305ab087, eedca08b; maxAbsDelta 0,
contacts 0); diagnostics 0 errors, route health ready, 27 draw calls.

Known gap: the headlight beam cone does not draw (pixel diff lamp-on vs lamp-off is 0-4 pixels). See `examples/drift-and-deliver-port/PORTING-NOTES.md`.
