# Physics

The physics package provides a deterministic built-in runtime for bounded browser examples and tests. It is suitable for simple rigid-body interactions and debug visualization in the current v2 slice.

## Simulation Boundary

Application code owns the fixed-step loop and decides how simulation results are copied into scene or renderer state. Physics should not directly own DOM events, UI state, or renderer presentation.

## Supported Shapes And Constraints

Current known support includes box, sphere, capsule, plane, and indexed triangle mesh collision shapes. Constraint coverage is limited to fixed, hinge, slider, and spring-style contracts.

## Debug Boundary

Physics debug output should remain diagnostic geometry. Product demos may display collider outlines and contact information, but that does not imply native-engine feature parity.

## Current Limits

Continuous collision detection, vehicle dynamics, cloth, soft bodies, fluids, destructible simulation, and native backend parity are not claimed.
