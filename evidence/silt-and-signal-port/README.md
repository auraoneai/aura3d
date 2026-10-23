# Silt & Signal port: browser evidence

Captured remotely (serverless ACR Task, `tests/browser/silt-and-signal-port.spec.ts`, software GL, 960x540). Frames are not pixel references.

- `start.jpg`: chapter 0, objective 2, chase camera at rest: sky dome (ported shader), ground with road, canal, objective rings, rider.
- `overview.jpg`: same state from the debug overview pose (`__AURA_SILT__.overview(true)`).
- `flying.jpg`: after 240 simulated frames at full throttle.

The sky shader is a port of the original; ground, canal, rings and rider are stand-ins (see `examples/silt-and-signal-port/PORTING-NOTES.md`). Simulation parity is measured against `evidence/crayon-capture/silt-and-signal-reference.json`, not these images.
