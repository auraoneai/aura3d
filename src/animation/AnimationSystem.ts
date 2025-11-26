/**
 * ECS system for processing animation components.
 * Integrates animation with the Entity-Component-System architecture.
 * @module animation/AnimationSystem
 */

import { System, SystemContext, SystemPriorities } from '../ecs/System';
import { IComponent } from '../ecs/Component';
import { AnimationMixer } from './AnimationMixer';
import { Skeleton } from './Skeleton';
import { SkinnedMesh } from './SkinnedMesh';
import { MorphTargets } from './MorphTargets';
import { AnimationStateMachine } from './AnimationState';
import { ChannelType } from './Animation';

/**
 * Animation component for entities with animated content.
 * Attach this component to entities that need animation playback.
 *
 * @example
 * ```typescript
 * class AnimationComponent implements IComponent {
 *   mixer = new AnimationMixer();
 *   skeleton?: Skeleton;
 *   skinnedMesh?: SkinnedMesh;
 *   morphTargets?: MorphTargets;
 *   stateMachine?: AnimationStateMachine;
 *   autoUpdate = true;
 * }
 * ```
 */
export class AnimationComponent implements IComponent {
  /**
   * Animation mixer for playback control.
   */
  mixer: AnimationMixer;

  /**
   * Skeleton for bone-based animation (optional).
   */
  skeleton?: Skeleton;

  /**
   * Skinned mesh for GPU skinning (optional).
   */
  skinnedMesh?: SkinnedMesh;

  /**
   * Morph targets for blend shape animation (optional).
   */
  morphTargets?: MorphTargets;

  /**
   * Animation state machine for state-based control (optional).
   */
  stateMachine?: AnimationStateMachine;

  /**
   * Whether to automatically update transforms (default: true).
   */
  autoUpdate: boolean;

  /**
   * Whether to automatically update bounds (default: true).
   */
  autoUpdateBounds: boolean;

  /**
   * Creates a new animation component.
   *
   * @example
   * ```typescript
   * const animComp = new AnimationComponent();
   * animComp.skeleton = characterSkeleton;
   * animComp.skinnedMesh = characterMesh;
   * entity.addComponent(AnimationComponent, animComp);
   * ```
   */
  constructor() {
    this.mixer = new AnimationMixer();
    this.autoUpdate = true;
    this.autoUpdateBounds = true;
  }

  /**
   * Resets the component for object pooling.
   */
  reset(): void {
    this.mixer.stopAll();
    this.skeleton = undefined;
    this.skinnedMesh = undefined;
    this.morphTargets = undefined;
    this.stateMachine = undefined;
    this.autoUpdate = true;
    this.autoUpdateBounds = true;
  }
}

/**
 * ECS system for updating animation components.
 * Processes animation mixers, skeletons, and morph targets each frame.
 *
 * @example
 * ```typescript
 * // Add animation system to world
 * const animSystem = new AnimationSystem();
 * world.addSystem(animSystem);
 *
 * // Create animated entity
 * const entity = world.createEntity();
 * const animComp = new AnimationComponent();
 * animComp.skeleton = skeleton;
 * animComp.skinnedMesh = skinnedMesh;
 *
 * const action = animComp.mixer.play(walkAnimation);
 * entity.addComponent(AnimationComponent, animComp);
 *
 * // System automatically updates animation each frame
 * ```
 */
export class AnimationSystem extends System {
  /**
   * Query for entities with AnimationComponent.
   */
  readonly query = [AnimationComponent];

  /**
   * Creates a new animation system.
   *
   * @example
   * ```typescript
   * const system = new AnimationSystem();
   * ```
   */
  constructor() {
    super({
      name: 'AnimationSystem',
      priority: SystemPriorities.ANIMATION,
      enabled: true
    });
  }

  /**
   * Updates all animation components.
   *
   * @param context - System update context
   *
   * @example
   * ```typescript
   * // Called automatically by ECS world
   * update(context: SystemContext): void {
   *   // Process all animated entities
   * }
   * ```
   */
  update(context: SystemContext): void {
    const query = this.getQuery();

    query.forEach((entity, components) => {
      const animComp = components[0] as AnimationComponent;

      // Update state machine if present
      if (animComp.stateMachine) {
        animComp.stateMachine.update(context.deltaTime);
      }

      // Update animation mixer
      animComp.mixer.update(context.deltaTime);

      if (!animComp.autoUpdate) {
        return;
      }

      // Apply animation to skeleton
      if (animComp.skeleton) {
        this.updateSkeleton(animComp);
      }

      // Apply animation to morph targets
      if (animComp.morphTargets) {
        this.updateMorphTargets(animComp);
      }

      // Update skinned mesh bounds if present
      if (animComp.skinnedMesh && animComp.autoUpdateBounds) {
        animComp.skinnedMesh.updateBounds();
      }
    });
  }

  /**
   * Updates skeleton from animation mixer pose.
   *
   * @param animComp - Animation component
   * @private
   */
  private updateSkeleton(animComp: AnimationComponent): void {
    const skeleton = animComp.skeleton!;
    const pose = animComp.mixer.getPose();

    // Apply pose to skeleton
    for (const [target, channels] of pose) {
      if (channels.position) {
        skeleton.setBonePosition(target, channels.position);
      }

      if (channels.rotation) {
        skeleton.setBoneRotation(target, channels.rotation);
      }

      if (channels.scale) {
        skeleton.setBoneScale(target, channels.scale);
      }
    }

    // Update skeleton transforms
    skeleton.update();
  }

  /**
   * Updates morph targets from animation mixer pose.
   *
   * @param animComp - Animation component
   * @private
   */
  private updateMorphTargets(animComp: AnimationComponent): void {
    const morphTargets = animComp.morphTargets!;
    const pose = animComp.mixer.getPose();

    // Apply weights from pose
    for (const [target, channels] of pose) {
      if (channels.weights) {
        const weights = channels.weights as number[];

        // Set weights for each morph target
        for (let i = 0; i < weights.length && i < morphTargets.targetCount; i++) {
          const targetNames = morphTargets.getTargetNames();
          if (i < targetNames.length) {
            morphTargets.setWeight(targetNames[i], weights[i]);
          }
        }
      }
    }
  }
}

/**
 * Helper function to create an animated entity.
 * Convenience function for common animation setup.
 *
 * @param skeleton - Skeleton for the entity (optional)
 * @param skinnedMesh - Skinned mesh for the entity (optional)
 * @param morphTargets - Morph targets for the entity (optional)
 * @returns Animation component
 *
 * @example
 * ```typescript
 * const animComp = createAnimatedEntity(skeleton, skinnedMesh);
 * const entity = world.createEntity();
 * entity.addComponent(AnimationComponent, animComp);
 *
 * // Play animation
 * animComp.mixer.play(walkAnimation);
 * ```
 */
export function createAnimatedEntity(
  skeleton?: Skeleton,
  skinnedMesh?: SkinnedMesh,
  morphTargets?: MorphTargets
): AnimationComponent {
  const animComp = new AnimationComponent();

  if (skeleton) {
    animComp.skeleton = skeleton;
  }

  if (skinnedMesh) {
    animComp.skinnedMesh = skinnedMesh;
  }

  if (morphTargets) {
    animComp.morphTargets = morphTargets;
  }

  return animComp;
}

/**
 * Helper function to create an animated entity with state machine.
 * Convenience function for state-based animation setup.
 *
 * @param skeleton - Skeleton for the entity (optional)
 * @param skinnedMesh - Skinned mesh for the entity (optional)
 * @returns Animation component with state machine
 *
 * @example
 * ```typescript
 * const animComp = createAnimatedEntityWithStateMachine(skeleton, skinnedMesh);
 *
 * // Set up state machine
 * animComp.stateMachine!.addState({
 *   name: 'Idle',
 *   animation: idleAnimation,
 *   loop: true
 * });
 *
 * animComp.stateMachine!.addState({
 *   name: 'Walk',
 *   animation: walkAnimation,
 *   loop: true
 * });
 *
 * animComp.stateMachine!.addTransition({
 *   from: 'Idle',
 *   to: 'Walk',
 *   duration: 0.3,
 *   condition: () => velocity > 0.1
 * });
 *
 * animComp.stateMachine!.setState('Idle');
 *
 * const entity = world.createEntity();
 * entity.addComponent(AnimationComponent, animComp);
 * ```
 */
export function createAnimatedEntityWithStateMachine(
  skeleton?: Skeleton,
  skinnedMesh?: SkinnedMesh
): AnimationComponent {
  const animComp = createAnimatedEntity(skeleton, skinnedMesh);
  animComp.stateMachine = new AnimationStateMachine(animComp.mixer);
  return animComp;
}
