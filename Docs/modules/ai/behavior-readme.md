# G3D 5.0 Behavior Tree System

Complete implementation of behavior trees for AI decision making with high-performance execution, hot-reloading support, and comprehensive node types.

## Features

- **Full Node Library**: Composites, decorators, actions, and conditions
- **High Performance**: Optimized for 1000+ trees @ 60 FPS
- **Tick Scheduling**: Manual, fixed-rate, and event-based execution
- **Hot-Reloading**: Update trees at runtime without interruption
- **Hierarchical Blackboard**: Scoped data storage with inheritance
- **JSON Serialization**: Save/load trees from JSON
- **Debug Support**: Status tracking and visualization helpers
- **Async Actions**: Full support for asynchronous operations

## Architecture

```
behavior/
├── BTNode.ts           # Base node class with status management
├── BehaviorTree.ts     # Main execution engine and tree manager
├── Blackboard.ts       # Hierarchical data storage
├── BTComposite.ts      # Sequence, Selector, Parallel, etc.
├── BTDecorator.ts      # Inverter, Repeater, Cooldown, etc.
├── BTAction.ts         # Action leaf nodes
├── BTCondition.ts      # Condition leaf nodes
├── BTSerializer.ts     # JSON serialization/deserialization
└── index.ts            # Public API exports
```

## Quick Start

```typescript
import {
  BehaviorTree,
  Blackboard,
  BTSelector,
  BTSequence,
  BTAction,
  BTCompare,
  ComparisonOperator,
  NodeStatus,
} from './ai/behavior';

// Create blackboard
const blackboard = new Blackboard('agent');
blackboard.set('health', 100);
blackboard.set('hasEnemy', false);

// Build behavior tree
const tree = new BehaviorTree(
  new BTSelector('Root', [
    // Flee if health low
    new BTSequence('FleeWhenHurt', [
      new BTCompare('HealthLow', 'health', ComparisonOperator.LESS_THAN, 30),
      new BTAction('Flee', (ctx) => {
        console.log('Fleeing!');
        return NodeStatus.SUCCESS;
      }),
    ]),
    // Attack if enemy present
    new BTAction('Attack', (ctx) => {
      if (ctx.blackboard.get('hasEnemy')) {
        console.log('Attacking!');
        return NodeStatus.SUCCESS;
      }
      return NodeStatus.FAILURE;
    }),
    // Patrol by default
    new BTAction('Patrol', (ctx) => {
      console.log('Patrolling...');
      return NodeStatus.RUNNING;
    }),
  ]),
  blackboard
);

// Tick the tree each frame
function update(deltaTime: number) {
  const status = tree.tick(deltaTime);
}
```

## Node Types

### Composites

Nodes that manage multiple children:

- **BTSequence**: Executes children in order until one fails (AND logic)
- **BTSelector**: Executes children until one succeeds (OR logic)
- **BTParallel**: Executes all children simultaneously
- **BTRandomSelector**: Tries children in random order
- **BTPrioritySelector**: Tries children based on dynamic priorities

### Decorators

Nodes that modify child behavior:

- **BTInverter**: Inverts child result (SUCCESS ↔ FAILURE)
- **BTRepeater**: Repeats child N times or infinitely
- **BTRepeatUntilFail**: Repeats until child fails
- **BTCooldown**: Rate-limits child execution
- **BTTimeLimit**: Fails if child doesn't complete in time
- **BTForceSuccess**: Always returns SUCCESS
- **BTForceFailure**: Always returns FAILURE
- **BTWait**: Waits before executing child
- **BTUntilSuccess**: Repeats until child succeeds

### Actions

Leaf nodes that perform operations:

- **BTAction**: Custom action with function
- **BTIdle**: Does nothing (returns SUCCESS)
- **BTWaitAction**: Waits for duration then succeeds
- **BTLog**: Logs message for debugging
- **BTSetBlackboard**: Sets blackboard value
- **BTClearBlackboard**: Deletes blackboard value

### Conditions

Leaf nodes that check conditions:

- **BTCondition**: Custom condition with function
- **BTHasKey**: Checks if blackboard key exists
- **BTCompare**: Compares blackboard value
- **BTIsTrue**: Checks if value is true
- **BTIsFalse**: Checks if value is false
- **BTRandom**: Succeeds with probability
- **BTInRange**: Checks if value is in range
- **BTAlways**: Always succeeds
- **BTNever**: Always fails

## Advanced Examples

### Enemy AI with Multiple Behaviors

```typescript
const enemyTree = new BehaviorTree(
  new BTSelector('EnemyAI', [
    // Dead - do nothing
    new BTSequence('Dead', [
      new BTIsTrue('IsDead', 'isDead'),
      new BTIdle('DoNothing'),
    ]),

    // Flee when hurt
    new BTSequence('FleeWhenHurt', [
      new BTCompare('HealthLow', 'health', ComparisonOperator.LESS_THAN, 30),
      new BTAction('Flee', fleeAction),
    ]),

    // Attack player
    new BTSequence('AttackPlayer', [
      new BTHasKey('HasTarget', 'playerTarget'),
      new BTParallel('AttackAndDodge', [
        new BTSequence('MoveAndAttack', [
          new BTAction('MoveToPlayer', moveToPlayerAction),
          new BTCooldown('AttackCooldown',
            new BTAction('Attack', attackAction),
            2.0 // 2 second cooldown
          ),
        ]),
        new BTAction('Dodge', dodgeAction),
      ], ParallelPolicy.REQUIRE_ALL),
    ]),

    // Patrol
    new BTRepeater('PatrolForever',
      new BTSequence('PatrolLoop', [
        new BTAction('PickPatrolPoint', pickPatrolPointAction),
        new BTAction('MoveToPoint', moveToPointAction),
        new BTWaitAction('Wait', 2.0),
      ]),
      -1 // Infinite
    ),
  ])
);
```

### Async Actions (e.g., Pathfinding)

```typescript
const pathfindingAction = new BTAction('FindPath', async (ctx) => {
  const target = ctx.blackboard.get('target');
  const position = ctx.blackboard.get('position');

  try {
    const path = await pathfinder.findPath(position, target);
    ctx.blackboard.set('currentPath', path);
    return NodeStatus.SUCCESS;
  } catch (error) {
    return NodeStatus.FAILURE;
  }
});
```

### Hot-Reloading

```typescript
// Load tree from JSON
const serializer = new BTSerializer();
const treeData = await fetch('trees/enemy.json').then(r => r.json());
const tree = serializer.deserialize(treeData);

// Later, reload with new behavior
const updatedData = await fetch('trees/enemy.json').then(r => r.json());
const newRoot = serializer.deserializeNode(updatedData.root);
tree.hotReload(newRoot);
```

### Tree Manager for Multiple Agents

```typescript
import { BehaviorTreeManager } from './ai/behavior';

const manager = new BehaviorTreeManager();

// Register all agent trees
for (const enemy of enemies) {
  const tree = createEnemyTree(enemy);
  manager.register(tree);
}

// Update all trees efficiently each frame
function update(deltaTime: number) {
  manager.tickAll(deltaTime);

  const stats = manager.getStats();
  console.log(`${stats.activeTrees}/${stats.totalTrees} trees active`);
  console.log(`Update time: ${stats.lastUpdateTime.toFixed(2)}ms`);
}
```

### Blackboard Observers

```typescript
// Listen for health changes
blackboard.observe('health', (event) => {
  console.log(`Health: ${event.oldValue} -> ${event.value}`);

  if (event.value <= 0) {
    blackboard.set('isDead', true);
  }
});

// Listen for any change
blackboard.observe('*', (event) => {
  console.log(`${event.key} changed in ${event.scope} scope`);
});
```

### Hierarchical Blackboards

```typescript
// Global blackboard
const globalBB = new Blackboard('global');
globalBB.set('gameTime', 0);
globalBB.set('difficulty', 'normal');

// Team blackboard
const teamBB = globalBB.createChild('team');
teamBB.set('teamHealth', 300);

// Agent blackboard
const agentBB = teamBB.createChild('agent');
agentBB.set('health', 100);

// Agent can access all three scopes
agentBB.get('health');      // 100 (local)
agentBB.get('teamHealth');  // 300 (parent)
agentBB.get('gameTime');    // 0 (grandparent)
```

## Performance

The system is optimized for high-performance execution:

- **Target**: 1000+ trees @ 60 FPS (< 16ms per frame)
- **Optimizations**:
  - Minimal allocations during tick
  - Efficient node state management
  - Batched tree updates in manager
  - Fixed-rate ticking to reduce overhead
  - Event-based execution for idle trees

### Performance Monitoring

```typescript
// Enable debug mode
tree.debugEnabled = true;

// Check statistics
const stats = tree.getStats();
console.log(`Average tick: ${stats.averageTickTime.toFixed(2)}ms`);
console.log(`Peak tick: ${stats.peakTickTime.toFixed(2)}ms`);
console.log(`Total ticks: ${stats.totalTicks}`);
```

## Serialization

```typescript
const serializer = new BTSerializer();

// Serialize to JSON
const json = serializer.toJSON(tree, true); // pretty-print
fs.writeFileSync('tree.json', json);

// Deserialize from JSON
const loadedTree = serializer.fromJSON(json);

// Register custom actions/conditions
serializer.registerAction('customAction', customActionFunction);
serializer.registerCondition('customCondition', customConditionFunction);
```

## Debugging

```typescript
// Enable debug mode
tree.debugEnabled = true;

// Print tree structure
console.log(tree.toString());

// Listen for events
tree.on(TreeEvent.STARTED, (tree) => {
  console.log(`Tree ${tree.name} started`);
});

tree.on(TreeEvent.STATUS_CHANGED, (tree) => {
  console.log(`Tree ${tree.name} status: ${tree.status}`);
});

// Get node-level debug info
console.log(tree.root.toDebugString());
```

## Best Practices

1. **Use Blackboard for State**: Store all agent state in the blackboard for easy access
2. **Keep Actions Small**: Break complex behaviors into multiple small actions
3. **Use Decorators**: Leverage decorators like Cooldown and TimeLimit for cleaner trees
4. **Enable Fixed-Rate**: Use fixed-rate ticking for non-critical agents to reduce overhead
5. **Pool Trees**: Reuse tree instances when possible instead of creating new ones
6. **Hot-Reload in Dev**: Use hot-reloading during development for faster iteration
7. **Monitor Performance**: Use stats to identify performance bottlenecks

## License

Part of G3D 5.0 Game Engine
