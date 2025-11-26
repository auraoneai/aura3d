# G3D 5.0 – World-Class Web Engine

## Master PRD – Single Source of Truth

**Document Version:** 1.0
**Status:** Canonical Implementation Specification
**Scope:** Complete engine implementation from this document only

---

## Document Organization

This PRD is split into the following files for manageability:

| File | Contents |
|------|----------|
| `PRD-Final-00-Overview.md` | Vision, constraints, layering, directory structure, rules |
| `PRD-Final-01-Core-Math-ECS.md` | Core foundation, mathematics, Entity Component System |
| `PRD-Final-02-Rendering.md` | Renderer, RenderGraph, backends, passes, culling |
| `PRD-Final-03-Shaders-Materials-PostFX.md` | Shader system, materials, post-processing |
| `PRD-Final-04-Physics-Simulation.md` | Physics, soft body, cloth, fluids, fracture, fire/smoke |
| `PRD-Final-05-Animation.md` | Animation, motion matching, IK, facial, procedural |
| `PRD-Final-06-AI-ML.md` | AI systems, navigation, behavior, ML, perception |
| `PRD-Final-07-World-Systems.md` | Terrain, voxel, ocean, weather |
| `PRD-Final-08-Domain-Packs.md` | Scientific, medical, architecture, XR, ecommerce |
| `PRD-Final-09-Infrastructure.md` | Networking, input, UI, audio, assets, serialization |
| `PRD-Final-10-Tooling.md` | Editor, scripting, timeline, profiling, analytics, cloud |
| `PRD-Final-11-Testing-Phases.md` | Testing requirements, performance budgets, implementation phases |

---

## 1. Vision & Hard Constraints

### 1.1 Vision

G3D 5.0 is a web-native, Unity/Unreal-class engine with:

- **Film-quality rendering**: PBR + advanced materials, GI, volumetrics
- **Full physics & simulation stack**: rigid, soft, cloth, fluids, fracture, GPU physics
- **Advanced animation**: motion matching, procedural, full-body IK, facial, ML
- **Rich AI/ML**: behavior trees, navigation, ML NPCs, CV, procedural content
- **Complete world & domain support**: terrain, streaming, voxel, weather, scientific, medical, BIM, XR, e-commerce
- **Batteries-included UX & infra**: UI, networking, visual scripting, editor, profiling, asset pipeline, cloud

### 1.2 Non-Negotiable Rules

> **RULE 1: No "basic engine"**
>
> All core abstractions (renderer, ECS, materials, physics, animation, etc.) must be designed from the start to support the full feature set enumerated in this PRD.

> **RULE 2: Single canonical implementation per major subsystem**
>
> One renderer, one physics engine interface, one unified particle system, one uniform manager, etc.

> **RULE 3: No stubs / TODOs / placeholders**
>
> Every file listed here is implemented to production quality when created. The following are FORBIDDEN:
> - `// TODO: implement later`
> - `throw new Error('Not implemented')`
> - Empty function bodies
> - Minimal/skeleton implementations
> - "Phase 1" partial implementations

> **RULE 4: No untracked files**
>
> If it's not in this PRD, either:
> - You add it here first, or
> - You don't create it.

### 1.3 Definition of "Complete"

A file is considered **complete** when:

- [ ] All public APIs documented with JSDoc
- [ ] All methods fully implemented (no stubs)
- [ ] All error paths handled
- [ ] Zero allocations in per-frame code paths
- [ ] Unit tests with >80% coverage
- [ ] Integration tests where applicable
- [ ] Performance meets stated budgets
- [ ] Code reviewed and approved

---

## 2. Runtime Spine & Layering

### 2.1 Main Loop Order

The engine loop MUST follow this exact order for each frame:

```typescript
update(dt: number): void {
  // Phase 1: Time & Input
  1. core/Time.update()
  2. input/InputSystem.update(dt)

  // Phase 2: Gameplay & AI
  3. ecs/World: Core gameplay systems (AI, gameplay, animation controllers)

  // Phase 3: Physics
  4. physics/PhysicsSystem.step(dt)

  // Phase 4: Advanced Simulations
  5. simulation/*: fluids, cloth, MPM, fracture, etc.

  // Phase 5: Scene Sync
  6. scene/SceneSyncSystem.update(dt)  // Build RenderScene + PhysicsScene views

  // Phase 6: Audio & Networking
  7. audio/AudioSystem.update(dt)
  8. net/NetReplicationSystem.update(dt)

  // Phase 7: Rendering
  9.  rendering/Renderer.beginFrame()
  10. rendering/RenderGraph.executeAll()
  11. ui/UISystem.render()
  12. profiling/Profiler.tick(dt)
  13. rendering/Renderer.endFrame()
}
```

**Main Loop Rules:**

- [ ] No rendering calls in phases 1–8
- [ ] No gameplay/physics logic in RenderGraph passes
- [ ] All cross-subsystem interactions go via ECS components or explicit interfaces
- [ ] Fixed timestep accumulator used for physics (max 8 substeps per frame)
- [ ] Variable timestep for rendering
- [ ] Frame timing captured for profiler

### 2.2 Layering

From lowest to highest dependency level:

```
Layer 1 (Foundation):     core / math
Layer 2 (Data):           ecs
Layer 3 (Platform):       platform
Layer 4 (Systems):        rendering / physics / audio / net / input
Layer 5 (Features):       scene / animation / vfx / world / ai
Layer 6 (Tools):          ui / tools / editor / scripting / analytics / cloud
Layer 7 (Domains):        scientific / medical / architecture / xr / ecommerce
```

**Layering Rules:**

- [ ] Higher layers may depend on lower layers
- [ ] Lower layers NEVER depend on higher layers
- [ ] Same-layer dependencies must be explicitly declared
- [ ] Circular dependencies are FORBIDDEN

---

## 3. Directory & File Layout

### 3.1 Top-Level Structure

```
src/
├── core/           # Engine foundation (13 files)
├── math/           # Mathematics library (19 files)
├── ecs/            # Entity Component System (41+ files)
├── platform/       # Platform abstraction (8 files)
├── rendering/      # Renderer & RenderGraph (35+ files)
├── shaders/        # Shader system (45+ files)
├── materials/      # Material system (24 files)
├── textures/       # Texture management (12 files)
├── postfx/         # Post-processing (14 files)
├── lighting/       # Lighting system (18 files)
├── environment/    # Environment & sky (12 files)
├── animation/      # Animation system (38+ files)
├── physics/        # Physics engine (15 files)
├── simulation/     # Advanced simulations (48+ files)
├── vfx/            # Visual effects (16 files)
├── particles/      # Particle system (22 files)
├── ocean/          # Ocean system (12 files)
├── terrain/        # Terrain system (28 files)
├── voxel/          # Voxel system (13 files)
├── world/          # World management (14 files)
├── weather/        # Weather system (15 files)
├── scientific/     # Scientific visualization (20 files)
├── medical/        # Medical imaging (10 files)
├── architecture/   # BIM/Architecture (11 files)
├── ecommerce/      # E-commerce features (8 files)
├── xr/             # XR/VR/AR support (12 files)
├── ai/             # AI & ML systems (65+ files)
├── net/            # Networking (52 files)
├── input/          # Input system (28 files)
├── ui/             # UI framework (68 files)
├── audio/          # Audio engine (32 files)
├── assets/         # Asset pipeline (45 files)
├── serialization/  # Save/Load system (22 files)
├── timeline/       # Timeline & cinematics (26 files)
├── profiling/      # Profiling & debug (28 files)
├── optimization/   # Performance tools (22 files)
├── streaming/      # World streaming (18 files)
├── scripting/      # Visual scripting (32 files)
├── editor/         # Editor integration (24 files)
├── analytics/      # Analytics & telemetry (14 files)
├── cloud/          # Cloud services (16 files)
├── localization/   # Localization (12 files)
├── utilities/      # Utilities (24 files)
├── types/          # Type definitions (8 files)
├── constants/      # Constants (4 files)
├── index.ts        # Main export
└── version.ts      # Version info
```

### 3.2 File Counting Summary

| Section | Directory | File Count |
|---------|-----------|------------|
| Core | `src/core/` | 13 |
| Math | `src/math/` | 19 |
| ECS | `src/ecs/` | 41+ |
| Platform | `src/platform/` | 8 |
| Rendering | `src/rendering/` | 35+ |
| Shaders | `src/shaders/` | 45+ |
| Materials | `src/materials/` | 24 |
| Textures | `src/textures/` | 12 |
| PostFX | `src/postfx/` | 14 |
| Lighting | `src/lighting/` | 18 |
| Environment | `src/environment/` | 12 |
| Animation | `src/animation/` | 38+ |
| Physics | `src/physics/` | 15 |
| Simulation | `src/simulation/` | 48+ |
| VFX | `src/vfx/` | 16 |
| Particles | `src/particles/` | 22 |
| Ocean | `src/ocean/` | 12 |
| Terrain | `src/terrain/` | 28 |
| Voxel | `src/voxel/` | 13 |
| World | `src/world/` | 14 |
| Weather | `src/weather/` | 15 |
| Scientific | `src/scientific/` | 20 |
| Medical | `src/medical/` | 10 |
| Architecture | `src/architecture/` | 11 |
| Ecommerce | `src/ecommerce/` | 8 |
| XR | `src/xr/` | 12 |
| AI | `src/ai/` | 65+ |
| Net | `src/net/` | 52 |
| Input | `src/input/` | 28 |
| UI | `src/ui/` | 68 |
| Audio | `src/audio/` | 32 |
| Assets | `src/assets/` | 45 |
| Serialization | `src/serialization/` | 22 |
| Timeline | `src/timeline/` | 26 |
| Profiling | `src/profiling/` | 28 |
| Optimization | `src/optimization/` | 22 |
| Streaming | `src/streaming/` | 18 |
| Scripting | `src/scripting/` | 32 |
| Editor | `src/editor/` | 24 |
| Analytics | `src/analytics/` | 14 |
| Cloud | `src/cloud/` | 16 |
| Localization | `src/localization/` | 12 |
| Utilities | `src/utilities/` | 24 |
| Types | `src/types/` | 8 |
| Constants | `src/constants/` | 4 |
| **TOTAL** | | **~950+ files** |

---

## 4. Checklist Format Standard

All file checklists in this PRD follow this format:

```markdown
### X.Y.Z `src/path/FileName.ts`

**Role:** [One-line description of responsibility]

**Public API:**
- `functionName(params): ReturnType` – [description]
- `ClassName` – [description]

**Dependencies:**
- Depends on: `module1`, `module2`
- Depended by: `module3`, `module4`

**Implementation Checklist:**
- [ ] Task 1
- [ ] Task 2
- [ ] Performance: [specific budget]
- [ ] Tests: [specific coverage requirement]
```

---

## 5. Cross-Reference Index

### 5.1 Core Systems Cross-Reference

| System | Primary Files | Interfaces With |
|--------|---------------|-----------------|
| Engine | `Engine.ts` | All systems |
| ECS | `World.ts`, `System.ts` | All gameplay systems |
| Renderer | `Renderer.ts`, `RenderGraph.ts` | Materials, Shaders, PostFX |
| Physics | `PhysicsWorld.ts` | ECS, Simulation |
| Animation | `AnimationSystem.ts` | ECS, Physics |
| AI | `AIManager.ts` | ECS, Navigation |
| Audio | `AudioSystem.ts` | ECS, Streaming |
| Network | `NetManager.ts` | ECS, Serialization |

### 5.2 Data Flow

```
User Input → InputSystem → ECS Components
                              ↓
                         AI Systems
                              ↓
                      Animation Systems
                              ↓
                       Physics Step
                              ↓
                    Advanced Simulations
                              ↓
                      Scene Sync
                              ↓
                    RenderScene Data
                              ↓
                      RenderGraph
                              ↓
                    GPU Commands
                              ↓
                       Display
```

---

## Next Documents

Continue to:
- `PRD-Final-01-Core-Math-ECS.md` for Core, Math, and ECS specifications
