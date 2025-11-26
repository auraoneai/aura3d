# G3D Animation System

Complete production-ready animation system for the G3D 5.0 engine.

## Overview

The animation system provides:
- **Skeletal Animation**: Bone-based character animation with hierarchical transforms
- **Morph Target Animation**: Blend shape animation for facial expressions and deformations
- **Animation Blending**: Smooth crossfading and multi-layer animation mixing
- **State Machines**: High-level state-based animation control with transitions
- **GPU Skinning**: Efficient hardware-accelerated skinning with up to 4 bone influences per vertex
- **Zero Allocations**: Optimized for 60 FPS with no garbage collection during playback

## Features

### Core Components

1. **AnimationTrack** (~687 lines)
   - Single property animation track with keyframes
   - Support for step, linear, and cubic interpolation
   - Time wrapping: clamp, loop, ping-pong
   - Optimized keyframe search (O(1) for sequential playback)

2. **Animation** (~678 lines)
   - Animation clip with multiple channels
   - Channels for position, rotation, scale, and morph weights
   - JSON serialization/deserialization
   - Track optimization to remove redundant keyframes

3. **AnimationMixer** (~804 lines)
   - Multi-animation playback with blending
   - Crossfade support with configurable duration
   - Per-action weight, speed, and priority control
   - Event callbacks (onStart, onLoop, onFinish)

4. **AnimationState** (~503 lines)
   - State machine for animation management
   - Condition-based transitions
   - Interruptible transitions
   - Layer support for animation masking

5. **Skeleton** (~613 lines)
   - Bone hierarchy with parent-child relationships
   - Bind pose storage and inverse bind matrices
   - World and local transform computation
   - Skinning matrix generation for GPU

6. **SkinnedMesh** (~497 lines)
   - Vertex skinning with up to 4 bone influences
   - GPU-ready bone indices and weights
   - Dynamic bounds calculation
   - Weight normalization

7. **MorphTargets** (~564 lines)
   - Blend shape system for facial animation
   - Multiple morph targets with weight control
   - Delta position and normal storage
   - CPU and GPU morphing support

8. **AnimationClip** (~537 lines)
   - High-level animation editing utilities
   - Trim, split, reverse, and concatenate operations
   - Time scaling for speed control
   - Loop duplication

9. **AnimationSystem** (~333 lines)
   - ECS system for automatic animation updates
   - Skeleton and morph target processing
   - Bounds update management
   - State machine integration

## Usage Examples

### Basic Skeletal Animation

```typescript
import {
  Skeleton,
  Animation,
  AnimationTrack,
  AnimationMixer,
  ChannelType,
  ValueType,
  InterpolationMode
} from './animation';

// Create skeleton
const skeleton = new Skeleton({
  name: 'Character',
  bones: [
    {
      name: 'root',
      parentIndex: -1,
      position: Vector3.zero(),
      rotation: Quaternion.identity(),
      scale: Vector3.one()
    },
    {
      name: 'spine',
      parentIndex: 0,
      position: new Vector3(0, 1, 0),
      rotation: Quaternion.identity(),
      scale: Vector3.one()
    }
  ]
});

// Create animation
const walkAnim = new Animation({
  name: 'Walk',
  duration: 1.0,
  loop: true
});

// Add position track
const posTrack = new AnimationTrack<Vector3>('root', ValueType.VECTOR3);
posTrack.addKeyframe(0, new Vector3(0, 0, 0), InterpolationMode.LINEAR);
posTrack.addKeyframe(0.5, new Vector3(0, 0.1, 0), InterpolationMode.LINEAR);
posTrack.addKeyframe(1, new Vector3(0, 0, 0), InterpolationMode.LINEAR);
walkAnim.addChannel('root', ChannelType.POSITION, posTrack);

// Play animation
const mixer = new AnimationMixer();
const action = mixer.play(walkAnim);

// Update loop
function update(deltaTime: number) {
  mixer.update(deltaTime);
  
  const pose = mixer.getPose();
  for (const [target, channels] of pose) {
    if (channels.position) skeleton.setBonePosition(target, channels.position);
    if (channels.rotation) skeleton.setBoneRotation(target, channels.rotation);
    if (channels.scale) skeleton.setBoneScale(target, channels.scale);
  }
  
  skeleton.update();
}
```

### Animation State Machine

```typescript
import { AnimationStateMachine } from './animation';

const stateMachine = new AnimationStateMachine(mixer);

// Add states
stateMachine.addState({
  name: 'Idle',
  animation: idleAnimation,
  loop: true
});

stateMachine.addState({
  name: 'Walk',
  animation: walkAnimation,
  loop: true
});

stateMachine.addState({
  name: 'Run',
  animation: runAnimation,
  loop: true
});

// Add transitions
stateMachine.addTransition({
  from: 'Idle',
  to: 'Walk',
  duration: 0.3,
  condition: () => velocity > 0.1
});

stateMachine.addTransition({
  from: 'Walk',
  to: 'Run',
  duration: 0.2,
  condition: () => velocity > 5.0
});

// Set initial state
stateMachine.setState('Idle');

// Update each frame
stateMachine.update(deltaTime);
```

### Morph Target Animation

```typescript
import { MorphTargets } from './animation';

const morphTargets = new MorphTargets({
  vertexCount: 100,
  maxTargets: 8
});

// Add morph targets
morphTargets.addTarget({
  name: 'smile',
  deltaPositions: smileDeltas
});

morphTargets.addTarget({
  name: 'frown',
  deltaPositions: frownDeltas
});

// Animate weights
morphTargets.setWeight('smile', 0.8);
morphTargets.setWeight('frown', 0.0);

// Apply to mesh
const morphedPositions = morphTargets.apply(basePositions);
```

### ECS Integration

```typescript
import { AnimationSystem, AnimationComponent } from './animation';

// Add system to world
const animSystem = new AnimationSystem();
world.addSystem(animSystem);

// Create animated entity
const entity = world.createEntity();
const animComp = new AnimationComponent();
animComp.skeleton = skeleton;
animComp.skinnedMesh = skinnedMesh;

const action = animComp.mixer.play(walkAnimation);
entity.addComponent(AnimationComponent, animComp);

// System automatically updates animation each frame
```

## Performance Characteristics

- **Keyframe Evaluation**: O(1) for sequential playback, O(log n) for random access
- **Skeleton Update**: O(n) where n = bone count
- **Skinning Matrix Generation**: O(n) where n = bone count
- **Morph Target Application**: O(v * t) where v = vertex count, t = active target count
- **Memory**: Zero allocations during playback (uses object pooling)
- **Target Performance**: 60 FPS with 100+ bones and 1000+ vertices

## File Structure

```
animation/
├── Animation.ts           - Animation clip with channels
├── AnimationTrack.ts      - Single property track with keyframes
├── AnimationMixer.ts      - Multi-animation blending
├── AnimationState.ts      - State machine
├── AnimationClip.ts       - Clip editing utilities
├── Skeleton.ts            - Bone hierarchy
├── SkinnedMesh.ts         - GPU skinning data
├── MorphTargets.ts        - Blend shapes
├── AnimationSystem.ts     - ECS integration
└── index.ts               - Barrel exports
```

## Total Lines of Code

- **AnimationTrack.ts**: 687 lines
- **Animation.ts**: 678 lines
- **AnimationMixer.ts**: 804 lines
- **Skeleton.ts**: 613 lines
- **SkinnedMesh.ts**: 497 lines
- **MorphTargets.ts**: 564 lines
- **AnimationClip.ts**: 537 lines
- **AnimationState.ts**: 503 lines
- **AnimationSystem.ts**: 333 lines
- **index.ts**: 121 lines
- **Total**: 5,337 lines

All files include:
- Full TypeScript type safety
- Comprehensive JSDoc documentation
- Multiple usage examples
- Zero TODOs or placeholders
- Production-ready implementations
