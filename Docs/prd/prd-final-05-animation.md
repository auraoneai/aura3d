# G3D 5.0 PRD – Part 5: Animation

**Parent Document:** `PRD-Final-00-Overview.md`

---

## 11. Animation System

---

## 11.1 `src/animation/` – Animation System

### Directory Structure

```
src/animation/
├── AnimationSystem.ts
├── AnimationClip.ts
├── AnimationMixer.ts
├── AnimationStateMachine.ts
├── BlendTree.ts
├── BlendNode.ts
├── AnimationLayer.ts
├── MotionMatchingSystem.ts
├── MotionDatabase.ts
├── MotionMatcher.ts
├── KDTree.ts
├── MotionFeatures.ts
├── TrajectoryGenerator.ts
├── FootIKSolver.ts
├── ProceduralAnimationSystem.ts
├── LocomotionGenerator.ts
├── SecondaryMotionSystem.ts
├── BreathingGenerator.ts
├── SpringBoneSystem.ts
├── SpringBoneChain.ts
├── IK/
│   ├── CCDSolver.ts
│   ├── FABRIKSolver.ts
│   ├── TwoBoneIKSolver.ts
│   └── FullBodyIKSolver.ts
├── facial/
│   ├── FacialAnimationSystem.ts
│   ├── BlendShapeController.ts
│   ├── FacialRig.ts
│   ├── ExpressionLibrary.ts
│   └── LipSyncSystem.ts
├── hand/
│   ├── HandPoseGenerator.ts
│   ├── FingerIKSolver.ts
│   ├── GripTypeSolver.ts
│   └── GestureLibrary.ts
├── mocap/
│   ├── MocapImporter.ts
│   ├── MocapRetargeting.ts
│   └── MocapTools.ts
├── ml/
│   ├── MLAnimationSystem.ts
│   ├── TextToMotion.ts
│   └── MotionData.ts
└── index.ts
```

---

### 11.1.1 `src/animation/AnimationSystem.ts`

**Role:** Main animation update and coordination system.

**Public API:**
```typescript
class AnimationSystem {
  // Lifecycle
  initialize(): void;
  update(world: World, dt: number): void;
  dispose(): void;

  // Mixers
  createMixer(skeleton: Skeleton): AnimationMixer;
  destroyMixer(mixer: AnimationMixer): void;

  // Global control
  setGlobalTimeScale(scale: number): void;
  pauseAll(): void;
  resumeAll(): void;

  // Statistics
  get activeMixerCount(): number;
  get totalClipCount(): number;
}
```

**Dependencies:**
- Depends on: `AnimationMixer`, `AnimationClip`, `Skeleton`
- Depended by: `Engine`, `AnimationStateComponent`

**Implementation Checklist:**
- [ ] Per-entity animation mixer management
- [ ] Global time scaling
- [ ] Pause/resume functionality
- [ ] Efficient batch updates
- [ ] Skeleton transform output
- [ ] Event dispatch (animation events)
- [ ] **Performance:** 1000 animated characters @ 60 FPS
- [ ] **Tests:** Lifecycle, batch processing

---

### 11.1.2 `src/animation/AnimationClip.ts`

**Role:** Container for keyframe animation data.

**Public API:**
```typescript
class AnimationClip {
  readonly name: string;
  readonly duration: number;
  readonly tracks: AnimationTrack[];

  // Metadata
  readonly frameRate: number;
  readonly loop: boolean;
  readonly rootMotion: boolean;

  // Access
  getTrack(targetPath: string): AnimationTrack | undefined;
  sample(time: number): SampledPose;

  // Events
  readonly events: AnimationEvent[];

  // Factory
  static fromJSON(data: AnimationClipData): AnimationClip;
  toJSON(): AnimationClipData;
}

interface AnimationTrack {
  targetPath: string;   // e.g., "Hips/Spine/Chest/Head"
  property: 'position' | 'rotation' | 'scale' | 'weights';
  times: Float32Array;
  values: Float32Array;
  interpolation: 'linear' | 'step' | 'cubicspline';
}

interface AnimationEvent {
  time: number;
  name: string;
  data?: any;
}
```

**Dependencies:**
- Depends on: `Vector3`, `Quaternion`
- Depended by: `AnimationMixer`, asset loading

**Implementation Checklist:**
- [ ] Multi-track keyframe storage
- [ ] Position, rotation, scale tracks
- [ ] Blend shape weight tracks
- [ ] Linear, step, cubic spline interpolation
- [ ] Root motion extraction
- [ ] Animation events at timestamps
- [ ] Binary and JSON serialization
- [ ] Clip trimming and splitting utilities
- [ ] **Tests:** Interpolation accuracy, serialization

---

### 11.1.3 `src/animation/AnimationMixer.ts`

**Role:** Blends and plays animations on a skeleton.

**Public API:**
```typescript
class AnimationMixer {
  readonly skeleton: Skeleton;

  // Playback
  play(clip: AnimationClip, options?: PlayOptions): AnimationAction;
  stop(action: AnimationAction): void;
  stopAll(): void;

  // Actions
  getAction(clip: AnimationClip): AnimationAction | undefined;
  get actions(): AnimationAction[];

  // Update
  update(dt: number): void;

  // Output
  getPose(): SkeletonPose;
  getRootMotionDelta(): { position: Vector3; rotation: Quaternion };

  // Events
  onAnimationEnd: Signal<(action: AnimationAction) => void>;
  onAnimationLoop: Signal<(action: AnimationAction) => void>;
  onAnimationEvent: Signal<(event: AnimationEvent, action: AnimationAction) => void>;
}

interface PlayOptions {
  loop?: boolean | number;  // true, false, or loop count
  speed?: number;
  fadeIn?: number;
  weight?: number;
  layer?: number;
}

class AnimationAction {
  readonly clip: AnimationClip;
  readonly mixer: AnimationMixer;

  // State
  playing: boolean;
  paused: boolean;
  time: number;
  weight: number;
  speed: number;

  // Control
  play(): this;
  pause(): this;
  stop(): this;
  reset(): this;
  fadeIn(duration: number): this;
  fadeOut(duration: number): this;
  crossFadeTo(action: AnimationAction, duration: number): this;
  setLoop(mode: LoopMode, count?: number): this;
}

enum LoopMode { ONCE, LOOP, PING_PONG }
```

**Dependencies:**
- Depends on: `AnimationClip`, `Skeleton`, `AnimationAction`
- Depended by: `AnimationSystem`

**Implementation Checklist:**
- [ ] Multiple simultaneous actions
- [ ] Per-action weight and speed
- [ ] Smooth fade in/out
- [ ] Cross-fade between animations
- [ ] Layered animation support
- [ ] Root motion delta extraction
- [ ] Animation event dispatch
- [ ] Loop modes (once, loop, ping-pong)
- [ ] **Performance:** 10 actions per mixer, 100 mixers < 5ms
- [ ] **Tests:** Blending, cross-fade, events

---

### 11.1.4 `src/animation/AnimationStateMachine.ts`

**Role:** State-based animation control with transitions.

**Public API:**
```typescript
class AnimationStateMachine {
  readonly mixer: AnimationMixer;

  // Definition
  addState(name: string, clip: AnimationClip | BlendTree): AnimationState;
  removeState(name: string): void;
  addTransition(from: string, to: string, config: TransitionConfig): Transition;

  // Parameters
  setParameter(name: string, value: number | boolean): void;
  getParameter(name: string): number | boolean;

  // Control
  setState(name: string): void;
  get currentState(): AnimationState;
  get nextState(): AnimationState | null;
  get transitionProgress(): number;

  // Update
  update(dt: number): void;
}

interface AnimationState {
  name: string;
  clip: AnimationClip | BlendTree;
  speed: number;
  loop: boolean;
}

interface TransitionConfig {
  duration: number;
  exitTime?: number;         // 0-1, when transition can start
  hasExitTime: boolean;
  conditions: TransitionCondition[];
}

interface TransitionCondition {
  parameter: string;
  comparison: 'greater' | 'less' | 'equals' | 'notEquals';
  threshold: number | boolean;
}
```

**Dependencies:**
- Depends on: `AnimationMixer`, `AnimationClip`, `BlendTree`
- Depended by: `AnimationStateComponent`

**Implementation Checklist:**
- [ ] State graph definition
- [ ] Automatic transitions via conditions
- [ ] Parameter-driven control
- [ ] Exit time constraints
- [ ] Interruption rules
- [ ] Sub-state machines (hierarchical)
- [ ] Any-state transitions
- [ ] **Tests:** State transitions, conditions

---

### 11.1.5 `src/animation/BlendTree.ts`

**Role:** Parametric animation blending.

**Public API:**
```typescript
class BlendTree {
  readonly type: BlendTreeType;
  readonly children: BlendNode[];
  readonly parameter: string;
  readonly parameterY?: string;  // For 2D

  // Evaluation
  evaluate(params: Map<string, number>): SampledPose;

  // Building
  addChild(node: BlendNode, threshold: number, thresholdY?: number): void;
  removeChild(node: BlendNode): void;
}

type BlendTreeType = '1D' | '2D_SimpleDirectional' | '2D_FreeformDirectional' | '2D_FreeformCartesian' | 'Direct';

interface BlendNode {
  clip?: AnimationClip;
  tree?: BlendTree;  // Nested blend tree
  threshold: number;
  thresholdY?: number;
  weight: number;    // Computed
}
```

**Dependencies:**
- Depends on: `AnimationClip`
- Depended by: `AnimationStateMachine`

**Implementation Checklist:**
- [ ] 1D linear blending
- [ ] 2D blending modes:
  - [ ] Simple directional (normalized)
  - [ ] Freeform directional
  - [ ] Freeform Cartesian
- [ ] Direct weight control
- [ ] Nested blend trees
- [ ] Weight normalization
- [ ] **Tests:** All blend modes, edge cases

---

### 11.1.6 `src/animation/AnimationLayer.ts`

**Role:** Additive and override animation layers.

**Public API:**
```typescript
class AnimationLayer {
  readonly name: string;
  readonly mixer: AnimationMixer;

  // Configuration
  weight: number;
  blendMode: 'override' | 'additive';
  mask: AvatarMask | null;

  // Actions on this layer
  play(clip: AnimationClip, options?: PlayOptions): AnimationAction;
  get activeActions(): AnimationAction[];
}

interface AvatarMask {
  name: string;
  includedBones: string[];  // Bone paths
}
```

**Dependencies:**
- Depends on: `AnimationMixer`, `AnimationAction`
- Depended by: Upper/lower body splits, facial layers

**Implementation Checklist:**
- [ ] Per-layer weight
- [ ] Override mode (replaces base)
- [ ] Additive mode (adds to base)
- [ ] Avatar mask for partial body
- [ ] Mask inversion
- [ ] **Tests:** Layer blending, masking

---

## 11.2 Motion Matching

### 11.2.1 `src/animation/MotionMatchingSystem.ts`

**Role:** Data-driven motion matching for responsive animation.

**Public API:**
```typescript
class MotionMatchingSystem {
  // Configuration
  readonly database: MotionDatabase;
  readonly config: MotionMatchingConfig;

  // Lifecycle
  initialize(database: MotionDatabase, config: MotionMatchingConfig): void;
  update(dt: number): void;
  dispose(): void;

  // Control
  setDesiredTrajectory(trajectory: TrajectoryPoint[]): void;
  setCurrentPose(pose: SkeletonPose): void;

  // Output
  getCurrentAnimation(): AnimationClip;
  getCurrentTime(): number;
  getMatchCost(): number;

  // Debug
  getMatchedFeature(): MotionFeature;
  getSearchResults(): MotionSearchResult[];
}

interface MotionMatchingConfig {
  updateRate: number;           // Hz
  transitionCost: number;
  trajectoryWeight: number;
  poseWeight: number;
  velocityWeight: number;
  responsiveness: number;
}

interface TrajectoryPoint {
  time: number;
  position: Vector3;
  facing: Vector3;
}
```

**Dependencies:**
- Depends on: `MotionDatabase`, `MotionMatcher`, `KDTree`, `TrajectoryGenerator`
- Depended by: `MotionMatchingComponent`

**Implementation Checklist:**
- [ ] Real-time motion database search
- [ ] Trajectory matching (future path)
- [ ] Pose matching (current pose)
- [ ] Velocity matching
- [ ] Transition cost to avoid jitter
- [ ] Configurable update rate
- [ ] Warm starting from current frame
- [ ] **Performance:** 10k database poses, search < 1ms
- [ ] **Tests:** Match quality, transitions

---

### 11.2.2 `src/animation/MotionDatabase.ts`

**Role:** Preprocessed motion data for matching.

**Public API:**
```typescript
class MotionDatabase {
  // Loading
  static build(clips: AnimationClip[], config: DatabaseConfig): Promise<MotionDatabase>;
  static load(url: string): Promise<MotionDatabase>;
  save(): ArrayBuffer;

  // Access
  get poseCount(): number;
  get clipCount(): number;
  getPose(index: number): MotionPose;
  getFeature(index: number): MotionFeature;

  // Metadata
  get tags(): string[];
  getPosesWithTag(tag: string): number[];
}

interface DatabaseConfig {
  sampleRate: number;
  trajectoryPrediction: number[];  // Time offsets for trajectory points
  featureWeights: FeatureWeights;
}

interface MotionPose {
  clipIndex: number;
  frameIndex: number;
  time: number;
  bonePositions: Float32Array;
  boneVelocities: Float32Array;
}

interface MotionFeature {
  trajectory: Float32Array;     // Future trajectory points
  leftFootPos: Vector3;
  rightFootPos: Vector3;
  leftFootVel: Vector3;
  rightFootVel: Vector3;
  hipVelocity: Vector3;
}
```

**Dependencies:**
- Depends on: `AnimationClip`, `MotionFeatures`
- Depended by: `MotionMatchingSystem`

**Implementation Checklist:**
- [ ] Database building from clips
- [ ] Feature extraction at each frame
- [ ] KD-tree construction for fast search
- [ ] Binary serialization for fast loading
- [ ] Tag system for filtering
- [ ] Memory-efficient storage
- [ ] **Tests:** Build process, serialization

---

### 11.2.3 `src/animation/MotionMatcher.ts`

**Role:** Core matching algorithm.

**Public API:**
```typescript
class MotionMatcher {
  // Search
  findBestMatch(
    query: MotionFeature,
    database: MotionDatabase,
    currentPoseIndex: number,
    config: MotionMatchingConfig
  ): MotionSearchResult;

  findKNearest(
    query: MotionFeature,
    database: MotionDatabase,
    k: number
  ): MotionSearchResult[];
}

interface MotionSearchResult {
  poseIndex: number;
  cost: number;
  trajectoryCost: number;
  poseCost: number;
  transitionCost: number;
}
```

**Dependencies:**
- Depends on: `KDTree`, `MotionDatabase`
- Depended by: `MotionMatchingSystem`

**Implementation Checklist:**
- [ ] KD-tree nearest neighbor search
- [ ] Weighted feature distance
- [ ] Transition cost from current pose
- [ ] Tag filtering during search
- [ ] Batch search optimization
- [ ] **Performance:** < 0.5ms per search

---

### 11.2.4 `src/animation/KDTree.ts`

**Role:** K-dimensional tree for fast nearest neighbor search.

**Public API:**
```typescript
class KDTree {
  constructor(points: Float32Array, dimensions: number);

  // Queries
  nearest(query: Float32Array): { index: number; distance: number };
  kNearest(query: Float32Array, k: number): { index: number; distance: number }[];
  radiusSearch(query: Float32Array, radius: number): number[];

  // Serialization
  serialize(): ArrayBuffer;
  static deserialize(data: ArrayBuffer): KDTree;
}
```

**Implementation Checklist:**
- [ ] Balanced tree construction
- [ ] Efficient nearest neighbor
- [ ] K-nearest neighbors
- [ ] Radius search
- [ ] Binary serialization
- [ ] **Performance:** Search in O(log n)

---

### 11.2.5 `src/animation/TrajectoryGenerator.ts`

**Role:** Generates desired trajectory from input.

**Public API:**
```typescript
class TrajectoryGenerator {
  // Configuration
  predictionHorizon: number;
  sampleCount: number;

  // Generation
  generateFromInput(
    inputDirection: Vector2,
    currentPosition: Vector3,
    currentFacing: Vector3,
    speed: number
  ): TrajectoryPoint[];

  generateFromNavPath(
    path: Vector3[],
    currentPosition: Vector3,
    speed: number
  ): TrajectoryPoint[];
}
```

**Implementation Checklist:**
- [ ] Player input to trajectory
- [ ] Navigation path to trajectory
- [ ] Smooth trajectory interpolation
- [ ] Configurable prediction horizon

---

### 11.2.6 `src/animation/FootIKSolver.ts`

**Role:** Foot placement IK for ground adaptation.

**Public API:**
```typescript
class FootIKSolver {
  // Configuration
  raycastOffset: number;
  maxStepHeight: number;
  footRotationWeight: number;

  // Solve
  solve(
    skeleton: Skeleton,
    leftFootBone: string,
    rightFootBone: string,
    groundRaycast: (origin: Vector3) => RaycastHit | null
  ): void;

  // State
  get leftFootGrounded(): boolean;
  get rightFootGrounded(): boolean;
  get hipOffset(): number;
}
```

**Dependencies:**
- Depends on: `TwoBoneIKSolver`, physics raycast
- Depended by: `MotionMatchingSystem`, locomotion

**Implementation Checklist:**
- [ ] Ground height detection via raycast
- [ ] Foot placement adjustment
- [ ] Hip height adjustment
- [ ] Foot rotation to match ground normal
- [ ] Smooth transitions
- [ ] **Tests:** Various terrain

---

## 11.3 Procedural Animation

### 11.3.1 `src/animation/ProceduralAnimationSystem.ts`

**Role:** Runtime-generated animations.

**Public API:**
```typescript
class ProceduralAnimationSystem {
  // Generators
  readonly locomotion: LocomotionGenerator;
  readonly secondary: SecondaryMotionSystem;
  readonly breathing: BreathingGenerator;

  // Update
  update(skeleton: Skeleton, dt: number): void;

  // Blend with animation
  applyProcedural(pose: SkeletonPose, weight: number): SkeletonPose;
}
```

**Dependencies:**
- Depends on: `LocomotionGenerator`, `SecondaryMotionSystem`, `BreathingGenerator`
- Depended by: `AnimationSystem`

**Implementation Checklist:**
- [ ] Modular procedural generators
- [ ] Blending with keyframed animation
- [ ] Per-bone weight control
- [ ] **Tests:** Visual quality

---

### 11.3.2 `src/animation/LocomotionGenerator.ts`

**Role:** Procedural locomotion cycles.

**Public API:**
```typescript
class LocomotionGenerator {
  // Configuration
  strideLength: number;
  strideHeight: number;
  bodyBob: number;
  armSwing: number;

  // Generation
  generate(
    skeleton: Skeleton,
    speed: number,
    direction: Vector3,
    phase: number
  ): SkeletonPose;
}
```

**Implementation Checklist:**
- [ ] Cyclic leg movement
- [ ] Speed-based stride adjustment
- [ ] Body vertical oscillation
- [ ] Arm swing counter-rotation
- [ ] Direction-based lean

---

### 11.3.3 `src/animation/SpringBoneSystem.ts`

**Role:** Physics-based secondary bone motion.

**Public API:**
```typescript
class SpringBoneSystem {
  // Chain management
  addChain(chain: SpringBoneChain): void;
  removeChain(chain: SpringBoneChain): void;

  // Update
  update(dt: number): void;

  // Configuration
  setGlobalStiffness(value: number): void;
  setGlobalDamping(value: number): void;
  setGravity(gravity: Vector3): void;
}

class SpringBoneChain {
  readonly rootBone: string;
  readonly bones: string[];

  // Per-bone settings
  stiffness: number;
  damping: number;
  gravity: number;
  wind: Vector3;

  // Collision
  addCollider(shape: CollisionShape, bonePath: string): void;
  removeCollider(shape: CollisionShape): void;
}
```

**Dependencies:**
- Depends on: `Skeleton`, `CollisionShape`
- Depended by: Hair, cloth, tails, accessories

**Implementation Checklist:**
- [ ] Verlet integration for bones
- [ ] Stiffness and damping per bone
- [ ] Gravity and wind forces
- [ ] Sphere collider support
- [ ] Chain constraints (length, angle)
- [ ] **Performance:** 100 chains @ 60 FPS
- [ ] **Tests:** Stability, collision

---

## 11.4 Inverse Kinematics

### 11.4.1 `src/animation/IK/TwoBoneIKSolver.ts`

**Role:** Fast two-bone IK for limbs.

**Public API:**
```typescript
class TwoBoneIKSolver {
  // Solve
  solve(
    root: Transform,
    mid: Transform,
    end: Transform,
    target: Vector3,
    hint: Vector3,     // Pole vector
    weight: number
  ): void;
}
```

**Implementation Checklist:**
- [ ] Analytical two-bone solution
- [ ] Pole vector (elbow/knee direction)
- [ ] Weight blending
- [ ] Handle unreachable targets
- [ ] **Performance:** < 0.01ms per solve

---

### 11.4.2 `src/animation/IK/FABRIKSolver.ts`

**Role:** Multi-bone IK using FABRIK algorithm.

**Public API:**
```typescript
class FABRIKSolver {
  // Configuration
  iterations: number;
  tolerance: number;

  // Solve
  solve(
    chain: Transform[],
    target: Vector3,
    constraints?: JointConstraint[]
  ): void;
}

interface JointConstraint {
  type: 'hinge' | 'ball' | 'twist';
  axis?: Vector3;
  minAngle?: number;
  maxAngle?: number;
}
```

**Implementation Checklist:**
- [ ] Forward and backward reaching
- [ ] Convergence tolerance
- [ ] Joint constraints (angle limits)
- [ ] Multiple end effectors
- [ ] **Performance:** 10-bone chain < 0.1ms

---

### 11.4.3 `src/animation/IK/CCDSolver.ts`

**Role:** Cyclic Coordinate Descent IK.

**Public API:**
```typescript
class CCDSolver {
  iterations: number;
  damping: number;

  solve(
    chain: Transform[],
    target: Vector3,
    constraints?: JointConstraint[]
  ): void;
}
```

**Implementation Checklist:**
- [ ] Per-joint rotation toward target
- [ ] Damping for stability
- [ ] Joint limits
- [ ] Root motion option

---

### 11.4.4 `src/animation/IK/FullBodyIKSolver.ts`

**Role:** Full body IK with multiple targets.

**Public API:**
```typescript
class FullBodyIKSolver {
  // Targets
  setTarget(effector: string, position: Vector3, rotation?: Quaternion, weight?: number): void;
  clearTarget(effector: string): void;

  // Built-in effectors
  readonly effectors: {
    leftHand: string;
    rightHand: string;
    leftFoot: string;
    rightFoot: string;
    head: string;
    hips: string;
  };

  // Solve
  solve(skeleton: Skeleton): void;

  // Configuration
  spineStiffness: number;
  pullBodyVertical: number;
}
```

**Dependencies:**
- Depends on: `TwoBoneIKSolver`, `FABRIKSolver`, `Skeleton`
- Depended by: VR body, climbing, interaction

**Implementation Checklist:**
- [ ] Multiple simultaneous IK targets
- [ ] Spine chain solving
- [ ] Hip positioning for balance
- [ ] Look-at constraint for head
- [ ] Configurable effector weighting
- [ ] **Performance:** Full body < 1ms

---

## 11.5 Facial Animation

### 11.5.1 `src/animation/facial/FacialAnimationSystem.ts`

**Role:** Coordinates facial animation components.

**Public API:**
```typescript
class FacialAnimationSystem {
  // Components
  readonly blendShapes: BlendShapeController;
  readonly lipSync: LipSyncSystem;
  readonly expressions: ExpressionLibrary;

  // Update
  update(dt: number): void;

  // Control
  setExpression(name: string, weight: number, transitionTime: number): void;
  speak(audioBuffer: AudioBuffer): void;
  blink(): void;
}
```

**Dependencies:**
- Depends on: `BlendShapeController`, `LipSyncSystem`, `ExpressionLibrary`
- Depended by: `FacialRigComponent`

**Implementation Checklist:**
- [ ] Blend shape animation
- [ ] Expression library
- [ ] Lip sync integration
- [ ] Procedural blink
- [ ] Eye gaze control
- [ ] Micro-expression system

---

### 11.5.2 `src/animation/facial/BlendShapeController.ts`

**Role:** Blend shape weight management.

**Public API:**
```typescript
class BlendShapeController {
  // Weight access
  setWeight(shapeName: string, weight: number): void;
  getWeight(shapeName: string): number;
  setWeights(weights: Map<string, number>): void;
  getAllWeights(): Map<string, number>;

  // Animation
  animateTo(shapeName: string, targetWeight: number, duration: number): void;

  // FACS
  setActionUnit(au: number, intensity: number): void;
  getActionUnit(au: number): number;
}
```

**Implementation Checklist:**
- [ ] Named blend shape control
- [ ] Batch weight setting
- [ ] Smooth weight animation
- [ ] FACS action unit mapping
- [ ] Corrective blend shapes
- [ ] **Performance:** 100 blend shapes < 0.5ms

---

### 11.5.3 `src/animation/facial/LipSyncSystem.ts`

**Role:** Audio-driven lip synchronization.

**Public API:**
```typescript
class LipSyncSystem {
  // Configuration
  readonly visemes: Map<string, string[]>;  // Viseme to blend shapes

  // Realtime
  processAudio(audioData: Float32Array, sampleRate: number): VisemeFrame[];
  processPhonemes(phonemes: Phoneme[]): VisemeFrame[];

  // Playback
  play(frames: VisemeFrame[]): void;
  stop(): void;

  // Update
  update(dt: number): void;
}

interface VisemeFrame {
  time: number;
  viseme: string;
  weight: number;
}

interface Phoneme {
  phone: string;
  start: number;
  end: number;
}
```

**Dependencies:**
- Depends on: `BlendShapeController`, audio analysis
- Depended by: `FacialAnimationSystem`

**Implementation Checklist:**
- [ ] Audio amplitude analysis (simple)
- [ ] Phoneme-to-viseme mapping
- [ ] Coarticulation (blending between visemes)
- [ ] Timing synchronization
- [ ] Pre-computed lip sync data support
- [ ] **Tests:** Sync accuracy

---

### 11.5.4 `src/animation/facial/ExpressionLibrary.ts`

**Role:** Predefined facial expressions.

**Public API:**
```typescript
class ExpressionLibrary {
  // Built-in expressions
  static readonly NEUTRAL: Expression;
  static readonly HAPPY: Expression;
  static readonly SAD: Expression;
  static readonly ANGRY: Expression;
  static readonly SURPRISED: Expression;
  static readonly DISGUSTED: Expression;
  static readonly FEARFUL: Expression;

  // Custom
  static register(name: string, expression: Expression): void;
  static get(name: string): Expression | undefined;
  static blend(a: Expression, b: Expression, t: number): Expression;
}

interface Expression {
  name: string;
  blendShapes: Map<string, number>;
  actionUnits?: Map<number, number>;
}
```

**Implementation Checklist:**
- [ ] 7 basic emotions
- [ ] Blend shape mappings
- [ ] FACS AU mappings
- [ ] Expression blending
- [ ] Custom expression registration

---

## 11.6 Hand Animation

### 11.6.1 `src/animation/hand/HandPoseGenerator.ts`

**Role:** Generates hand poses for interactions.

**Public API:**
```typescript
class HandPoseGenerator {
  // Pose generation
  generateGrip(
    hand: HandSkeleton,
    objectShape: CollisionShape,
    gripType: GripType
  ): HandPose;

  applyPose(hand: HandSkeleton, pose: HandPose, weight: number): void;

  // Blend
  blendPoses(poses: { pose: HandPose; weight: number }[]): HandPose;
}

enum GripType {
  POWER_GRIP,      // Full hand wrap
  PRECISION_GRIP,  // Thumb + fingers
  PINCH,           // Thumb + index
  FLAT,            // Palm down
  POINT,           // Index extended
  FIST,
  RELAXED
}

interface HandPose {
  fingerCurls: [number, number, number, number, number];  // Per finger
  fingerSpreads: [number, number, number, number, number];
  thumbOpposition: number;
  wristRotation: Quaternion;
}
```

**Dependencies:**
- Depends on: `FingerIKSolver`, `GripTypeSolver`
- Depended by: Interaction system

**Implementation Checklist:**
- [ ] Grip type definitions
- [ ] Object shape analysis
- [ ] Per-finger curl/spread
- [ ] Thumb opposition
- [ ] Pose blending
- [ ] **Tests:** Various object shapes

---

### 11.6.2 `src/animation/hand/GestureLibrary.ts`

**Role:** Predefined hand gestures.

**Public API:**
```typescript
class GestureLibrary {
  static readonly OPEN: HandPose;
  static readonly FIST: HandPose;
  static readonly POINT: HandPose;
  static readonly THUMBS_UP: HandPose;
  static readonly PEACE: HandPose;
  static readonly OK: HandPose;

  static register(name: string, pose: HandPose): void;
  static get(name: string): HandPose | undefined;
}
```

**Implementation Checklist:**
- [ ] Common gesture presets
- [ ] Custom gesture registration
- [ ] Gesture recognition helper

---

## 11.7 Motion Capture

### 11.7.1 `src/animation/mocap/MocapImporter.ts`

**Role:** Import motion capture data.

**Public API:**
```typescript
class MocapImporter {
  // Format support
  static importBVH(data: string | ArrayBuffer): MocapData;
  static importFBX(data: ArrayBuffer): MocapData;
  static importC3D(data: ArrayBuffer): MocapData;

  // Conversion
  static toAnimationClip(data: MocapData, skeleton: Skeleton): AnimationClip;
}

interface MocapData {
  frameRate: number;
  frameCount: number;
  markers: MocapMarker[];
  skeleton?: MocapSkeleton;
}
```

**Implementation Checklist:**
- [ ] BVH file parsing
- [ ] FBX animation extraction
- [ ] C3D marker data
- [ ] Frame rate conversion
- [ ] Skeleton mapping

---

### 11.7.2 `src/animation/mocap/MocapRetargeting.ts`

**Role:** Retarget motion to different skeletons.

**Public API:**
```typescript
class MocapRetargeting {
  // Mapping
  createMapping(source: Skeleton, target: Skeleton): RetargetMapping;
  editMapping(mapping: RetargetMapping, sourceBone: string, targetBone: string): void;

  // Retarget
  retarget(
    sourceClip: AnimationClip,
    mapping: RetargetMapping,
    targetSkeleton: Skeleton
  ): AnimationClip;
}

interface RetargetMapping {
  source: Skeleton;
  target: Skeleton;
  boneMapping: Map<string, string>;
  scaleCompensation: boolean;
}
```

**Implementation Checklist:**
- [ ] Automatic bone name matching
- [ ] Manual mapping override
- [ ] Scale compensation for different proportions
- [ ] Root motion handling
- [ ] **Tests:** Various skeleton pairs

---

## 11.8 ML Animation

### 11.8.1 `src/animation/ml/MLAnimationSystem.ts`

**Role:** Machine learning-based animation.

**Public API:**
```typescript
class MLAnimationSystem {
  // Model loading
  loadModel(modelPath: string): Promise<void>;
  unloadModel(): void;

  // Inference
  generatePose(input: MLAnimationInput): SkeletonPose;
  generateMotion(input: MLAnimationInput, duration: number): AnimationClip;

  // Control
  setStyle(style: string, weight: number): void;
}

interface MLAnimationInput {
  trajectory?: TrajectoryPoint[];
  targetPose?: SkeletonPose;
  textPrompt?: string;
  style?: string;
  context?: SkeletonPose[];  // Recent history
}
```

**Dependencies:**
- Depends on: ONNX runtime, `MotionData`
- Depended by: Experimental animation features

**Implementation Checklist:**
- [ ] ONNX model loading
- [ ] Real-time inference
- [ ] Trajectory conditioning
- [ ] Style transfer
- [ ] Text-to-motion (experimental)
- [ ] **Performance:** < 10ms inference

---

### 11.8.2 `src/animation/ml/TextToMotion.ts`

**Role:** Generate animation from text descriptions.

**Public API:**
```typescript
class TextToMotion {
  // Generation
  generate(prompt: string, duration: number): Promise<AnimationClip>;

  // Configuration
  setModel(modelPath: string): Promise<void>;
}
```

**Implementation Checklist:**
- [ ] Text encoding
- [ ] Motion generation model
- [ ] Post-processing (smoothing, IK fix-up)
- [ ] **Note:** Experimental feature

---

---

## Next Document

Continue to `PRD-Final-06-AI-ML.md` for AI and ML specifications.
