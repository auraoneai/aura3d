# G3D 5.0 Visual Scripting System

A complete, production-ready flow-based visual scripting system for the G3D 5.0 game engine.

## Features

- **Flow-Based Execution**: Visual node-based scripting with clear execution flow
- **Type-Safe Connections**: Automatic type checking with conversion hints
- **Hot Reload Support**: Recompile and reload graphs at runtime
- **Debug Breakpoints**: Pause execution at specific nodes
- **Performance Profiling**: Track node execution times and optimize
- **Graph Optimization**: Automatic dead code elimination and constant folding
- **Event System**: Custom events and event handlers
- **Global Variables**: Shared state across graphs
- **Compilation & Caching**: Compiled graphs with LRU cache
- **60+ Built-in Nodes**: Events, flow control, math, logic, physics, animations, and more

## Architecture

```
scripting/
├── ScriptingEngine.ts       # Main runtime engine
├── Graph.ts                 # Graph structure and operations
├── Node.ts                  # Base node class
├── Edge.ts                  # Edge connections
├── Port.ts                  # Port definitions
├── nodes/                   # Node type implementations
│   ├── EventNodes.ts        # OnStart, OnUpdate, OnCollision, etc.
│   ├── FlowNodes.ts         # Branch, Loop, Sequence, Gate, etc.
│   ├── MathNodes.ts         # Add, Multiply, Sin, Lerp, Vector3, etc.
│   ├── LogicNodes.ts        # AND, OR, Equal, Greater, Select, etc.
│   ├── VariableNodes.ts     # Get/Set variables
│   ├── ComponentNodes.ts    # Entity component access
│   ├── PhysicsNodes.ts      # Physics operations
│   ├── AnimationNodes.ts    # Animation control
│   └── DebugNodes.ts        # Log, DrawLine, Breakpoint, etc.
├── execution/               # Execution system
│   ├── ExecutionContext.ts  # Runtime context
│   ├── FlowMachine.ts       # Flow state machine
│   └── GraphExecutor.ts     # Graph executor
└── compiler/                # Compilation system
    ├── ScriptCompiler.ts    # Main compiler
    ├── TypeChecker.ts       # Type validation
    └── Optimizer.ts         # Graph optimization
```

## Quick Start

```typescript
import { ScriptingEngine, Graph } from './scripting';
import * as EventNodes from './scripting/nodes/EventNodes';
import * as MathNodes from './scripting/nodes/MathNodes';
import * as PhysicsNodes from './scripting/nodes/PhysicsNodes';

// Create engine
const engine = new ScriptingEngine({
    enableProfiling: true,
    enableDebugMode: true
});

// Create graph
const graph = new Graph({ name: 'Player Movement' });

// Add nodes
const onUpdate = new EventNodes.OnUpdate();
const multiply = new MathNodes.Multiply();
const setVelocity = new PhysicsNodes.SetVelocity();

graph.addNode(onUpdate);
graph.addNode(multiply);
graph.addNode(setVelocity);

// Set values
multiply.getInput('b')!.defaultValue = 5;

// Connect nodes
graph.connect(onUpdate.getOutput('out')!, setVelocity.getInput('in')!);
graph.connect(multiply.getOutput('result')!, setVelocity.getInput('velocity')!);

// Add to engine
const entity = { id: 'player1', name: 'Player' };
engine.addGraph(entity, graph);

// Game loop
async function gameLoop(deltaTime: number) {
    await engine.update(deltaTime);
}
```

## Node Categories

### Event Nodes
- **OnStart**: Fires once when graph starts
- **OnUpdate**: Fires every frame
- **OnFixedUpdate**: Fires at physics rate (50 FPS)
- **OnDestroy**: Fires when graph is destroyed
- **CustomEvent**: User-defined events
- **OnKeyPress**: Keyboard input events
- **OnCollisionEnter/Exit**: Physics collision events

### Flow Control Nodes
- **Branch**: If/else conditional execution
- **Switch**: Multi-way branch
- **ForLoop**: Fixed iteration loop
- **WhileLoop**: Conditional loop
- **Delay**: Async wait
- **Sequence**: Execute in order
- **DoOnce**: Execute only once
- **Gate**: Allow/block flow
- **FlipFlop**: Toggle between outputs

### Math Nodes
- **Basic**: Add, Subtract, Multiply, Divide
- **Advanced**: Power, Sqrt, Abs, Sin, Cos, Tan
- **Utility**: Min, Max, Clamp, Lerp, InverseLerp, Random
- **Vector**: Vector3Add, Vector3Scale

### Logic Nodes
- **Boolean**: AND, OR, NOT, XOR
- **Comparison**: Equal, NotEqual, Greater, Less, GreaterEqual, LessEqual
- **Utility**: IsNull, IsValid, Select

### Variable Nodes
- **GetVariable/SetVariable**: Local graph variables
- **GetGlobalVariable/SetGlobalVariable**: Shared global variables
- **Increment/Decrement**: Numeric operations

### Component Nodes
- **GetComponent**: Access entity components
- **GetComponentProperty/SetComponentProperty**: Component properties
- **FindEntityByName**: Entity lookup
- **GetChildren/GetParent**: Hierarchy traversal
- **GetSelf**: Current entity reference

### Physics Nodes
- **ApplyForce/ApplyImpulse**: Force application
- **SetVelocity/GetVelocity**: Velocity control
- **Raycast**: Physics raycasting
- **SetKinematic**: Kinematic state
- **SetGravity**: Gravity control

### Animation Nodes
- **PlayAnimation/StopAnimation**: Animation playback
- **SetAnimationSpeed**: Playback speed
- **BlendAnimations**: Animation blending
- **CrossfadeAnimation**: Smooth transitions
- **GetAnimationState**: Current state

### Debug Nodes
- **Log**: Console output
- **DrawLine/DrawSphere**: Visual debugging
- **Breakpoint**: Pause execution
- **Assert**: Assertions
- **StartProfiler/EndProfiler**: Performance markers
- **GetFrameCount**: Frame counter

## Port Types

- **FLOW**: Execution flow (white)
- **BOOLEAN**: Boolean values (red)
- **NUMBER**: Numeric values (green)
- **STRING**: String values (magenta)
- **VECTOR2**: 2D vectors (yellow)
- **VECTOR3**: 3D vectors (cyan)
- **QUATERNION**: Rotations (orange)
- **ENTITY**: Entity references (blue)
- **COMPONENT**: Component references (purple)
- **ANY**: Universal type (gray)

## Type Conversion

Automatic conversions supported:
- Number ↔ String
- Boolean ↔ Number (false=0, true=1)
- ANY works with all types

## Graph Operations

### Creating Graphs
```typescript
const graph = new Graph({
    name: 'My Graph',
    description: 'Description',
    author: 'Your Name',
    version: '1.0.0'
});
```

### Adding Nodes
```typescript
const node = new EventNodes.OnUpdate();
graph.addNode(node);
```

### Connecting Ports
```typescript
const sourcePort = nodeA.getOutput('out');
const targetPort = nodeB.getInput('in');
graph.connect(sourcePort, targetPort);
```

### Validation
```typescript
const result = graph.validate();
if (!result.valid) {
    console.error('Errors:', result.errors);
}
```

### Serialization
```typescript
const json = graph.toJSON();
const cloned = graph.clone();
```

## Engine Features

### Global Variables
```typescript
engine.setGlobalVariable('playerHealth', 100);
const health = engine.getGlobalVariable('playerHealth');
```

### Custom Events
```typescript
// Subscribe
engine.on('PlayerDied', (data) => {
    console.log('Player died:', data);
});

// Dispatch
engine.dispatchEvent('PlayerDied', { reason: 'fell' });
```

### Hot Reload
```typescript
const newGraph = createUpdatedGraph();
engine.hotReload('graphId', newGraph);
```

### Profiling
```typescript
engine.setProfiling(true);
await engine.update(deltaTime);
const data = engine.getProfilingData('graphId');
```

### Statistics
```typescript
const stats = engine.getStats();
console.log(`Graphs: ${stats.graphCount}`);
console.log(`Avg Frame: ${stats.averageFrameTime}ms`);
```

## Compilation

The compiler optimizes graphs before execution:

```typescript
const compiler = engine.compiler;

const result = compiler.compile(graph, {
    optimize: true,
    typeCheck: true,
    strictMode: false
});

if (result.success) {
    console.log('Compilation successful!');
    console.log('Warnings:', result.warnings);
}
```

### Optimizations
- **Constant Folding**: Evaluate constant expressions at compile time
- **Dead Code Elimination**: Remove unreachable nodes
- **Execution Order**: Optimize node execution order

## Performance

- **Target**: 1000 nodes per frame at 60 FPS
- **Max Execution Time**: Configurable (default 100ms)
- **Compiled & Cached**: Graphs are compiled and cached with LRU eviction
- **Profiling**: Per-node execution time tracking

## Best Practices

1. **Keep Graphs Small**: Break large graphs into subgraphs
2. **Use Variables**: Cache expensive calculations
3. **Avoid Infinite Loops**: Use max iteration limits
4. **Enable Type Checking**: Catch errors early
5. **Profile Regularly**: Identify performance bottlenecks
6. **Use Flow Control**: Branch to avoid unnecessary computation
7. **Cache Compiled Graphs**: Reuse compiled graphs when possible

## Error Handling

The system provides detailed error messages:

```typescript
const result = await executor.execute(deltaTime);
if (!result.success) {
    console.error('Execution failed:', result.error);
}
```

Type checking provides helpful hints:
```typescript
const typeResult = TypeChecker.check(graph);
for (const error of typeResult.errors) {
    console.error(`${error.message} at node ${error.nodeId}`);
    const suggestions = TypeChecker.suggestFix(error);
    console.log('Suggestions:', suggestions);
}
```

## Examples

See `example.ts` for complete working examples:
- Simple movement script
- Health check with conditionals
- Counter loop
- Math operations
- Event system usage

## API Reference

### ScriptingEngine
- `addGraph(entity, graph, id?)`: Add graph to engine
- `removeGraph(graphId)`: Remove graph
- `update(deltaTime)`: Update all graphs (frame)
- `fixedUpdate(deltaTime)`: Update at fixed rate (physics)
- `dispatchEvent(name, data?)`: Dispatch custom event
- `setGlobalVariable(name, value)`: Set global variable
- `hotReload(graphId, newGraph)`: Hot reload graph
- `setProfiling(enabled)`: Enable/disable profiling
- `getStats()`: Get engine statistics

### Graph
- `addNode(node)`: Add node to graph
- `removeNode(nodeId)`: Remove node
- `connect(sourcePort, targetPort)`: Connect ports
- `disconnect(edge)`: Disconnect edge
- `validate()`: Validate graph
- `getEntryPoints()`: Get entry point nodes
- `getExecutionOrder()`: Get topological execution order
- `clone()`: Clone graph
- `toJSON()`: Serialize to JSON

### Node (Base Class)
- `execute(context)`: Execute node logic (override)
- `getInput(name)`: Get input port
- `getOutput(name)`: Get output port
- `validate()`: Validate node
- `clone()`: Clone node

## License

Part of the G3D 5.0 game engine.

## Version

5.0.0 - Complete visual scripting implementation
