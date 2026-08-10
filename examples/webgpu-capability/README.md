# WebGPU capability contract fixture

This source probes native adapter/device availability and graceful unsupported
states. The browser host lives at
`tests/fixtures/visual-examples/webgpu-capability/index.html`.

It is not a public 2.0 rendering example. Adapter creation and a clear pass with
zero draw calls do not prove the WebGPU renderer, compute, or WebGL2 parity.
