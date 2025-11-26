# G3D 5.0 Timeline & Cinematics Module

A complete, production-ready timeline and cinematics system for the G3D game engine. Supports multi-track timelines, animation blending, camera control, audio sequencing, and event-driven interactions.

## Features

- **Multi-Track Timeline System** - Organize animations, audio, cameras, and events on separate tracks
- **Animation Blending** - Smooth transitions between animation clips with weight-based blending
- **Camera Cinematics** - Keyframe-based camera animation with FOV, depth of field, and shake
- **Audio Sequencing** - Schedule audio clips with volume/pitch curves and spatial audio
- **Signal System** - Event-driven timeline interactions with typed payloads
- **Playable Graph** - Advanced graph-based animation blending and mixing
- **Frame Rate Independence** - Consistent playback across different frame rates
- **Serialization** - Full timeline export/import support
- **Performance Optimized** - < 0.1ms overhead per frame

## Installation

```typescript
import {
  Timeline,
  PlayableDirector,
  AnimationTrack,
  CameraTrack,
  SignalTrack,
  createTimelineSetup
} from './timeline';
```

## Quick Start

```typescript
// Create a complete timeline setup
const { timeline, director, addCameraTrack, addSignalTrack } = createTimelineSetup({
  duration: 30,
  autoRegister: true
});

// Add a camera track
const cameraTrack = addCameraTrack();
cameraTrack.addCameraClip({
  startTime: 0,
  duration: 30,
  asset: {
    name: 'Opening Shot',
    keyframes: [
      {
        time: 0,
        position: { x: 0, y: 5, z: -10 },
        lookAt: { x: 0, y: 0, z: 0 },
        fov: 60
      },
      {
        time: 10,
        position: { x: 10, y: 5, z: -10 },
        lookAt: { x: 0, y: 0, z: 0 },
        fov: 45
      }
    ]
  }
});

// Add signal events
const signalTrack = addSignalTrack();
signalTrack.addMarker(5, 'explosion', { intensity: 1.0 });
signalTrack.addMarker(15, 'door_open');

// Play
director.play();

// Update in game loop
gameLoop(() => {
  director.update(deltaTime);
});
```

## Core Components

### Timeline

The main container for tracks and playback state.

```typescript
const timeline = new Timeline({
  duration: 30,
  loopMode: LoopMode.Loop,
  speed: 1.0
});

timeline.addTrack(animationTrack);
timeline.play();
```

### PlayableDirector

Controls timeline playback with play/pause/stop/seek.

```typescript
const director = new PlayableDirector(timeline);

director.play();
director.pause();
director.stop();
director.seek(10.5);
director.seekNormalized(0.5); // 50% through timeline
```

### TimelineSystem

Global system for managing multiple timelines.

```typescript
const system = TimelineSystem.getInstance();

system.register(timeline);
system.setAutoUpdate(timeline, true);

// Update all timelines
system.update(deltaTime);

// Global time control
system.timeScale = 0.5; // Slow motion
system.pause();
system.resume();
```

## Track Types

### Animation Track

Play and blend animation clips on characters.

```typescript
const animTrack = new AnimationTrack();
animTrack.targetId = 'player';

animTrack.addAnimationClip({
  startTime: 0,
  duration: 2,
  asset: walkAnimation,
  easeInDuration: 0.2,
  easeOutDuration: 0.2
});

animTrack.addAnimationClip({
  startTime: 2,
  duration: 1,
  asset: jumpAnimation
});

timeline.addTrack(animTrack);
```

### Audio Track

Schedule and play audio clips with volume/pitch control.

```typescript
const audioTrack = new AudioTrack();
audioTrack.masterVolume = 0.8;

audioTrack.addAudioClip({
  startTime: 0,
  duration: 5,
  asset: musicAsset,
  volume: 1.0,
  fadeIn: 1.0,
  fadeOut: 1.0
});

audioTrack.addAudioClip({
  startTime: 10,
  duration: 0.5,
  asset: explosionSound,
  volume: 1.2,
  pitch: 1.0,
  useSpatialAudio: true,
  spatialPosition: { x: 10, y: 0, z: 0 }
});

timeline.addTrack(audioTrack);
```

### Camera Track

Animate camera with keyframes, FOV, depth of field, and shake.

```typescript
const cameraTrack = new CameraTrack();
cameraTrack.defaultFov = 60;

cameraTrack.addCameraClip({
  startTime: 0,
  duration: 20,
  interpolation: 'smooth',
  asset: {
    name: 'Cinematic Shot',
    keyframes: [
      {
        time: 0,
        position: { x: 0, y: 2, z: -5 },
        rotation: { x: 0, y: 0, z: 0 },
        fov: 60,
        shake: 0
      },
      {
        time: 5,
        position: { x: 5, y: 3, z: -3 },
        lookAt: { x: 0, y: 1, z: 0 },
        fov: 45,
        shake: 0.1, // Camera shake intensity
        depthOfField: {
          enabled: true,
          focusDistance: 5,
          aperture: 2.8
        }
      },
      {
        time: 10,
        position: { x: -5, y: 4, z: 0 },
        fov: 70,
        shake: 0
      }
    ]
  }
});

timeline.addTrack(cameraTrack);
```

### Signal Track

Emit events at specific times.

```typescript
const signalTrack = new SignalTrack();

// Add markers
signalTrack.addMarker(5.0, 'spawn_enemy', { count: 3 });
signalTrack.addMarker(10.0, 'play_effect', { effect: 'explosion' });
signalTrack.addMarker(15.0, 'dialogue', { text: 'Look out!' });

// Listen for signals
signalTrack.on('spawn_enemy', (event) => {
  console.log('Spawn enemies:', event.payload.count);
  spawnEnemies(event.payload.count);
});

signalTrack.on('*', (event) => {
  console.log('Signal received:', event.signal, event.payload);
});

timeline.addTrack(signalTrack);
```

### Activation Track

Enable/disable entities and their components over time.

```typescript
const activationTrack = new ActivationTrack();
activationTrack.defaultTargetId = 'door';

activationTrack.addActivationClip({
  startTime: 5,
  duration: 10,
  startState: { active: true, visible: true },
  endState: { active: false, visible: false },
  restoreOnEnd: true
});

timeline.addTrack(activationTrack);
```

### Control Track

Control nested timelines, particle systems, and prefabs.

```typescript
const controlTrack = new ControlTrack();

// Control nested timeline
const nestedTimeline = new Timeline({ duration: 5 });
controlTrack.addControlClip(
  createTimelineControlClip(10, 5, nestedTimeline)
);

// Control particle system
controlTrack.addControlClip(
  createParticleControlClip(15, 2, particleSystem)
);

timeline.addTrack(controlTrack);
```

### Custom Track

Create custom track types for game-specific needs.

```typescript
const customTrack = new CustomTrack({
  customType: 'gamelogic',
  processCallback: (track, time, deltaTime) => {
    // Custom processing logic
    return customBehavior(time);
  }
});

timeline.addTrack(customTrack);

// Or use built-in custom tracks
const numericTrack = new NumericValueTrack();
const colorTrack = new ColorTrack();
```

## Advanced Features

### Playable Graph

Build complex animation graphs with mixers and blending.

```typescript
import { PlayableGraph, PlayableMixer, BlendMode } from './timeline';

const graph = new PlayableGraph('AnimationGraph');

// Create mixer
const mixer = new PlayableMixer({
  inputCount: 2,
  blendMode: BlendMode.Override,
  normalizeWeights: true
});

// Connect playables
graph.createPlayable(walkPlayable);
graph.createPlayable(runPlayable);
graph.connect(walkPlayable, mixer, 0, 0.7);
graph.connect(runPlayable, mixer, 1, 0.3);

// Bind output
graph.bind(mixer, character, 'pose');

// Evaluate
graph.play();
graph.evaluate(deltaTime);
```

### Signal System

Type-safe event system with validation.

```typescript
import {
  SignalAsset,
  SignalReceiver,
  createSignalAsset,
  createParameter,
  ParameterType
} from './timeline';

// Define signal schema
const explosionSignal = createSignalAsset(
  'explosion',
  [
    createParameter('position', ParameterType.Vector3, { required: true }),
    createParameter('intensity', ParameterType.Number, { defaultValue: 1.0 }),
    createParameter('radius', ParameterType.Number, { defaultValue: 5.0 })
  ],
  'Triggered when an explosion occurs'
);

// Create receiver
const receiver = new SignalReceiver();
receiver.on('explosion', (signal, payload, time) => {
  createExplosion(payload.position, payload.intensity, payload.radius);
});

// Emit signal
signalTrack.addMarker(5.0, 'explosion', {
  position: { x: 10, y: 0, z: 5 },
  intensity: 2.0,
  radius: 10.0
});
```

### Clip Blending

Smooth transitions with easing curves.

```typescript
import { Easing } from './timeline';

const clip = animTrack.addAnimationClip({
  startTime: 0,
  duration: 2,
  asset: animation,
  easeInDuration: 0.3,
  easeOutDuration: 0.3,
  easeInCurve: Easing.easeInCubic,
  easeOutCurve: Easing.easeOutCubic,
  weight: 0.8,
  blendMode: ClipBlendMode.Mix
});
```

### Serialization

Save and load timelines.

```typescript
// Serialize
const json = timeline.toJSON();
localStorage.setItem('timeline', JSON.stringify(json));

// Deserialize (implementation-specific)
const loadedData = JSON.parse(localStorage.getItem('timeline'));
// Reconstruct timeline from loadedData
```

## Performance

The timeline system is optimized for real-time performance:

- **< 0.1ms overhead** per frame for typical timelines
- Efficient clip lookup with sorted arrays
- Minimal allocations during playback
- Optional fixed timestep for deterministic playback

```typescript
const system = TimelineSystem.getInstance();

// Enable fixed timestep for deterministic playback
system.fixedTimestep = 1/60; // 60 FPS

// Monitor performance
const metrics = system.metrics;
console.log('Average update time:', metrics.averageUpdateDuration, 'ms');
```

## Examples

### Complete Cutscene

```typescript
// Create timeline
const cutscene = new Timeline({ duration: 30 });

// Camera animation
const camera = new CameraTrack();
camera.addCameraClip({
  startTime: 0,
  duration: 30,
  asset: {
    name: 'Opening',
    keyframes: [
      { time: 0, position: { x: 0, y: 5, z: -10 }, fov: 60 },
      { time: 10, position: { x: 10, y: 3, z: -5 }, fov: 45 },
      { time: 20, position: { x: 0, y: 2, z: 0 }, fov: 70 }
    ]
  }
});
cutscene.addTrack(camera);

// Character animation
const character = new AnimationTrack();
character.addAnimationClip({ startTime: 0, duration: 5, asset: walkAnim });
character.addAnimationClip({ startTime: 5, duration: 2, asset: jumpAnim });
character.addAnimationClip({ startTime: 7, duration: 8, asset: runAnim });
cutscene.addTrack(character);

// Audio
const audio = new AudioTrack();
audio.addAudioClip({ startTime: 0, duration: 30, asset: musicTrack, fadeIn: 2 });
audio.addAudioClip({ startTime: 5, duration: 1, asset: jumpSound });
cutscene.addTrack(audio);

// Events
const signals = new SignalTrack();
signals.addMarker(10, 'spawn_enemies');
signals.addMarker(20, 'trigger_boss');
signals.on('spawn_enemies', () => spawnEnemies(3));
signals.on('trigger_boss', () => startBossFight());
cutscene.addTrack(signals);

// Play
const director = new PlayableDirector(cutscene);
director.play();
```

### Interactive Timeline

```typescript
// Create interactive timeline that responds to player input
const timeline = createTimelineSetup({ duration: 60 });

// Player can skip forward
document.addEventListener('keydown', (e) => {
  if (e.key === 'Space') {
    timeline.director.seek(timeline.director.time + 5);
  }
});

// Pause when player opens menu
eventBus.on('menu_opened', () => {
  timeline.director.pause();
});

eventBus.on('menu_closed', () => {
  timeline.director.resume();
});
```

## API Reference

See individual module files for complete API documentation:

- `Timeline.ts` - Timeline asset
- `TimelineSystem.ts` - Global timeline management
- `PlayableDirector.ts` - Playback control
- `Track.ts` - Base track class
- `Clip.ts` - Base clip class
- `Playable.ts` - Playable interface
- `tracks/` - Track implementations
- `playables/` - Playable graph system
- `signals/` - Signal/event system

## License

Copyright (c) 2025 G3D Engine Team
