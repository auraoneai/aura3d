# Engine Lifecycle

Galileo3D applications are expected to make lifecycle ownership explicit. The app creates runtime objects, advances them from its loop or test harness, records diagnostics, and disposes browser resources when the view is torn down.

## Startup Boundary

Startup usually has three steps:

1. Create or locate the host browser surface, such as a `<canvas>`.
2. Create package-level systems through public APIs, for example `Renderer.create(...)`, `PhysicsWorld`, `AssetManager`, or editor runtime objects.
3. Load or construct scene content, then render or step the systems from an application-owned loop.

The renderer does not own the whole page. Framework templates should keep DOM lifecycle, routing, and hot reload in the framework layer while Galileo3D owns graphics resources attached to the canvas.

## Frame Boundary

A typical frame updates input, simulation, animation, scene transforms, and rendering in that order. Tests and examples may use one-shot rendering for deterministic smoke checks, but interactive apps should keep timing and scheduling in application code or the core engine loop.

## Disposal Boundary

Browser GPU and audio resources must be treated as finite. Dispose renderer resources, release loaded assets, and remove event listeners when a component unmounts or an editor preview is recreated.

## Current Limits

Lifecycle hardening is not a production claim yet. Context-loss recovery, long-running hot reload cycles, and device recreation remain tracked by the v2 checklist and `docs/known-limits.md`.
