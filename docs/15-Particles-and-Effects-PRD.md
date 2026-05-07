# Particles And Effects PRD

## Purpose
Particles and effects provide CPU and GPU-friendly particle systems, emitters, modules, batching, collisions, trails, and visual validation demos. Effects must build on a stable renderer and material system.

## Lessons From Failed Attempts
- Current G3D has particles and modules but scans found placeholder comments in GPU particle and particle pass paths.
- `Old-G3D/COMPLETION_ANALYSIS.md` showed a particle documentation-vs-reality gap with remaining tasks.
- Old rendering reports showed particles could partly work while line rendering or shader behavior still failed.

Reuse conceptually:

- Modular particle emitters.
- CPU path first, GPU path later.
- Collision module and debug stats.
- Visual demo matrix.

Discard:

- Million-particle claims before simple particles are visually and performance tested.
- Module summaries as proof.
- Particle renderers that bypass the render graph.

## Target Architecture
Particles are simulation data plus renderer-facing buffers. CPU particles ship first. GPU simulation is a later backend behind the same emitter contract.

## File-By-File Implementation Plan

### `packages/rendering/src/effects/ParticleSystem.ts`
- Purpose: runtime owner for emitters and particles.
- Edge cases: max particle cap, pause/resume, dispose.
- Tests: spawn/update/death.

### `packages/rendering/src/effects/ParticleEmitter.ts`
- Purpose: emission shape, rate, burst, lifetime.
- Tests: deterministic seeded emission.

### `packages/rendering/src/effects/Particle.ts`
- Purpose: particle data layout.
- Tests: initialization defaults.

### `packages/rendering/src/effects/ParticleModule.ts`
- Purpose: module interface.
- Tests: module order.

### `packages/rendering/src/effects/VelocityModule.ts`
- Purpose: velocity over lifetime.
- Tests: sampled velocity.

### `packages/rendering/src/effects/ColorModule.ts`
- Purpose: color over lifetime.
- Tests: gradient sampling.

### `packages/rendering/src/effects/SizeModule.ts`
- Purpose: size over lifetime.
- Tests: curve sampling.

### `packages/rendering/src/effects/ForceModule.ts`
- Purpose: gravity/wind/custom forces.
- Tests: integration.

### `packages/rendering/src/effects/CollisionModule.ts`
- Purpose: optional scene/physics collision.
- Tests: plane bounce and kill.

### `packages/rendering/src/effects/TrailModule.ts`
- Purpose: trails and ribbons after line rendering is proven.
- Tests: trail geometry.

### `packages/rendering/src/effects/ParticleRenderer.ts`
- Purpose: CPU particle draw path through render graph.
- Tests: visible sprites and batching.

### `packages/rendering/src/effects/GPUParticleBackend.ts`
- Purpose: future GPU simulation backend.
- Initial scope: interface and feature detection only until CPU path passes.
- Tests: unavailable fallback.

## Acceptance Criteria
- CPU particles render visible sprites in browser.
- Seeded emitter produces deterministic counts and positions.
- Modules update in explicit order.
- Particle renderer participates in render graph.
- Debug stats expose live count, spawned count, killed count, buffer uploads.

## Testing Checklist
- Unit: emitter, modules, seeded randomness.
- Integration: particle system in engine loop.
- Browser/visual: fire-like sprite demo, fountain demo, collision demo.
- Performance: 10,000 CPU particles baseline before GPU path.

## Implementation Order
1. CPU particle data and emitter.
2. Modules.
3. Particle renderer.
4. Collision module.
5. Trails.
6. GPU backend only after CPU path passes.

