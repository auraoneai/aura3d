/**
 * @fileoverview System execution phases for the ECS framework.
 * Defines the order in which different categories of systems execute.
 *
 * Systems are executed in ascending phase order, with lower values running first.
 * Within each phase, systems execute by their individual priority values.
 *
 * @module ecs/SystemPhase
 */

/**
 * System execution phases.
 *
 * Phases define coarse-grained execution order for systems.
 * Use these constants to ensure systems run in the correct order relative to each other.
 *
 * Execution Order:
 * 1. PRE_UPDATE - Preparation and input processing
 * 2. UPDATE - Main game logic and AI
 * 3. PRE_PHYSICS - Transform updates before physics
 * 4. PHYSICS - Physics simulation
 * 5. POST_PHYSICS - React to physics results
 * 6. PRE_RENDER - Culling and render preparation
 * 7. RENDER - Final rendering
 * 8. POST_RENDER - Profiling and analytics
 *
 * @example
 * ```typescript
 * class MySystem extends System {
 *   constructor() {
 *     super({
 *       name: 'MySystem',
 *       priority: SystemPhase.UPDATE,
 *       enabled: true
 *     });
 *   }
 * }
 * ```
 */
export enum SystemPhase {
  /**
   * Pre-update phase (priority: 0)
   *
   * Systems that prepare data for the main update loop.
   * This is the first phase to execute.
   *
   * Typical systems:
   * - InputSystem (processes keyboard, mouse, gamepad)
   * - NetworkSystem (receives network updates)
   * - EventSystem (processes queued events)
   */
  PRE_UPDATE = 0,

  /**
   * Update phase (priority: 100)
   *
   * Main game logic, AI, and gameplay systems.
   * Most gameplay systems should run in this phase.
   *
   * Typical systems:
   * - AnimationSystem (updates animation state machines)
   * - AISystem (behavior trees, pathfinding)
   * - GameplaySystem (game rules, scoring)
   * - AudioSystem (sound effects, music)
   * - ActiveSystem (entity activation state)
   * - HierarchySystem (parent-child relationships)
   */
  UPDATE = 100,

  /**
   * Pre-physics phase (priority: 200)
   *
   * Systems that must run before physics simulation.
   * Transform updates happen here to ensure physics has latest positions.
   *
   * Typical systems:
   * - TransformSystem (MUST run before physics)
   * - CharacterControllerSystem (applies movement before physics)
   */
  PRE_PHYSICS = 200,

  /**
   * Physics phase (priority: 300)
   *
   * Physics simulation and collision detection.
   * Typically uses fixedUpdate for deterministic simulation.
   *
   * Typical systems:
   * - PhysicsSystem (rigid body dynamics, collisions)
   */
  PHYSICS = 300,

  /**
   * Post-physics phase (priority: 400)
   *
   * Systems that react to physics results.
   * Use this phase to read collision data or adjust positions after physics.
   *
   * Typical systems:
   * - CollisionResponseSystem (handles collision events)
   * - RagdollSystem (applies physics to character bones)
   * - ParticleSystem (physics-based particles)
   */
  POST_PHYSICS = 400,

  /**
   * Pre-render phase (priority: 500)
   *
   * Systems that prepare data for rendering.
   * Culling, sorting, and render scene construction happen here.
   *
   * Typical systems:
   * - CullingSystem (MUST run before RenderSystem)
   * - LODSystem (selects appropriate detail levels)
   * - RenderSystem (builds RenderScene for renderer)
   * - UISystem (prepares UI for rendering)
   * - TerrainSystem (updates terrain LOD)
   */
  PRE_RENDER = 500,

  /**
   * Render phase (priority: 600)
   *
   * Final rendering pass.
   * Should only contain systems that directly submit draw calls.
   *
   * Typical systems:
   * - CameraSystem (renders from camera viewpoints)
   * - PostProcessingSystem (applies screen effects)
   */
  RENDER = 600,

  /**
   * Post-render phase (priority: 700)
   *
   * Systems that run after rendering completes.
   * Used for profiling, analytics, and debug visualization.
   *
   * Typical systems:
   * - ProfilingSystem (collects performance metrics)
   * - AnalyticsSystem (sends telemetry)
   * - DebugDrawSystem (renders debug overlays)
   */
  POST_RENDER = 700
}

/**
 * Helper function to get a human-readable phase name.
 *
 * @param phase - System phase value
 * @returns Phase name as string
 *
 * @example
 * ```typescript
 * const phaseName = getPhaseNam(SystemPhase.PHYSICS);
 * console.log(phaseName); // "PHYSICS"
 * ```
 */
export function getPhaseName(phase: SystemPhase): string {
  switch (phase) {
    case SystemPhase.PRE_UPDATE:
      return 'PRE_UPDATE';
    case SystemPhase.UPDATE:
      return 'UPDATE';
    case SystemPhase.PRE_PHYSICS:
      return 'PRE_PHYSICS';
    case SystemPhase.PHYSICS:
      return 'PHYSICS';
    case SystemPhase.POST_PHYSICS:
      return 'POST_PHYSICS';
    case SystemPhase.PRE_RENDER:
      return 'PRE_RENDER';
    case SystemPhase.RENDER:
      return 'RENDER';
    case SystemPhase.POST_RENDER:
      return 'POST_RENDER';
    default:
      return 'UNKNOWN';
  }
}

/**
 * Checks if a priority value falls within a specific phase range.
 *
 * @param priority - System priority to check
 * @param phase - Phase to check against
 * @returns True if priority is in the phase range
 *
 * @example
 * ```typescript
 * const inPhysicsPhase = isInPhase(250, SystemPhase.PHYSICS);
 * console.log(inPhysicsPhase); // false (250 is in PRE_PHYSICS)
 * ```
 */
export function isInPhase(priority: number, phase: SystemPhase): boolean {
  const phases = Object.values(SystemPhase).filter(v => typeof v === 'number').sort((a, b) => a - b);
  const currentIndex = phases.indexOf(phase);

  if (currentIndex === -1) {
    return false;
  }

  const nextPhase = phases[currentIndex + 1];

  if (nextPhase === undefined) {
    // Last phase - anything >= this phase
    return priority >= phase;
  }

  return priority >= phase && priority < nextPhase;
}

/**
 * Gets the phase a priority value belongs to.
 *
 * @param priority - System priority value
 * @returns The phase this priority belongs to
 *
 * @example
 * ```typescript
 * const phase = getPhaseForPriority(250);
 * console.log(getPhaseName(phase)); // "PRE_PHYSICS"
 * ```
 */
export function getPhaseForPriority(priority: number): SystemPhase {
  const phases = Object.values(SystemPhase)
    .filter(v => typeof v === 'number')
    .sort((a, b) => (a as number) - (b as number)) as SystemPhase[];

  for (let i = phases.length - 1; i >= 0; i--) {
    if (priority >= phases[i]) {
      return phases[i];
    }
  }

  return SystemPhase.PRE_UPDATE;
}

export { SystemPhase as default };
