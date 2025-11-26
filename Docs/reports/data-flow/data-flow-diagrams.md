# G3D 5.0 Data Flow Diagrams

Visual representation of data flows between major systems in the G3D engine.

---

## 1. Complete System Data Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         G3D 5.0 System Data Flow                            │
└─────────────────────────────────────────────────────────────────────────────┘

                              ┌──────────────┐
                              │  Game Loop   │
                              │   (Engine)   │
                              └──────┬───────┘
                                     │
                    ┌────────────────┼────────────────┐
                    ▼                ▼                ▼
         ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
         │ InputSystem  │  │   ECS World  │  │ RenderSystem │
         │  Priority:   │  │              │  │  Priority:   │
         │    INPUT     │  │   Updates    │  │    1000      │
         └──────┬───────┘  └──────┬───────┘  └──────▲───────┘
                │                 │                  │
                └────────┬────────┘                  │
                         ▼                           │
         ┌───────────────────────────────┐           │
         │    TransformSystem            │           │
         │    Priority: PRE_UPDATE       │           │
         │                               │           │
         │  • Updates local matrices     │           │
         │  • Propagates hierarchy       │           │
         │  • Caches world matrices      │           │
         └───────────┬───────────────────┘           │
                     │                               │
        ┌────────────┼────────────┐                  │
        ▼            ▼            ▼                  │
┌──────────┐  ┌──────────┐  ┌──────────┐           │
│AISystem  │  │Animation │  │ Physics  │           │
│Priority: │  │  System  │  │  System  │           │
│ DEFAULT  │  │Priority: │  │Priority: │           │
│          │  │ANIMATION │  │ PHYSICS  │           │
└────┬─────┘  └────┬─────┘  └────┬─────┘           │
     │             │             │                  │
     │             │             │                  │
     └─────────────┴─────────────┴──────────────────┘
                          │
                          ▼
                  ┌──────────────┐
                  │ AudioSystem  │
                  │  Priority:   │
                  │ POST_UPDATE  │
                  └──────────────┘
```

---

## 2. Input to Rendering Pipeline

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Input → Rendering Data Flow                              │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────┐
│   Player    │
│   Input     │
│ (keyboard/  │
│ mouse/pad)  │
└──────┬──────┘
       │
       ▼
┌─────────────────────────────┐
│     InputSystem.update()    │
│                             │
│  • Polls input devices      │
│  • Updates InputManager     │
│  • Processes contexts       │
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────┐
│  Gameplay Code (External)   │
│                             │
│  const move = inputManager  │
│    .getAction('gameplay',   │
│               'move');      │
│                             │
│  if (move.isTriggered()) {  │
│    transform.translate(...) │
│  }                          │
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────┐
│   TransformComponent        │
│                             │
│  position: Vector3          │◄───────┐
│  rotation: Quaternion       │        │
│  scale: Vector3             │        │
│                             │        │
│  _localMatrix: Matrix4      │        │
│  _worldMatrix: Matrix4      │        │
│  _dirty: boolean            │        │
└──────────┬──────────────────┘        │
           │                           │
           ▼                           │
┌─────────────────────────────┐        │
│  TransformSystem.update()   │        │
│                             │        │
│  1. updateLocalMatrices()   │        │
│  2. buildDepthGroups()      │        │
│  3. updateWorldMatrices()   │        │
└──────────┬──────────────────┘        │
           │                           │
           ▼                           │
┌─────────────────────────────┐        │
│ RenderSystem.update()       │        │
│                             │        │
│ 1. extractRenderScene()     │────────┘
│    • Query MeshComponent    │    reads
│    • Query CameraComponent  │
│    • Query LightComponent   │
│                             │
│ 2. synchronizeTransforms()  │
│    • Copy to SceneNode      │
│                             │
│ 3. renderCameras()          │
│    • For each camera        │
│    • renderer.render(...)   │
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────┐
│   RenderGraph.execute()     │
│                             │
│  • Shadow Pass              │
│  • Geometry Pass            │
│  • Lighting Pass            │
│  • Post-Processing          │
└──────────┬──────────────────┘
           │
           ▼
      ┌─────────┐
      │  Frame  │
      │ Output  │
      └─────────┘
```

---

## 3. Physics ⟷ Transform Bidirectional Sync

```
┌─────────────────────────────────────────────────────────────────────────────┐
│              Physics ⟷ Transform Bidirectional Sync                         │
└─────────────────────────────────────────────────────────────────────────────┘

                    WRITE PHASE (Before Physics)
                    ────────────────────────────

┌────────────────────┐              ┌────────────────────┐
│ TransformComponent │              │ RigidBodyComponent │
│                    │              │                    │
│  position ─────────┼──────────────┼───► body.position  │
│  rotation ─────────┼──────────────┼───► body.rotation  │
│                    │    Copy      │                    │
└────────────────────┘              └─────────┬──────────┘
                                              │
                                              │
                    SIMULATION PHASE          │
                    ────────────────          │
                                              │
                                              ▼
                              ┌──────────────────────────┐
                              │ PhysicsWorld.step(dt)    │
                              │                          │
                              │  1. Apply forces/gravity │
                              │  2. Integrate velocity   │
                              │  3. Detect collisions    │
                              │  4. Resolve constraints  │
                              │  5. Update positions     │
                              └────────────┬─────────────┘
                                           │
                                           │
                    READ PHASE (After Physics)
                    ──────────────────────────
                                           │
                                           ▼
┌────────────────────┐              ┌────────────────────┐
│ TransformComponent │              │ RigidBodyComponent │
│                    │              │                    │
│  position ◄────────┼──────────────┼──── body.position  │
│  rotation ◄────────┼──────────────┼──── body.rotation  │
│                    │   Copy back  │                    │
│  setDirty() ◄──────┼──────────────┤                    │
└────────────────────┘              └────────────────────┘
         │
         │
         ▼
┌────────────────────┐
│ TransformSystem    │
│                    │
│ Updates world      │
│ matrices on next   │
│ frame              │
└────────────────────┘


              COLLISION EVENT FLOW
              ────────────────────

┌────────────────────┐              ┌────────────────────┐
│   Body A           │   Collision  │   Body B           │
│   (Dynamic)        │◄────────────►│   (Dynamic)        │
└─────────┬──────────┘              └──────────┬─────────┘
          │                                     │
          └─────────────┬───────────────────────┘
                        │
                        ▼
        ┌───────────────────────────────┐
        │ PhysicsWorld.fireCollision()  │
        │                               │
        │ Event: 'collisionenter'       │
        │ Data: { bodyA, bodyB,         │
        │         manifold }            │
        └───────────────┬───────────────┘
                        │
                        ▼
        ┌───────────────────────────────┐
        │  Event Listeners (Gameplay)   │
        │                               │
        │  onCollisionEnter(event) {    │
        │    // Handle collision        │
        │    // Apply damage, effects   │
        │    // Play sounds             │
        │  }                            │
        └───────────────────────────────┘
```

---

## 4. Animation → Rendering Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Animation → Rendering Flow                               │
└─────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────┐
│ AnimationComponent   │
│                      │
│  mixer: AnimationMixer
│  skeleton: Skeleton  │
│  skinnedMesh: ...    │
│  stateMachine: ...   │
└──────────┬───────────┘
           │
           ▼
┌─────────────────────────────┐
│ AnimationSystem.update(dt)  │
│                             │
│ 1. Update state machine     │
│    (if present)             │
│                             │
│ 2. mixer.update(dt)         │
│    • Advance time           │
│    • Blend animations       │
│    • Compute pose           │
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────┐
│ updateSkeleton()            │
│                             │
│ const pose = mixer.getPose()│
│                             │
│ For each bone:              │
│   skeleton.setBonePosition()│
│   skeleton.setBoneRotation()│
│   skeleton.setBoneScale()   │
│                             │
│ skeleton.update()           │
│   • Compute bone matrices   │
│   • Apply hierarchy         │
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────┐
│ Skeleton                    │
│                             │
│  bones: Bone[]              │
│  boneMatrices: Matrix4[]    │
│                             │
│  Update bone transforms in  │
│  hierarchy order (parent →  │
│  child)                     │
└──────────┬──────────────────┘
           │
           ├──────────────────────────┐
           │                          │
           ▼                          ▼
┌──────────────────┐      ┌──────────────────┐
│ TransformComponent│      │ SkinnedMesh     │
│  (Root motion)   │      │                  │
│                  │      │  boneMatrices    │
│ If root motion   │      │  uniforms        │
│ enabled:         │      │                  │
│   position +=    │      │  Passed to GPU   │
│     rootDelta    │      │  for skinning    │
└──────────────────┘      └─────────┬────────┘
                                    │
                                    ▼
                          ┌──────────────────┐
                          │ RenderSystem     │
                          │                  │
                          │ Reads bone       │
                          │ matrices for     │
                          │ GPU skinning     │
                          └─────────┬────────┘
                                    │
                                    ▼
                          ┌──────────────────┐
                          │ GPU Skinning     │
                          │  Shader          │
                          │                  │
                          │  Vertex shader   │
                          │  transforms each │
                          │  vertex by bone  │
                          │  weights         │
                          └──────────────────┘
```

---

## 5. AI → Movement Pipeline

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        AI → Movement Pipeline                               │
└─────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────┐
│   AIComponent        │
│                      │
│  agent: NavAgent     │
│  behaviorTree: ...   │
│  stateMachine: ...   │
│  perception: ...     │
│  blackboard: ...     │
└──────────┬───────────┘
           │
           ▼
┌─────────────────────────────┐
│ AISystem.update(dt)         │
│                             │
│ 1. updateAgents()           │
│    • Pathfinding            │
│    • Steering               │
│    • Obstacle avoidance     │
│                             │
│ 2. updateBehaviors()        │
│    • Tick behavior tree     │
│    • Update state machine   │
│                             │
│ 3. updatePerception()       │
│    • Update sight           │
│    • Update memory          │
│    • Find targets           │
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────┐
│ NavAgent.update()           │
│                             │
│ Path following:             │
│  • Get current waypoint     │
│  • Calculate steering       │
│  • Avoid obstacles          │
│  • Update velocity          │
│                             │
│ Position integration:       │
│  position += velocity * dt  │
│  heading = normalize(vel)   │
└──────────┬──────────────────┘
           │
           ├──────────────────┬───────────────────┐
           │                  │                   │
           ▼                  ▼                   ▼
┌──────────────────┐ ┌─────────────────┐ ┌──────────────────┐
│TransformComponent│ │   Blackboard    │ │   Perception     │
│                  │ │                 │ │                  │
│ position =       │ │ Set('position', │ │ Update position  │
│   agent.position │ │     position)   │ │ Update forward   │
│                  │ │                 │ │                  │
│ rotation =       │ │ Set('velocity', │ │ Raycast for      │
│   lookRotation() │ │     velocity)   │ │ visible targets  │
│                  │ │                 │ │                  │
│ setDirty()       │ │ Set('hasArrived'│ │ Store in memory  │
└──────────────────┘ │     arrived)    │ └──────────────────┘
                     └─────────────────┘
           │
           ▼
┌──────────────────────┐
│  TransformSystem     │
│                      │
│  Updates world       │
│  matrices            │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│  PhysicsSystem       │◄──────┐
│  (Optional)          │       │
│                      │       │
│  Can read transform  │       │
│  for collision       │       │
│  detection           │       │
└──────────────────────┘       │
                               │
                               │
┌──────────────────────────────┴─────┐
│  Behavior Tree / State Machine     │
│                                    │
│  Reads blackboard:                 │
│    • position                      │
│    • velocity                      │
│    • hasArrived                    │
│    • target                        │
│    • targetPosition                │
│                                    │
│  Makes decisions:                  │
│    • Patrol / Chase / Flee         │
│    • Attack / Defend               │
│    • Set new destination           │
└────────────────────────────────────┘
```

---

## 6. Audio Spatial Integration

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Audio Spatial Integration                                │
└─────────────────────────────────────────────────────────────────────────────┘

                    AUDIO SOURCE FLOW
                    ─────────────────

┌──────────────────────┐
│  Entity (Sound)      │
│                      │
│  TransformComponent  │
│  AudioSourceComponent│
└──────────┬───────────┘
           │
           ▼
┌─────────────────────────────┐
│ AudioSystem.update()        │
│                             │
│ updateAudioSources()        │
│                             │
│ For each entity with        │
│ AudioSourceComponent:       │
│                             │
│   if (spatial):             │
│     read TransformComponent │
│     update SpatialAudio     │
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────┐
│ SpatialAudio                │
│                             │
│ setPosition(transform.pos)  │
│ setOrientation(transform.fwd)
│ updateVelocity(dt)          │
│                             │
│ Updates Web Audio API       │
│ PannerNode:                 │
│  • position                 │
│  • orientation              │
│  • distance model           │
│  • Doppler effect           │
└─────────────────────────────┘


                    AUDIO LISTENER FLOW
                    ───────────────────

┌──────────────────────┐
│  Entity (Camera)     │
│                      │
│  TransformComponent  │
│  AudioListenerComponent
└──────────┬───────────┘
           │
           ▼
┌─────────────────────────────┐
│ AudioSystem.update()        │
│                             │
│ updateListener()            │
│                             │
│ Find listener entity        │
│ (cache for efficiency)      │
│                             │
│ Read TransformComponent:    │
│   • position                │
│   • forward                 │
│   • up                      │
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────┐
│ AudioListener               │
│                             │
│ setPosition(transform.pos)  │
│ setOrientation(fwd, up)     │
│ updateVelocity(dt)          │
│                             │
│ Updates Web Audio API       │
│ AudioListener:              │
│  • positionX/Y/Z            │
│  • forwardX/Y/Z             │
│  • upX/Y/Z                  │
└─────────────────────────────┘


                    SPATIAL AUDIO CALCULATION
                    ─────────────────────────

        ┌─────────────┐              ┌─────────────┐
        │AudioListener│              │AudioSource  │
        │  (Camera)   │              │   (Enemy)   │
        │             │              │             │
        │ position:   │              │ position:   │
        │  (0, 0, 0)  │              │  (10, 0, 5) │
        └──────┬──────┘              └──────┬──────┘
               │                            │
               │      ┌──────────────┐      │
               └──────►  Calculate   ◄──────┘
                      │              │
                      │ • Distance   │
                      │ • Direction  │
                      │ • Attenuation│
                      │ • Pan (L/R)  │
                      │ • Doppler    │
                      └──────┬───────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │  Audio Output   │
                    │                 │
                    │  Left speaker:  │
                    │    volume * pan │
                    │                 │
                    │  Right speaker: │
                    │    volume*(1-pan)
                    └─────────────────┘
```

---

## 7. Event Bus Communication

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Event Bus Communication Flow                             │
└─────────────────────────────────────────────────────────────────────────────┘

                    EVENT REGISTRATION
                    ──────────────────

┌─────────────────────────────┐
│  System A (Publisher)       │
│                             │
│  EventBus.emit(             │
│    'physics:collision',     │
│    { bodyA, bodyB }         │
│  )                          │
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────┐
│  EventBus                   │
│                             │
│  handlers: Map<             │
│    event → HandlerReg[]     │
│  >                          │
│                             │
│  Priority-sorted handlers   │
│  High priority → Low        │
└──────────┬──────────────────┘
           │
           ├──────────────────────────┬──────────────────────┐
           │                          │                      │
           ▼                          ▼                      ▼
┌──────────────────┐    ┌──────────────────┐   ┌──────────────────┐
│ System B         │    │ System C         │   │ System D         │
│ (Subscriber)     │    │ (Subscriber)     │   │ (Subscriber)     │
│                  │    │                  │   │                  │
│ Priority: 10     │    │ Priority: 5      │   │ Priority: 0      │
│                  │    │                  │   │                  │
│ EventBus.on(     │    │ EventBus.on(     │   │ EventBus.on(     │
│   'physics:...'  │    │   'physics:...'  │   │   'physics:...'  │
│   callback       │    │   callback       │   │   callback       │
│ )                │    │ )                │   │ )                │
└──────────────────┘    └──────────────────┘   └──────────────────┘


                    EVENT DISPATCH FLOW
                    ───────────────────

┌─────────────────────────────┐
│ PhysicsWorld detects        │
│ collision                   │
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────┐
│ PhysicsWorld.fireCollision()│
│                             │
│ addEventListener(...)       │
│ handlers execute            │
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────┐
│ Gameplay Systems receive    │
│ collision event             │
│                             │
│ • Play impact sound         │
│ • Apply damage              │
│ • Spawn particles           │
│ • Update score              │
└─────────────────────────────┘


                    ENGINE EVENTS
                    ─────────────

┌─────────────────────────────┐
│ Engine Lifecycle            │
│                             │
│ EventBus.emit('engine:start')
│ EventBus.emit('engine:pause')
│ EventBus.emit('engine:resume')
│ EventBus.emit('engine:stop')
└──────────┬──────────────────┘
           │
           ├────────────────┬────────────────┐
           │                │                │
           ▼                ▼                ▼
    ┌───────────┐   ┌───────────┐   ┌───────────┐
    │ Physics   │   │ Audio     │   │ Network   │
    │ pause/    │   │ pause/    │   │ disconnect│
    │ resume    │   │ resume    │   │           │
    └───────────┘   └───────────┘   └───────────┘


                    SCENE EVENTS
                    ────────────

┌─────────────────────────────┐
│ Scene Management            │
│                             │
│ EventBus.emit(              │
│   'scene:load',             │
│   { sceneName: 'Level1' }   │
│ )                           │
└──────────┬──────────────────┘
           │
           ├────────────────┬────────────────┐
           │                │                │
           ▼                ▼                ▼
    ┌───────────┐   ┌───────────┐   ┌───────────┐
    │ Asset     │   │ Physics   │   │ AI        │
    │ Loader    │   │ reset     │   │ reset     │
    │           │   │ world     │   │ agents    │
    └───────────┘   └───────────┘   └───────────┘
```

---

## 8. Component Dependency Graph

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Component Dependency Graph                               │
└─────────────────────────────────────────────────────────────────────────────┘

                    CORE COMPONENTS
                    ───────────────

              ┌──────────────────────┐
              │ TransformComponent   │ ◄─────┐
              │                      │       │
              │  • position          │       │ Required by
              │  • rotation          │       │ almost all
              │  • scale             │       │ systems
              │  • worldMatrix       │       │
              └──────────┬───────────┘       │
                         │                   │
        ┌────────────────┼────────────────┐  │
        │                │                │  │
        ▼                ▼                ▼  │
┌──────────────┐ ┌──────────────┐ ┌─────────────────┐
│ Hierarchy    │ │ RigidBody    │ │ MeshComponent   │
│ Component    │ │ Component    │ │                 │
│              │ │              │ │  • meshId       │
│  • parent    │ │  • body      │ │  • materialId   │
│  • children  │ │  • mass      │ │  • visible      │
│  • depth     │ │  • type      │ │  • castShadows  │
└──────────────┘ └──────────────┘ └────────┬────────┘
                                           │
                                           │
                    RENDERING COMPONENTS  │
                    ────────────────────  │
                                           │
        ┌──────────────────────────────────┼──────────────┐
        │                                  │              │
        ▼                                  ▼              ▼
┌──────────────┐              ┌──────────────┐  ┌──────────────┐
│ Camera       │              │ Light        │  │ Material     │
│ Component    │              │ Component    │  │ Component    │
│              │              │              │  │ (interface)  │
│  • fov       │              │  • type      │  │              │
│  • near      │              │  • color     │  │  • shader    │
│  • far       │              │  • intensity │  │  • textures  │
│  • active    │              │  • shadows   │  │  • uniforms  │
└──────────────┘              └──────────────┘  └──────────────┘


                    ANIMATION COMPONENTS
                    ────────────────────

┌──────────────────────┐
│ AnimationComponent   │
│                      │
│  • mixer             │
│  • skeleton ─────────┼───► ┌──────────────────┐
│  • skinnedMesh       │     │ Skeleton         │
│  • stateMachine      │     │                  │
└──────────────────────┘     │  • bones[]       │
                             │  • boneMatrices  │
                             └──────────────────┘


                    AI COMPONENTS
                    ─────────────

┌──────────────────────┐
│ AIComponent          │
│                      │
│  • agent ────────────┼───► ┌──────────────────┐
│  • behaviorTree      │     │ NavAgent         │
│  • perception        │     │                  │
│  • blackboard        │     │  • position      │
└──────────────────────┘     │  • velocity      │
                             │  • path          │
                             └──────────────────┘


                    AUDIO COMPONENTS
                    ────────────────

┌──────────────────────┐              ┌──────────────────┐
│ AudioSourceComponent │              │ AudioListener    │
│                      │              │ Component        │
│  • clip              │              │                  │
│  • spatial           │              │  • listener      │
│  • spatialAudio      │              └──────────────────┘
└──────────────────────┘


                    COMPONENT SHARING
                    ─────────────────

┌─────────────────────────────────────────────────────────┐
│             Entity with Multiple Components             │
│                                                         │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐       │
│  │ Transform  │  │ RigidBody  │  │   Mesh     │       │
│  └────────────┘  └────────────┘  └────────────┘       │
│                                                         │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐       │
│  │ Animation  │  │    AI      │  │AudioSource │       │
│  └────────────┘  └────────────┘  └────────────┘       │
│                                                         │
│  All components share the same TransformComponent      │
│  for position/rotation/scale                           │
└─────────────────────────────────────────────────────────┘
```

---

## 9. System Update Order

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         System Update Order                                 │
└─────────────────────────────────────────────────────────────────────────────┘

Frame N:
────────

    1. INPUT (Priority: -1000)
       ┌──────────────────────────────┐
       │ InputSystem.update()         │
       │  • Poll input devices        │
       │  • Update InputManager       │
       │  • Record input (if enabled) │
       └──────────────────────────────┘
                   │
                   ▼
    2. PRE_UPDATE (Priority: -100)
       ┌──────────────────────────────┐
       │ TransformSystem.update()     │
       │  • Update local matrices     │
       │  • Build depth groups        │
       │  • Update world matrices     │
       └──────────────────────────────┘
                   │
                   ▼
    3. DEFAULT (Priority: 0)
       ┌──────────────────────────────┐
       │ AISystem.update()            │
       │  • Update agents             │
       │  • Tick behavior trees       │
       │  • Update perception         │
       └──────────────────────────────┘
                   │
                   ▼
    4. PHYSICS (Priority: 100)
       ┌──────────────────────────────┐
       │ PhysicsSystem.fixedUpdate()  │
       │  • Step physics world        │
       │  • Collision detection       │
       │  • Constraint solving        │
       │  • Sync to transforms        │
       └──────────────────────────────┘
                   │
                   ▼
    5. ANIMATION (Priority: 200)
       ┌──────────────────────────────┐
       │ AnimationSystem.update()     │
       │  • Update mixers             │
       │  • Update skeletons          │
       │  • Update morph targets      │
       └──────────────────────────────┘
                   │
                   ▼
    6. POST_UPDATE (Priority: 500)
       ┌──────────────────────────────┐
       │ AudioSystem.update()         │
       │  • Update listener           │
       │  • Update audio sources      │
       │  • Spatial audio calc        │
       └──────────────────────────────┘
                   │
                   ▼
    7. RENDER (Priority: 1000)
       ┌──────────────────────────────┐
       │ RenderSystem.update()        │
       │  • Extract render scene      │
       │  • Sync transforms           │
       │  • Render cameras            │
       └──────────────────────────────┘

Note: Systems with higher priority run later in the frame
```

---

## Legend

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Diagram Legend                                 │
└─────────────────────────────────────────────────────────────────────────────┘

─────►  Data flow direction (unidirectional)
◄────►  Bidirectional data sync
├─────  Branch / Multiple outputs
│       Connection
▼       Flow downward

┌─────┐
│ Box │  Component, System, or Process
└─────┘

  •     Bullet point / Sub-item
```

---

These diagrams illustrate the complete data flow architecture of G3D 5.0, showing how data moves between systems, components, and subsystems to create a cohesive game engine.
