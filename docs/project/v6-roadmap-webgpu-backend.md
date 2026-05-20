# WebGPU Backend

> Historical note: This V6 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


V6 WebGPU support is an honest capability report, not a WebGPU parity claim.

The current WebGPU path checks adapter/device availability and records whether real hardware is available. If WebGPU is unavailable, V6 does not block the WebGL2 production renderer claim. It also does not claim full WebGPU parity with WebGL2 or Three.js.

Accepted language:

- "V6 reports WebGPU availability and device capabilities."
- "V6 production rendering currently relies on WebGL2 evidence."

Blocked language:

- "V6 has full WebGPU parity."
- "V6 WebGPU replaces Three.js WebGPU."

Primary evidence:

- `tests/reports/v6-webgpu-readiness.json`
