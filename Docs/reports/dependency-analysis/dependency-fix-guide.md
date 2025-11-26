# G3D 5.0 Dependency Violation Fix Guide

## Critical Violation: Core → ECS Dependency

**File:** `/Users/gurbakshchahal/G3D/src/core/Engine.ts:11`
**Issue:** Foundation layer (core) importing from Data layer (ecs)

---

## Solution Options

### Option A: Move Engine to Coordination Layer (RECOMMENDED)

**Why:** Engine naturally coordinates multiple subsystems, so it semantically belongs at a higher layer.

**Steps:**

1. Create new directory structure:
   ```
   src/
   ├── runtime/          # NEW: Layer 2.5 - Runtime Coordination
   │   ├── Engine.ts
   │   └── index.ts
   ```

2. Move Engine.ts:
   ```bash
   mkdir -p src/runtime
   mv src/core/Engine.ts src/runtime/Engine.ts
   ```

3. Update imports in Engine.ts:
   ```typescript
   // Before
   import { Time } from './Time';
   import { EventBus } from './EventBus';
   import { Logger } from './Logger';
   import { World } from '../ecs/World';

   // After
   import { Time } from '../core/Time';
   import { EventBus } from '../core/EventBus';
   import { Logger } from '../core/Logger';
   import { World } from '../ecs/World';  // Now OK!
   ```

4. Update core/index.ts:
   ```typescript
   // Remove Engine export
   // export { Engine } from './Engine';  // REMOVE THIS
   ```

5. Create runtime/index.ts:
   ```typescript
   export { Engine } from './Engine';
   ```

6. Update main index.ts:
   ```typescript
   // Add runtime exports
   export * from './runtime';
   ```

7. Update architecture documentation:
   ```markdown
   Layer 2.5 (Runtime Coordination):
   - runtime/ - Can import from core, math, ecs
   ```

**Impact:**
- Clean separation of concerns
- Engine can freely coordinate all subsystems
- Follows Single Responsibility Principle
- No breaking changes to public API (still exported from main index)

---

### Option B: Dependency Injection

**Why:** Inverts the dependency, making core independent of ecs.

**Steps:**

1. Modify Engine constructor:
   ```typescript
   // Before
   export class Engine {
     private world: World;

     private constructor(config: EngineConfig) {
       this.world = new World();
       // ...
     }
   }

   // After
   export class Engine {
     private constructor(
       private world: IWorld,  // Accept interface
       config: EngineConfig
     ) {
       // ...
     }
   }
   ```

2. Create interface in core:
   ```typescript
   // core/IWorld.ts
   export interface IWorld {
     update(deltaTime: number): void;
     destroy(): void;
     // ... essential methods only
   }
   ```

3. Make World implement interface:
   ```typescript
   // ecs/World.ts
   import { IWorld } from '../core/IWorld';

   export class World implements IWorld {
     // ...
   }
   ```

4. Move instantiation to application code:
   ```typescript
   // User's application code
   import { Engine } from 'g3d/core';
   import { World } from 'g3d/ecs';

   const world = new World();
   const engine = Engine.getInstance({ world });
   ```

**Impact:**
- More complex API for users
- Requires users to manually wire dependencies
- Better for testing (can mock World)
- More flexible but less convenient

---

### Option C: Extract Coordination Interface

**Why:** Define minimal coordination contract in core.

**Steps:**

1. Create coordination types in core:
   ```typescript
   // core/EngineTypes.ts
   export interface ISubsystem {
     initialize(): Promise<void>;
     update(deltaTime: number): void;
     destroy(): void;
   }
   ```

2. Refactor Engine to use generic subsystems:
   ```typescript
   // core/Engine.ts
   export class Engine {
     private subsystems: Map<string, ISubsystem> = new Map();

     registerSubsystem(name: string, subsystem: ISubsystem): void {
       this.subsystems.set(name, subsystem);
     }

     private update(deltaTime: number): void {
       for (const subsystem of this.subsystems.values()) {
         subsystem.update(deltaTime);
       }
     }
   }
   ```

3. Make World implement ISubsystem:
   ```typescript
   // ecs/World.ts
   import { ISubsystem } from '../core/EngineTypes';

   export class World implements ISubsystem {
     // ...
   }
   ```

**Impact:**
- Most flexible approach
- Engine becomes a generic subsystem coordinator
- Clean separation of concerns
- Extensible for new subsystems
- More initial work

---

## Recommendation Matrix

| Option | Complexity | API Impact | Architectural Purity | Time to Implement |
|--------|-----------|------------|---------------------|-------------------|
| **A: Move Engine** | Low | None | High | 10 mins |
| B: Dependency Injection | Medium | High | Very High | 30 mins |
| C: Extract Interface | High | Medium | Very High | 1 hour |

**RECOMMENDED:** Option A - Move Engine to Runtime Layer

**Rationale:**
1. Fastest to implement (10 minutes)
2. No API breaking changes
3. Semantically correct (Engine IS a coordinator)
4. Follows G3D's layered architecture philosophy
5. Enables future expansion of runtime layer

---

## Implementation Checklist

Using Option A (Recommended):

- [ ] Create `src/runtime/` directory
- [ ] Move `src/core/Engine.ts` to `src/runtime/Engine.ts`
- [ ] Update imports in `Engine.ts` (add `../` to core imports)
- [ ] Remove Engine export from `src/core/index.ts`
- [ ] Create `src/runtime/index.ts` with Engine export
- [ ] Add runtime exports to `src/index.ts`
- [ ] Update layer documentation in README/docs
- [ ] Run tests to verify nothing broke
- [ ] Update dependency analyzer allowed dependencies:
  ```python
  # Add to LAYERS dict
  2.5: {
      'runtime': ['core', 'math', 'ecs']
  }
  ```
- [ ] Re-run dependency verification
- [ ] Commit changes

**Estimated Time:** 10-15 minutes

---

## Testing After Fix

Run these commands to verify the fix:

```bash
# 1. Re-run dependency analyzer
python3 analyze_dependencies.py

# 2. Verify no violations in runtime layer
grep -r "from '\.\./\.\./\.\." src/runtime/

# 3. Run TypeScript compiler
npx tsc --noEmit

# 4. Run tests
npm test

# 5. Verify exports still work
node -e "const G3D = require('./dist'); console.log(G3D.Engine)"
```

---

## Prevention: Add ESLint Rules

To prevent future violations, add to `.eslintrc.js`:

```javascript
module.exports = {
  rules: {
    'import/no-restricted-paths': ['error', {
      zones: [
        // Layer 1: core can't import from anywhere except external
        {
          target: './src/core',
          from: './src/!(core|node_modules)',
          message: 'Core layer cannot import from other G3D modules'
        },

        // Layer 1: math can only import from core
        {
          target: './src/math',
          from: './src/!(core|math|node_modules)',
          message: 'Math layer can only import from core'
        },

        // Layer 2: ecs can only import from core, math
        {
          target: './src/ecs',
          from: './src/!(core|math|ecs|node_modules)',
          message: 'ECS layer can only import from core and math'
        },

        // Layer 2.5: runtime can import core, math, ecs
        {
          target: './src/runtime',
          from: './src/!(core|math|ecs|runtime|node_modules)',
          message: 'Runtime layer can only import from core, math, and ecs'
        }

        // ... add more layers as needed
      ]
    }]
  }
};
```

Install required package:
```bash
npm install --save-dev eslint-plugin-import
```

---

## Long-term Architecture Improvements

1. **Add Architecture Decision Records (ADRs)**
   - Document why Engine was moved
   - Record layer structure decisions
   - Reference in future design discussions

2. **Create Dependency Graph Visualization**
   - Generate visual diagrams in CI/CD
   - Make available in docs/
   - Update on each release

3. **Automate in CI/CD**
   - Run dependency analyzer on every PR
   - Fail builds on new violations
   - Generate reports as artifacts

4. **Document in CONTRIBUTING.md**
   ```markdown
   ## Module Dependencies

   G3D uses a strict layered architecture. Modules can only import from:
   - Lower layers
   - The same layer (with care)
   - External dependencies

   Layer structure:
   1. Foundation: core, math
   2. Data: ecs
   2.5. Runtime: runtime (coordinates subsystems)
   3. Systems: rendering, physics, audio, net, input
   4. Features: animation, ai, simulation, world, terrain, ocean, weather, voxel
   5. Tools: ui, editor, scripting, timeline, profiling, analytics, cloud, localization, assets, serialization
   6. Domains: scientific, medical, architecture, xr, ecommerce
   ```

---

## Questions?

If you encounter issues during implementation:

1. Check that all imports are updated
2. Verify TypeScript compilation succeeds
3. Run full test suite
4. Check that main index.ts exports Engine correctly
5. Verify no circular dependencies introduced

The recommended fix (Option A) has minimal risk and should complete in ~10 minutes.
