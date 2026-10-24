# Live 4.1.0 verification (production aura3d.auraone.ai, software WebGL2 remote runs + Prism)

Deployment aura3d-ka6b65c31-veerone.vercel.app (commit 8cb9d3725, tag v4.1.0). Software WebGL2 (SwiftShader) on ACR, not a real GPU: frames prove the pages render, not how they perform.

| Item | Result |
|---|---|
| game:aura-diamond-3d | status 200, non-black 1, colours 1666, mean luma 78, frame changed 0.2719, drawCalls 488, console errors 0, bad 0, self-heal none, final URL /apps/showcase-aura-diamond-3d/ |
| game:aura-fc-3d | status 200, non-black 1, colours 2639, mean luma 106.1, frame changed 0.6984, drawCalls 207, console errors 0, bad 0, self-heal none, final URL /apps/showcase-aura-fc-3d/ |
| game:aura-hoops-3d | status 200, non-black 1, colours 1437, mean luma 93.1, frame changed 0.8053, drawCalls 95, console errors 0, bad 0, self-heal none, final URL /apps/showcase-aura-hoops-3d/ |
| game:aura-links-3d | status 200, non-black 1, colours 1172, mean luma 132.3, frame changed 0.443, drawCalls 56, console errors 0, bad 0, self-heal none, final URL /apps/showcase-aura-links-3d/ |
| game:bunker-zero | status 200, non-black 0.952, colours 947, mean luma 67.7, frame changed 0.4419, drawCalls None, console errors 0, bad 0, self-heal none, final URL /apps/showcase-bunker-zero/ |
| game:cross-hop | status 200, non-black 1, colours 1, mean luma 13.8, frame changed 0, drawCalls None, console errors 0, bad 0, self-heal ['AURA3D_BLACK_FRAME: reloading at rung 1 (no-vfx-fog)', 'AURA3D_COMPAT_MODE: rung 1 (no-vfx-fog) after a black frame was detected', 'AURA3D_BLACK_FRAME: reloading at rung 2 (no-post)', 'AURA3D_COMPAT_MODE: rung 2 (no-post) after a black frame was detected'], final URL /apps/showcase-cross-hop/?a3d-qr=game%2C-vfxFog%2C-post%2C-compiler |
| game:dot-dash-3d | status 200, non-black 0.778, colours 1385, mean luma 21.4, frame changed 0.0316, drawCalls 102, console errors 0, bad 0, self-heal none, final URL /apps/showcase-dot-dash-3d/ |
| game:heatsink | status 200, non-black 1, colours 2118, mean luma 84.9, frame changed 0.5073, drawCalls 1281, console errors 0, bad 0, self-heal none, final URL /apps/showcase-heatsink/ |
| game:iron-crown | status 200, non-black 0.887, colours 2649, mean luma 51.7, frame changed 0.794, drawCalls None, console errors 0, bad 0, self-heal ['AURA3D_BLACK_FRAME: reloading at rung 1 (no-vfx-fog)', 'AURA3D_COMPAT_MODE: rung 1 (no-vfx-fog) after a black frame was detected'], final URL /apps/showcase-iron-crown/?a3d-qr=game%2C-vfxFog |
| game:pips-big-leap | status 200, non-black 1, colours 4007, mean luma 152.4, frame changed 0.8703, drawCalls 497, console errors 0, bad 0, self-heal none, final URL /apps/showcase-pips-big-leap/ |
| game:red-zone-3d | status 200, non-black 1, colours 1834, mean luma 104.8, frame changed 0.299, drawCalls 334, console errors 0, bad 0, self-heal none, final URL /apps/showcase-red-zone-3d/ |
| game:roadster-rush | status 200, non-black 0.99, colours 1482, mean luma 67.5, frame changed 0.2544, drawCalls 721, console errors 0, bad 0, self-heal none, final URL /apps/showcase-roadster-rush/ |
| game:slingshot-siege | status 200, non-black 0.97, colours 3173, mean luma 106.8, frame changed 0.1149, drawCalls 298, console errors 0, bad 0, self-heal none, final URL /apps/showcase-slingshot-siege/ |
| game:teleoperator | status 200, non-black 1, colours 2537, mean luma 96.1, frame changed 0.2409, drawCalls 520, console errors 0, bad 0, self-heal none, final URL /apps/showcase-teleoperator/ |
| game:top-tennis | status 200, non-black 0.924, colours 600, mean luma 51.4, frame changed 0.0581, drawCalls 616, console errors 0, bad 0, self-heal none, final URL /apps/showcase-top-tennis/ |
| port:cloud-runner | status 200, canvas-only non-black 1.00, drawCalls 187, console errors 0, bad responses 0, state changed True, HUD changed True, self-heal none, viewport 360x270 if heavy |
| port:drift-and-deliver | status 200, canvas-only non-black 1.00, drawCalls 107, console errors 0, bad responses 0, state changed True, HUD changed False, self-heal none, viewport 360x270 if heavy |
| port:ninja-runner | status 200, canvas-only non-black 1.00, drawCalls 41, console errors 0, bad responses 0, state changed False, HUD changed True, self-heal none, viewport 360x270 if heavy |
| port:roadster-hours | status 200, canvas-only non-black 1.00, drawCalls 71, console errors 0, bad responses 0, state changed True, HUD changed True, self-heal none, viewport 360x270 if heavy |
| port:serpentine-sky-run | status 200, canvas-only non-black 1.00, drawCalls 19, console errors 0, bad responses 0, state changed False, HUD changed True, self-heal none, viewport 360x270 if heavy |
| port:silt-and-signal | status 200, canvas-only non-black 1.00, drawCalls 156, console errors 0, bad responses 0, state changed True, HUD changed True, self-heal none, viewport 360x270 if heavy |
| port:splat-rush | status 200, canvas-only non-black 1.00, drawCalls 107, console errors 0, bad responses 0, state changed True, HUD changed True, self-heal none, viewport 360x270 if heavy |
| port:strange-orbit | status 200, canvas-only non-black 1.00, drawCalls 27, console errors 0, bad responses 0, state changed False, HUD changed True, self-heal none, viewport 360x270 if heavy |
| port:where-the-wind-wanders | status 200, canvas-only non-black 1.00, drawCalls 16, console errors 0, bad responses 0, state changed True, HUD changed True, self-heal none, viewport 360x270 if heavy |

Not measured (timed out twice under software rendering, 420 s per test, page main thread starved): port:heatsink, port:last-train.
