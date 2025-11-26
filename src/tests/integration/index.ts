/**
 * Integration Tests Index
 *
 * Central export file for all G3D 5.0 integration tests.
 * These tests verify that major modules work correctly together.
 *
 * Usage:
 *   npm run test               # Run all tests
 *   npm run test:watch         # Run tests in watch mode
 *   npm run test:coverage      # Run tests with coverage report
 *
 * Individual test suites can also be run:
 *   npm run test -- CoreIntegration
 *   npm run test -- RenderingIntegration
 *   npm run test -- PhysicsIntegration
 *   etc.
 *
 * @module tests/integration
 */

// Core Module Tests
export * from './CoreIntegration';

// Rendering Module Tests
export * from './RenderingIntegration';

// Physics Module Tests
export * from './PhysicsIntegration';

// Animation Module Tests
export * from './AnimationIntegration';

// AI Module Tests
export * from './AIIntegration';

// Audio Module Tests
export * from './AudioIntegration';

// Network Module Tests
export * from './NetworkIntegration';

/**
 * Integration Test Coverage Summary
 *
 * Core Module:
 * - Engine lifecycle management (initialization, start, stop, pause, resume, destroy)
 * - Time system (delta time, fixed timestep, time scaling)
 * - EventBus (pub/sub, priorities, wildcards, error isolation)
 * - ObjectPool (memory management, reuse, debug mode)
 * - TaskScheduler (task execution, priorities, delays, recurring)
 * - Logger (levels, structured logging, filtering)
 *
 * Rendering Module:
 * - Renderer initialization (WebGL2/WebGPU)
 * - RenderGraph execution (passes, dependencies, culling)
 * - Material system (properties, cloning, variants)
 * - Shader system (compilation, uniforms, caching)
 * - Camera/View management (perspective/orthographic, matrices)
 * - Post-processing (effects, TAA, stacks)
 * - Scene rendering (meshes, culling)
 * - GPU resources (buffers, textures, memory tracking)
 *
 * Physics Module:
 * - PhysicsWorld creation and configuration
 * - RigidBody simulation (static, dynamic, kinematic)
 * - Collision detection (shapes, triggers, events)
 * - Physics materials (friction, restitution)
 * - Character controller (movement, grounded, stairs)
 * - Raycasting (hits, filtering, queries)
 * - ECS integration (components, synchronization)
 * - Debug rendering (wireframes, contacts)
 *
 * Animation Module:
 * - Animation playback (clips, looping, speed)
 * - Animation blending (crossfade, weights)
 * - Skeletal animation (bones, hierarchy, skinning)
 * - State machines (states, transitions, conditions)
 * - Blend trees (1D, 2D, parameters)
 * - Inverse Kinematics (two-bone, pole targets, weights)
 * - Motion matching (database, features, queries)
 * - Root motion (extraction, application)
 * - Animation events (timing, callbacks)
 *
 * AI Module:
 * - NavMesh generation (geometry, obstacles, updates)
 * - Pathfinding (A*, smoothing, partial paths)
 * - Behavior trees (sequences, selectors, decorators)
 * - Crowd simulation (avoidance, formations, steering)
 * - Perception system (vision, hearing, line-of-sight)
 * - ECS integration (agents, navigation)
 *
 * Audio Module:
 * - AudioContext initialization and configuration
 * - Sound playback (play, stop, pause, loop)
 * - Spatial audio (3D positioning, attenuation, doppler)
 * - Audio effects (reverb, filters, compressor, chains)
 * - Audio buses (hierarchy, mixing, effects)
 * - Music system (tracks, crossfade, layers, stingers)
 * - ECS integration (sources, listener, events)
 * - Performance (voice limiting, prioritization)
 *
 * Network Module:
 * - Connection management (connect, disconnect, auth)
 * - State replication (entities, delta compression, relevancy)
 * - Remote Procedure Calls (server/client, broadcast, binary)
 * - Network transform (position, rotation, interpolation)
 * - Client-side prediction (input, reconciliation, smoothing)
 * - ECS integration (networked entities, components)
 * - Bandwidth optimization (batching, compression, throttling)
 *
 * Total Test Count: ~300+ integration tests across all modules
 * Average Coverage: ~80% of integration scenarios
 *
 * Key Testing Patterns:
 * 1. Lifecycle testing (init → use → cleanup)
 * 2. Error handling and edge cases
 * 3. Performance and memory management
 * 4. Cross-module integration
 * 5. Real-world usage scenarios
 */
