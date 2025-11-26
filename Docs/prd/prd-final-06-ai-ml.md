# G3D 5.0 PRD – Part 6: AI & ML Systems

**Parent Document:** `PRD-Final-00-Overview.md`

---

## 12. AI Systems

---

## 12.1 `src/ai/` – AI System Overview

### Directory Structure

```
src/ai/
├── AIManager.ts
├── navigation/
│   ├── NavMesh.ts
│   ├── NavMeshGenerator.ts
│   ├── NavAgent.ts
│   ├── PathFinder.ts
│   ├── PathFollower.ts
│   ├── ObstacleAvoidance.ts
│   ├── CrowdManager.ts
│   └── NavigationMeshVolume.ts
├── behavior/
│   ├── BehaviorTree.ts
│   ├── BTNode.ts
│   ├── BTComposite.ts
│   ├── BTDecorator.ts
│   ├── BTAction.ts
│   ├── BTCondition.ts
│   └── Blackboard.ts
├── fsm/
│   ├── StateMachine.ts
│   ├── State.ts
│   ├── Transition.ts
│   ├── StateCondition.ts
│   └── HierarchicalFSM.ts
├── steering/
│   ├── SteeringBehavior.ts
│   ├── Seek.ts
│   ├── Flee.ts
│   ├── Wander.ts
│   ├── Pursuit.ts
│   ├── Evade.ts
│   ├── Flock.ts
│   ├── Formation.ts
│   └── SteeringPipeline.ts
├── perception/
│   ├── SensorSystem.ts
│   ├── VisionSensor.ts
│   ├── HearingSensor.ts
│   ├── ProximitySensor.ts
│   └── MemorySystem.ts
├── planning/
│   ├── GOAPPlanner.ts
│   ├── HTNPlanner.ts
│   ├── UtilityAI.ts
│   └── DecisionTree.ts
├── ml/
│   ├── ONNXRuntimeWrapper.ts
│   ├── ModelManager.ts
│   ├── FeatureExtractor.ts
│   ├── PolicyNetwork.ts
│   ├── RewardFunction.ts
│   ├── BehaviorCloningAgent.ts
│   ├── RLAgent.ts
│   ├── NPCController.ts
│   ├── NeuralPathfinder.ts
│   └── NeuralArchitecture.ts
├── cultural/
│   ├── CulturalBehaviorSystem.ts
│   ├── Culture.ts
│   ├── SocialNormSystem.ts
│   ├── ProxemicsSystem.ts
│   ├── CommunicationStyleSystem.ts
│   ├── DecisionMakingSystem.ts
│   └── CulturePresets.ts
├── lsystem/
│   ├── LSystemManager.ts
│   ├── LSystemParser.ts
│   ├── DOLSystem.ts
│   ├── ContextSensitiveLSystem.ts
│   ├── StochasticLSystem.ts
│   ├── ParametricLSystem.ts
│   ├── TurtleInterpreter.ts
│   ├── BehaviorInterpreter.ts
│   ├── LSystemMeshGenerator.ts
│   └── GrammarLibrary.ts
├── computervision/
│   ├── CVSystem.ts
│   ├── ModelLoader.ts
│   ├── InferenceEngine.ts
│   ├── ImageClassifier.ts
│   ├── ObjectDetector.ts
│   ├── PoseEstimator.ts
│   ├── SceneAnalyzer.ts
│   ├── ObjectTracker.ts
│   └── Visualization.ts
├── balancing/
│   ├── BalancingSystem.ts
│   └── AppliedBalanceChange.ts
├── smart/
│   ├── SmartSystemsFramework.ts
│   ├── EventSystem.ts
│   ├── PlayerProfile.ts
│   ├── BehaviorAnalyzer.ts
│   ├── DifficultyAdjuster.ts
│   └── ContentGenerator.ts
└── index.ts
```

---

### 12.1.1 `src/ai/AIManager.ts`

**Role:** Central AI coordination and management.

**Public API:**
```typescript
class AIManager {
  // Lifecycle
  initialize(config: AIConfig): void;
  update(world: World, dt: number): void;
  dispose(): void;

  // Agent management
  createAgent(config: AgentConfig): AIAgent;
  destroyAgent(agent: AIAgent): void;
  getAgent(id: number): AIAgent | undefined;
  get agents(): AIAgent[];

  // Subsystems
  readonly navigation: CrowdManager;
  readonly perception: SensorSystem;
  readonly behavior: BehaviorTreeManager;

  // Global settings
  setUpdateBudget(ms: number): void;
  setLODDistances(near: number, far: number): void;
}

interface AIConfig {
  maxAgents: number;
  updateBudgetMs: number;
  enableCrowdSimulation: boolean;
  enablePerception: boolean;
  lodEnabled: boolean;
}

interface AIAgent {
  id: number;
  entity: Entity;
  navAgent: NavAgent | null;
  behaviorTree: BehaviorTree | null;
  stateMachine: StateMachine | null;
  blackboard: Blackboard;
}
```

**Dependencies:**
- Depends on: All AI subsystems
- Depended by: `Engine`, `AISystem`

**Implementation Checklist:**
- [ ] Agent lifecycle management
- [ ] Subsystem coordination
- [ ] Time-sliced updates for budget control
- [ ] LOD-based AI detail reduction
- [ ] Agent pooling
- [ ] **Performance:** 1000 agents @ 60 FPS
- [ ] **Tests:** Agent lifecycle, budget control

---

## 12.2 Navigation

### 12.2.1 `src/ai/navigation/NavMesh.ts`

**Role:** Navigation mesh data structure.

**Public API:**
```typescript
class NavMesh {
  // Mesh data
  readonly polygons: NavPolygon[];
  readonly vertices: Float32Array;
  readonly edges: NavEdge[];

  // Queries
  findNearestPolygon(point: Vector3): NavPolygon | null;
  findPath(start: Vector3, end: Vector3): Vector3[] | null;
  raycast(start: Vector3, end: Vector3): NavRaycastHit | null;
  getRandomPoint(): Vector3;
  getRandomPointInRadius(center: Vector3, radius: number): Vector3;

  // Area queries
  isPointOnMesh(point: Vector3): boolean;
  getPolyAt(point: Vector3): NavPolygon | null;

  // Serialization
  static fromJSON(data: NavMeshData): NavMesh;
  toJSON(): NavMeshData;
}

interface NavPolygon {
  id: number;
  vertices: number[];    // Indices into vertex array
  neighbors: number[];   // Adjacent polygon IDs
  center: Vector3;
  normal: Vector3;
  area: number;
  flags: number;         // Area type flags
}

interface NavEdge {
  polygonA: number;
  polygonB: number;
  vertexA: number;
  vertexB: number;
  width: number;
}
```

**Dependencies:**
- Depends on: `Vector3`
- Depended by: `PathFinder`, `NavAgent`

**Implementation Checklist:**
- [ ] Polygon soup representation
- [ ] Adjacency graph for pathfinding
- [ ] Spatial acceleration (octree/grid)
- [ ] Point-on-mesh queries
- [ ] Random point generation
- [ ] Area type annotations
- [ ] Binary serialization
- [ ] **Tests:** Query correctness

---

### 12.2.2 `src/ai/navigation/NavMeshGenerator.ts`

**Role:** Generates navigation mesh from geometry.

**Public API:**
```typescript
class NavMeshGenerator {
  // Configuration
  readonly config: NavMeshGeneratorConfig;

  // Generation
  generate(meshes: Mesh[]): NavMesh;
  generateAsync(meshes: Mesh[]): Promise<NavMesh>;

  // Incremental
  addGeometry(mesh: Mesh): void;
  removeGeometry(mesh: Mesh): void;
  rebuild(): NavMesh;
}

interface NavMeshGeneratorConfig {
  cellSize: number;           // Voxel size
  cellHeight: number;
  agentHeight: number;
  agentRadius: number;
  agentMaxClimb: number;      // Step height
  agentMaxSlope: number;      // Degrees
  regionMinSize: number;
  regionMergeSize: number;
  edgeMaxLen: number;
  edgeMaxError: number;
  vertsPerPoly: number;       // Max vertices per polygon
  detailSampleDist: number;
  detailSampleMaxError: number;
}
```

**Dependencies:**
- Depends on: `NavMesh`, geometry data
- Depended by: Level loading, editor

**Implementation Checklist:**
- [ ] Voxelization of input geometry
- [ ] Heightfield generation
- [ ] Walkable area filtering
- [ ] Region generation (watershed)
- [ ] Contour tracing
- [ ] Polygon mesh generation
- [ ] Detail mesh generation
- [ ] Off-mesh link support
- [ ] Multi-threaded generation
- [ ] **Performance:** 1M triangles < 10s
- [ ] **Tests:** Various geometry types

---

### 12.2.3 `src/ai/navigation/NavAgent.ts`

**Role:** Individual navigation agent.

**Public API:**
```typescript
class NavAgent {
  readonly id: number;

  // Configuration
  radius: number;
  height: number;
  maxSpeed: number;
  maxAcceleration: number;
  separationWeight: number;

  // State
  get position(): Vector3;
  get velocity(): Vector3;
  get targetPosition(): Vector3 | null;
  get isNavigating(): boolean;
  get remainingDistance(): number;

  // Control
  setDestination(target: Vector3): boolean;
  stop(): void;
  warp(position: Vector3): void;

  // Path access
  get currentPath(): Vector3[] | null;
  get nextCorner(): Vector3 | null;

  // Events
  onDestinationReached: Signal<() => void>;
  onPathInvalid: Signal<() => void>;
}
```

**Dependencies:**
- Depends on: `NavMesh`, `PathFinder`, `PathFollower`
- Depended by: `CrowdManager`, game logic

**Implementation Checklist:**
- [ ] Position and velocity state
- [ ] Destination setting
- [ ] Path request and storage
- [ ] Movement parameters
- [ ] Event callbacks
- [ ] Obstacle avoidance integration

---

### 12.2.4 `src/ai/navigation/PathFinder.ts`

**Role:** A* pathfinding on navigation mesh.

**Public API:**
```typescript
class PathFinder {
  // Pathfinding
  findPath(
    navMesh: NavMesh,
    start: Vector3,
    end: Vector3,
    filter?: NavQueryFilter
  ): PathResult;

  findPathAsync(
    navMesh: NavMesh,
    start: Vector3,
    end: Vector3,
    filter?: NavQueryFilter
  ): Promise<PathResult>;

  // Partial paths (for long distances)
  findPartialPath(
    navMesh: NavMesh,
    start: Vector3,
    end: Vector3,
    maxNodes: number
  ): PathResult;
}

interface PathResult {
  success: boolean;
  path: Vector3[];
  polygonPath: number[];
  cost: number;
}

interface NavQueryFilter {
  includeFlags: number;
  excludeFlags: number;
  areaCosts: Map<number, number>;
}
```

**Dependencies:**
- Depends on: `NavMesh`
- Depended by: `NavAgent`

**Implementation Checklist:**
- [ ] A* implementation on polygon graph
- [ ] String pulling (funnel algorithm)
- [ ] Area cost weighting
- [ ] Flag-based filtering
- [ ] Partial path for incomplete searches
- [ ] Async with cancellation
- [ ] **Performance:** 10k polygons, path < 1ms

---

### 12.2.5 `src/ai/navigation/CrowdManager.ts`

**Role:** Manages multiple agents with collision avoidance.

**Public API:**
```typescript
class CrowdManager {
  // Configuration
  readonly config: CrowdConfig;

  // Agent management
  addAgent(position: Vector3, config: AgentConfig): NavAgent;
  removeAgent(agent: NavAgent): void;
  get agentCount(): number;
  getAgents(): NavAgent[];

  // Update
  update(dt: number): void;

  // Queries
  getNearbyAgents(position: Vector3, radius: number): NavAgent[];
}

interface CrowdConfig {
  maxAgents: number;
  maxAgentRadius: number;
  navMesh: NavMesh;
  obstacleAvoidanceType: 'rvo' | 'orca' | 'simple';
}
```

**Dependencies:**
- Depends on: `NavMesh`, `NavAgent`, `ObstacleAvoidance`
- Depended by: `AIManager`

**Implementation Checklist:**
- [ ] Batch agent updates
- [ ] RVO/ORCA collision avoidance
- [ ] Spatial hashing for neighbor queries
- [ ] Velocity obstacle computation
- [ ] Agent priority system
- [ ] **Performance:** 1000 agents @ 60 FPS
- [ ] **Tests:** Collision avoidance, throughput

---

### 12.2.6 `src/ai/navigation/ObstacleAvoidance.ts`

**Role:** Velocity obstacle-based avoidance.

**Public API:**
```typescript
class ObstacleAvoidance {
  // Algorithms
  static computeRVO(
    agent: NavAgent,
    neighbors: NavAgent[],
    obstacles: Obstacle[],
    desiredVelocity: Vector3,
    dt: number
  ): Vector3;

  static computeORCA(
    agent: NavAgent,
    neighbors: NavAgent[],
    obstacles: Obstacle[],
    desiredVelocity: Vector3,
    dt: number
  ): Vector3;
}

interface Obstacle {
  type: 'segment' | 'circle';
  points: Vector3[];
  radius?: number;
}
```

**Implementation Checklist:**
- [ ] Reciprocal Velocity Obstacles (RVO)
- [ ] Optimal Reciprocal Collision Avoidance (ORCA)
- [ ] Static obstacle handling
- [ ] Line obstacle support
- [ ] **Tests:** Various scenarios

---

## 12.3 Behavior Trees

### 12.3.1 `src/ai/behavior/BehaviorTree.ts`

**Role:** Behavior tree execution and management.

**Public API:**
```typescript
class BehaviorTree {
  readonly root: BTNode;
  readonly blackboard: Blackboard;

  // Execution
  tick(): BTStatus;
  reset(): void;

  // State
  get status(): BTStatus;
  get currentNode(): BTNode | null;

  // Building
  static fromJSON(data: BTData): BehaviorTree;
  toJSON(): BTData;
}

enum BTStatus {
  SUCCESS,
  FAILURE,
  RUNNING
}
```

**Dependencies:**
- Depends on: `BTNode`, `Blackboard`
- Depended by: `AIAgent`, `AISystem`

**Implementation Checklist:**
- [ ] Root node execution
- [ ] Status propagation
- [ ] Running node continuation
- [ ] Tree reset
- [ ] JSON serialization
- [ ] Visual debugging data
- [ ] **Tests:** All node types

---

### 12.3.2 `src/ai/behavior/BTNode.ts`

**Role:** Base behavior tree node.

**Public API:**
```typescript
abstract class BTNode {
  readonly id: string;
  readonly name: string;
  parent: BTNode | null;

  // Execution
  abstract tick(context: BTContext): BTStatus;
  onEnter?(context: BTContext): void;
  onExit?(context: BTContext): void;

  // State
  status: BTStatus;
}

interface BTContext {
  blackboard: Blackboard;
  entity: Entity;
  world: World;
  dt: number;
}
```

**Implementation Checklist:**
- [ ] Lifecycle hooks (enter, exit)
- [ ] Status tracking
- [ ] Context access
- [ ] Debug info

---

### 12.3.3 `src/ai/behavior/BTComposite.ts`

**Role:** Composite nodes (Sequence, Selector, Parallel).

**Public API:**
```typescript
class BTSequence extends BTNode {
  children: BTNode[];
  tick(context: BTContext): BTStatus;  // All must succeed
}

class BTSelector extends BTNode {
  children: BTNode[];
  tick(context: BTContext): BTStatus;  // First success wins
}

class BTParallel extends BTNode {
  children: BTNode[];
  policy: 'requireOne' | 'requireAll';
  tick(context: BTContext): BTStatus;
}

class BTRandomSelector extends BTNode {
  children: BTNode[];
  weights?: number[];
  tick(context: BTContext): BTStatus;
}
```

**Implementation Checklist:**
- [ ] Sequence (AND logic)
- [ ] Selector (OR logic)
- [ ] Parallel (concurrent)
- [ ] Random selector
- [ ] Child iteration state preservation
- [ ] **Tests:** All composite types

---

### 12.3.4 `src/ai/behavior/BTDecorator.ts`

**Role:** Decorator nodes that modify child behavior.

**Public API:**
```typescript
class BTInverter extends BTNode {
  child: BTNode;
  // Inverts child result
}

class BTRepeater extends BTNode {
  child: BTNode;
  repeatCount: number;  // -1 for infinite
}

class BTSucceeder extends BTNode {
  child: BTNode;
  // Always returns SUCCESS
}

class BTUntilFail extends BTNode {
  child: BTNode;
  // Repeats until child fails
}

class BTCooldown extends BTNode {
  child: BTNode;
  cooldownTime: number;
}

class BTTimeLimit extends BTNode {
  child: BTNode;
  timeLimit: number;
}
```

**Implementation Checklist:**
- [ ] Inverter
- [ ] Repeater (count and infinite)
- [ ] Force succeeder/failer
- [ ] Until fail/success
- [ ] Cooldown timer
- [ ] Time limit

---

### 12.3.5 `src/ai/behavior/BTAction.ts`

**Role:** Leaf action nodes.

**Public API:**
```typescript
abstract class BTAction extends BTNode {
  abstract execute(context: BTContext): BTStatus;
  tick(context: BTContext): BTStatus {
    return this.execute(context);
  }
}

// Built-in actions
class BTWait extends BTAction {
  duration: number;
}

class BTMoveTo extends BTAction {
  targetKey: string;  // Blackboard key
}

class BTPlayAnimation extends BTAction {
  animationName: string;
}

class BTSetBlackboard extends BTAction {
  key: string;
  value: any;
}

class BTLog extends BTAction {
  message: string;
}
```

**Implementation Checklist:**
- [ ] Wait action
- [ ] Move to position
- [ ] Play animation
- [ ] Set blackboard value
- [ ] Log/debug action
- [ ] Custom action registration

---

### 12.3.6 `src/ai/behavior/Blackboard.ts`

**Role:** Shared data storage for AI.

**Public API:**
```typescript
class Blackboard {
  // Access
  get<T>(key: string): T | undefined;
  set<T>(key: string, value: T): void;
  has(key: string): boolean;
  delete(key: string): void;
  clear(): void;

  // Typed access
  getVector3(key: string): Vector3 | undefined;
  getEntity(key: string): Entity | undefined;
  getNumber(key: string): number | undefined;
  getBoolean(key: string): boolean | undefined;

  // Observation
  onChange: Signal<(key: string, value: any) => void>;

  // Parent blackboard (for shared data)
  parent: Blackboard | null;
}
```

**Implementation Checklist:**
- [ ] Type-safe value storage
- [ ] Parent blackboard inheritance
- [ ] Change observation
- [ ] Serialization
- [ ] **Tests:** Get/set, inheritance

---

## 12.4 State Machines

### 12.4.1 `src/ai/fsm/StateMachine.ts`

**Role:** Finite state machine for AI control.

**Public API:**
```typescript
class StateMachine {
  // States
  addState(state: State): void;
  removeState(name: string): void;
  getState(name: string): State | undefined;

  // Transitions
  addTransition(transition: Transition): void;

  // Control
  start(initialState: string): void;
  update(dt: number): void;
  forceState(name: string): void;

  // State
  get currentState(): State | null;
  get previousState(): State | null;

  // Events
  onStateEnter: Signal<(state: State) => void>;
  onStateExit: Signal<(state: State) => void>;
}
```

**Dependencies:**
- Depends on: `State`, `Transition`
- Depended by: `AIAgent`

**Implementation Checklist:**
- [ ] State registration
- [ ] Automatic transition evaluation
- [ ] Manual state forcing
- [ ] Enter/exit callbacks
- [ ] State history
- [ ] **Tests:** Transitions, callbacks

---

### 12.4.2 `src/ai/fsm/HierarchicalFSM.ts`

**Role:** Nested state machines.

**Public API:**
```typescript
class HierarchicalFSM extends StateMachine {
  // Sub-machines
  addSubMachine(parentState: string, subMachine: StateMachine): void;
  getSubMachine(parentState: string): StateMachine | undefined;

  // Queries
  getActiveStateStack(): State[];
}
```

**Implementation Checklist:**
- [ ] Nested state machines
- [ ] State stack tracking
- [ ] Hierarchical transitions

---

## 12.5 Steering Behaviors

### 12.5.1 `src/ai/steering/SteeringBehavior.ts`

**Role:** Base steering behavior interface.

**Public API:**
```typescript
abstract class SteeringBehavior {
  weight: number;
  abstract calculate(agent: SteeringAgent): Vector3;
}

interface SteeringAgent {
  position: Vector3;
  velocity: Vector3;
  maxSpeed: number;
  maxForce: number;
  mass: number;
}
```

**Dependencies:**
- Depends on: `Vector3`
- Depended by: All steering implementations

**Implementation Checklist:**
- [ ] Weight for blending
- [ ] Force calculation
- [ ] Agent interface

---

### 12.5.2 Steering Implementations

**Seek.ts:**
```typescript
class Seek extends SteeringBehavior {
  target: Vector3;
  calculate(agent: SteeringAgent): Vector3;
}
```

**Flee.ts:**
```typescript
class Flee extends SteeringBehavior {
  threat: Vector3;
  panicDistance: number;
  calculate(agent: SteeringAgent): Vector3;
}
```

**Wander.ts:**
```typescript
class Wander extends SteeringBehavior {
  wanderRadius: number;
  wanderDistance: number;
  wanderJitter: number;
  calculate(agent: SteeringAgent): Vector3;
}
```

**Flock.ts:**
```typescript
class Flock extends SteeringBehavior {
  neighbors: SteeringAgent[];
  separationWeight: number;
  alignmentWeight: number;
  cohesionWeight: number;
  calculate(agent: SteeringAgent): Vector3;
}
```

**Implementation Checklist per behavior:**
- [ ] Core algorithm implementation
- [ ] Configurable parameters
- [ ] Unit tests

---

### 12.5.3 `src/ai/steering/SteeringPipeline.ts`

**Role:** Combines multiple steering behaviors.

**Public API:**
```typescript
class SteeringPipeline {
  // Behaviors
  addBehavior(behavior: SteeringBehavior): void;
  removeBehavior(behavior: SteeringBehavior): void;

  // Calculation
  calculate(agent: SteeringAgent): Vector3;

  // Modes
  blendMode: 'weighted' | 'priority' | 'dithered';
}
```

**Implementation Checklist:**
- [ ] Weighted sum blending
- [ ] Priority-based selection
- [ ] Dithered blending
- [ ] Force truncation

---

## 12.6 Perception

### 12.6.1 `src/ai/perception/SensorSystem.ts`

**Role:** Coordinates AI perception sensors.

**Public API:**
```typescript
class SensorSystem {
  // Update
  update(world: World, dt: number): void;

  // Sensors
  createVisionSensor(entity: Entity): VisionSensor;
  createHearingSensor(entity: Entity): HearingSensor;
  createProximitySensor(entity: Entity): ProximitySensor;

  // Queries
  getPerceivedEntities(entity: Entity): PerceivedEntity[];
}

interface PerceivedEntity {
  entity: Entity;
  lastSeenPosition: Vector3;
  lastSeenTime: number;
  confidence: number;
  sensorType: 'vision' | 'hearing' | 'proximity';
}
```

**Dependencies:**
- Depends on: Sensor implementations, `MemorySystem`
- Depended by: `AIManager`

**Implementation Checklist:**
- [ ] Sensor management
- [ ] Perception aggregation
- [ ] Time-sliced updates
- [ ] **Performance:** 100 sensors @ 60 FPS

---

### 12.6.2 `src/ai/perception/VisionSensor.ts`

**Role:** Field-of-view based vision.

**Public API:**
```typescript
class VisionSensor {
  // Configuration
  fov: number;           // Degrees
  range: number;
  nearRange: number;     // Peripheral vision range

  // Raycasting
  raycastLayers: number;

  // Query
  getVisibleEntities(): Entity[];
  canSee(entity: Entity): boolean;
  getVisibilityScore(entity: Entity): number;
}
```

**Implementation Checklist:**
- [ ] Cone-based field of view
- [ ] Raycast occlusion checks
- [ ] Peripheral vision
- [ ] Distance falloff
- [ ] **Tests:** Visibility checks

---

### 12.6.3 `src/ai/perception/MemorySystem.ts`

**Role:** Short and long-term AI memory.

**Public API:**
```typescript
class MemorySystem {
  // Memory management
  remember(entity: Entity, info: MemoryInfo): void;
  forget(entity: Entity): void;
  getMemory(entity: Entity): MemoryInfo | undefined;
  getAllMemories(): MemoryInfo[];

  // Decay
  update(dt: number): void;

  // Configuration
  shortTermDuration: number;
  longTermThreshold: number;
}

interface MemoryInfo {
  entity: Entity;
  lastPosition: Vector3;
  lastSeen: number;
  strength: number;    // Decays over time
  tags: string[];
}
```

**Implementation Checklist:**
- [ ] Memory storage
- [ ] Time-based decay
- [ ] Short/long-term distinction
- [ ] Tag-based queries

---

## 12.7 Planning

### 12.7.1 `src/ai/planning/GOAPPlanner.ts`

**Role:** Goal-Oriented Action Planning.

**Public API:**
```typescript
class GOAPPlanner {
  // Planning
  plan(
    currentState: WorldState,
    goalState: WorldState,
    actions: GOAPAction[]
  ): GOAPAction[] | null;

  // Configuration
  maxPlanDepth: number;
  maxPlanningTime: number;
}

interface WorldState {
  [key: string]: boolean | number | string;
}

interface GOAPAction {
  name: string;
  cost: number;
  preconditions: WorldState;
  effects: WorldState;
  execute(context: any): Promise<boolean>;
}
```

**Implementation Checklist:**
- [ ] A* on state space
- [ ] Precondition/effect matching
- [ ] Cost optimization
- [ ] Planning time limit
- [ ] **Tests:** Various goal scenarios

---

### 12.7.2 `src/ai/planning/UtilityAI.ts`

**Role:** Utility-based decision making.

**Public API:**
```typescript
class UtilityAI {
  // Options
  addOption(option: UtilityOption): void;
  removeOption(name: string): void;

  // Evaluation
  evaluate(context: any): UtilityOption;
  getScores(): Map<string, number>;
}

interface UtilityOption {
  name: string;
  considerations: Consideration[];
  action: () => void;
}

interface Consideration {
  name: string;
  curve: ResponseCurve;
  input: (context: any) => number;  // 0-1 normalized
}

type ResponseCurve = 'linear' | 'quadratic' | 'logistic' | 'exponential';
```

**Implementation Checklist:**
- [ ] Multiple considerations per option
- [ ] Response curve types
- [ ] Score multiplication
- [ ] Momentum/inertia
- [ ] **Tests:** Scoring, selection

---

## 12.8 ML/Neural AI

### 12.8.1 `src/ai/ml/ONNXRuntimeWrapper.ts`

**Role:** ONNX model inference wrapper.

**Public API:**
```typescript
class ONNXRuntimeWrapper {
  // Loading
  static initialize(): Promise<void>;
  loadModel(modelPath: string): Promise<void>;
  unloadModel(): void;

  // Inference
  run(inputs: Map<string, Tensor>): Promise<Map<string, Tensor>>;
  runSync(inputs: Map<string, Tensor>): Map<string, Tensor>;

  // Info
  getInputNames(): string[];
  getOutputNames(): string[];
  getInputShape(name: string): number[];
}

interface Tensor {
  data: Float32Array | Int32Array;
  dims: number[];
}
```

**Dependencies:**
- Depends on: onnxruntime-web
- Depended by: All ML components

**Implementation Checklist:**
- [ ] ONNX runtime initialization
- [ ] Model loading (URL, ArrayBuffer)
- [ ] Sync and async inference
- [ ] Tensor conversion utilities
- [ ] WebGL/WASM backend selection
- [ ] **Performance:** < 10ms inference for typical models
- [ ] **Tests:** Model loading, inference

---

### 12.8.2 `src/ai/ml/NPCController.ts`

**Role:** ML-driven NPC behavior.

**Public API:**
```typescript
class NPCController {
  // Model
  loadBehaviorModel(modelPath: string): Promise<void>;

  // State
  setObservation(observation: NPCObservation): void;
  getAction(): NPCAction;

  // Training data (optional)
  recordExperience(observation: NPCObservation, action: NPCAction, reward: number): void;
  exportExperiences(): ArrayBuffer;
}

interface NPCObservation {
  selfPosition: Vector3;
  selfVelocity: Vector3;
  targetPosition?: Vector3;
  nearbyEntities: { position: Vector3; type: string }[];
  custom: Float32Array;
}

interface NPCAction {
  moveDirection: Vector2;
  lookDirection: Vector2;
  actions: number[];  // Discrete action indices
}
```

**Implementation Checklist:**
- [ ] Observation encoding
- [ ] Policy network inference
- [ ] Action decoding
- [ ] Experience recording
- [ ] **Tests:** Action selection

---

### 12.8.3 `src/ai/ml/NeuralPathfinder.ts`

**Role:** ML-enhanced pathfinding.

**Public API:**
```typescript
class NeuralPathfinder {
  // Model
  loadModel(modelPath: string): Promise<void>;

  // Pathfinding
  findPath(start: Vector3, goal: Vector3, context: PathContext): Vector3[];

  // Hybrid mode
  useHybrid: boolean;  // Combine with A*
}

interface PathContext {
  obstacles: Box3[];
  dynamicAgents: { position: Vector3; velocity: Vector3 }[];
  preferredAreas: Box3[];
}
```

**Implementation Checklist:**
- [ ] Learned heuristic for A*
- [ ] Direct path prediction
- [ ] Hybrid A* + neural
- [ ] Dynamic obstacle awareness

---

## 12.9 Computer Vision

### 12.9.1 `src/ai/computervision/CVSystem.ts`

**Role:** Computer vision pipeline coordinator.

**Public API:**
```typescript
class CVSystem {
  // Initialization
  initialize(): Promise<void>;

  // Processing
  processFrame(imageData: ImageData): Promise<CVResult>;

  // Components
  readonly classifier: ImageClassifier;
  readonly detector: ObjectDetector;
  readonly poseEstimator: PoseEstimator;
}

interface CVResult {
  classifications?: Classification[];
  detections?: Detection[];
  poses?: Pose[];
}
```

**Implementation Checklist:**
- [ ] Frame processing pipeline
- [ ] Component coordination
- [ ] GPU-accelerated inference

---

### 12.9.2 `src/ai/computervision/ObjectDetector.ts`

**Role:** Real-time object detection.

**Public API:**
```typescript
class ObjectDetector {
  // Model
  loadModel(modelPath: string): Promise<void>;

  // Detection
  detect(imageData: ImageData): Promise<Detection[]>;

  // Configuration
  confidenceThreshold: number;
  maxDetections: number;
}

interface Detection {
  className: string;
  confidence: number;
  boundingBox: { x: number; y: number; width: number; height: number };
}
```

**Implementation Checklist:**
- [ ] YOLO or similar model support
- [ ] NMS (non-maximum suppression)
- [ ] Class filtering
- [ ] **Performance:** 30 FPS detection

---

## 12.10 L-Systems

### 12.10.1 `src/ai/lsystem/LSystemManager.ts`

**Role:** L-system generation and interpretation.

**Public API:**
```typescript
class LSystemManager {
  // Grammars
  loadGrammar(name: string): LSystemGrammar;
  registerGrammar(grammar: LSystemGrammar): void;

  // Generation
  generate(grammar: LSystemGrammar, iterations: number): string;

  // Interpretation
  interpretAsTurtle(axiom: string): TurtlePath;
  interpretAsMesh(axiom: string): Mesh;
  interpretAsBehavior(axiom: string): BehaviorSequence;
}

interface LSystemGrammar {
  name: string;
  axiom: string;
  rules: Map<string, string | ProductionRule>;
  parameters?: Map<string, number>;
}

interface ProductionRule {
  probability?: number;
  condition?: (context: string) => boolean;
  production: string;
}
```

**Implementation Checklist:**
- [ ] D0L (deterministic, context-free)
- [ ] Stochastic L-systems
- [ ] Context-sensitive
- [ ] Parametric L-systems
- [ ] Multiple interpretations
- [ ] **Tests:** All grammar types

---

---

## Next Document

Continue to `PRD-Final-07-World-Systems.md` for World Systems specifications.
