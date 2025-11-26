# G3D 5.0 PRD – Part 9: Infrastructure

**Parent Document:** `PRD-Final-00-Overview.md`

---

## 23. Networking

---

## 23.1 `src/net/` – Networking System

### Directory Structure (Key Files)

```
src/net/
├── NetManager.ts
├── Connection.ts
├── Transport.ts
├── WebSocketTransport.ts
├── WebRTCTransport.ts
├── Serialization.ts
├── BitStream.ts
├── replication/
│   ├── ReplicationManager.ts
│   ├── NetworkedComponent.ts
│   ├── StateSnapshot.ts
│   ├── DeltaCompression.ts
│   └── InterestManagement.ts
├── prediction/
│   ├── ClientPrediction.ts
│   ├── ServerReconciliation.ts
│   └── InputBuffer.ts
├── matchmaking/
│   ├── MatchmakingClient.ts
│   ├── LobbyManager.ts
│   └── RoomManager.ts
├── voice/
│   ├── VoiceChat.ts
│   ├── AudioEncoder.ts
│   └── SpatialVoice.ts
├── security/
│   ├── PacketEncryption.ts
│   ├── AntiCheat.ts
│   └── RateLimiter.ts
└── index.ts
```

---

### 23.1.1 `src/net/NetManager.ts`

**Role:** Central networking coordination.

**Public API:**
```typescript
class NetManager {
  // Connection
  connect(serverUrl: string, options?: ConnectionOptions): Promise<void>;
  disconnect(): void;
  get isConnected(): boolean;
  get connectionState(): ConnectionState;
  get latency(): number;
  get packetLoss(): number;

  // Mode
  get isServer(): boolean;
  get isClient(): boolean;
  get isHost(): boolean;

  // Server
  startServer(port: number, options?: ServerOptions): Promise<void>;
  stopServer(): void;
  get connectedClients(): ClientConnection[];

  // Messaging
  send(channel: string, data: any, reliable?: boolean): void;
  sendTo(clientId: number, channel: string, data: any, reliable?: boolean): void;
  broadcast(channel: string, data: any, reliable?: boolean): void;

  // Events
  onConnect: Signal<() => void>;
  onDisconnect: Signal<(reason: string) => void>;
  onMessage: Signal<(channel: string, data: any, sender?: number) => void>;
  onClientConnect: Signal<(client: ClientConnection) => void>;
  onClientDisconnect: Signal<(client: ClientConnection) => void>;
}

enum ConnectionState {
  DISCONNECTED,
  CONNECTING,
  CONNECTED,
  RECONNECTING
}
```

**Dependencies:**
- Depends on: `Transport`, `ReplicationManager`, `Serialization`
- Depended by: `NetReplicationSystem`, multiplayer games

**Implementation Checklist:**
- [ ] Client and server modes
- [ ] Host mode (listen server)
- [ ] Reliable and unreliable channels
- [ ] Message routing
- [ ] Connection state management
- [ ] Auto-reconnection
- [ ] Latency estimation
- [ ] **Performance:** 64 players supported
- [ ] **Tests:** Connection lifecycle, messaging

---

### 23.1.2 `src/net/replication/ReplicationManager.ts`

**Role:** Entity state replication.

**Public API:**
```typescript
class ReplicationManager {
  // Registration
  registerNetworkedEntity(entity: Entity): NetworkId;
  unregisterNetworkedEntity(entity: Entity): void;
  getNetworkedEntity(networkId: NetworkId): Entity | undefined;

  // Ownership
  setOwner(entity: Entity, clientId: number): void;
  getOwner(entity: Entity): number | null;
  hasAuthority(entity: Entity): boolean;

  // Snapshots
  createSnapshot(): StateSnapshot;
  applySnapshot(snapshot: StateSnapshot, interpolate: boolean): void;

  // Update
  update(dt: number): void;

  // Configuration
  sendRate: number;         // Snapshots per second
  interpolationDelay: number;
}
```

**Dependencies:**
- Depends on: `StateSnapshot`, `DeltaCompression`, `InterestManagement`
- Depended by: `NetReplicationSystem`

**Implementation Checklist:**
- [ ] Entity network ID assignment
- [ ] Authority management
- [ ] Snapshot creation and application
- [ ] Component replication rules
- [ ] Variable send rates
- [ ] **Performance:** 1000 entities replicated

---

### 23.1.3 `src/net/prediction/ClientPrediction.ts`

**Role:** Client-side prediction for responsive gameplay.

**Public API:**
```typescript
class ClientPrediction {
  // Configuration
  enabled: boolean;
  maxPredictionFrames: number;

  // Input
  recordInput(input: PlayerInput): void;
  getInputHistory(): PlayerInput[];

  // Prediction
  predict(entity: Entity, input: PlayerInput): void;
  reconcile(entity: Entity, serverState: EntityState, serverTick: number): void;

  // Statistics
  get predictionError(): number;
  get rollbackCount(): number;
}

interface PlayerInput {
  tick: number;
  timestamp: number;
  moveDirection: Vector2;
  actions: number;        // Bitmask
}
```

**Implementation Checklist:**
- [ ] Input recording with timestamps
- [ ] Local prediction application
- [ ] Server state reconciliation
- [ ] Rollback and replay
- [ ] Smooth error correction
- [ ] **Tests:** Prediction accuracy

---

### 23.1.4 `src/net/voice/VoiceChat.ts`

**Role:** Voice communication system.

**Public API:**
```typescript
class VoiceChat {
  // State
  start(): Promise<void>;
  stop(): void;
  get isActive(): boolean;

  // Transmitting
  setTransmitting(transmitting: boolean): void;
  get isTransmitting(): boolean;

  // Receiving
  setMuted(clientId: number, muted: boolean): void;
  setVolume(clientId: number, volume: number): void;

  // Spatial audio
  enableSpatialAudio(enabled: boolean): void;
  setListenerPosition(position: Vector3, forward: Vector3, up: Vector3): void;
  setSpeakerPosition(clientId: number, position: Vector3): void;

  // Configuration
  codec: 'opus' | 'pcm';
  quality: 'low' | 'medium' | 'high';
  noiseSupression: boolean;
}
```

**Implementation Checklist:**
- [ ] WebRTC audio streams
- [ ] Push-to-talk and voice activation
- [ ] Opus codec encoding
- [ ] Spatial audio integration
- [ ] Noise suppression
- [ ] **Tests:** Audio quality, latency

---

---

## 24. Input System

---

## 24.1 `src/input/` – Input System

### Directory Structure (Key Files)

```
src/input/
├── InputSystem.ts
├── InputManager.ts
├── InputAction.ts
├── InputBinding.ts
├── keyboard/
│   ├── KeyboardDevice.ts
│   └── KeyCodes.ts
├── mouse/
│   ├── MouseDevice.ts
│   └── MouseButton.ts
├── gamepad/
│   ├── GamepadDevice.ts
│   ├── GamepadMapping.ts
│   └── RumbleManager.ts
├── touch/
│   ├── TouchDevice.ts
│   ├── GestureRecognizer.ts
│   └── TouchJoystick.ts
├── pointer/
│   ├── PointerLock.ts
│   └── CursorManager.ts
└── index.ts
```

---

### 24.1.1 `src/input/InputSystem.ts`

**Role:** Central input processing and dispatching.

**Public API:**
```typescript
class InputSystem {
  // Devices
  get keyboard(): KeyboardDevice;
  get mouse(): MouseDevice;
  get gamepads(): GamepadDevice[];
  get touch(): TouchDevice;

  // Actions
  registerAction(action: InputAction): void;
  unregisterAction(name: string): void;
  getAction(name: string): InputAction | undefined;

  // Queries
  isActionPressed(name: string): boolean;
  isActionJustPressed(name: string): boolean;
  isActionJustReleased(name: string): boolean;
  getActionValue(name: string): number;
  getActionAxis(name: string): Vector2;

  // Update
  update(dt: number): void;

  // Events
  onAnyInput: Signal<(device: InputDevice, input: InputEvent) => void>;
}
```

**Dependencies:**
- Depends on: All device implementations
- Depended by: `Engine`, gameplay systems

**Implementation Checklist:**
- [ ] Multi-device support
- [ ] Action-based input abstraction
- [ ] Frame-based press/release detection
- [ ] Dead zone handling for analog
- [ ] Input buffering
- [ ] **Tests:** All input types

---

### 24.1.2 `src/input/InputAction.ts`

**Role:** Abstract input action with bindings.

**Public API:**
```typescript
class InputAction {
  readonly name: string;
  readonly type: 'button' | 'axis' | 'axis2d';

  // Bindings
  addBinding(binding: InputBinding): void;
  removeBinding(binding: InputBinding): void;
  get bindings(): InputBinding[];

  // State
  get isPressed(): boolean;
  get wasJustPressed(): boolean;
  get wasJustReleased(): boolean;
  get value(): number;
  get axis(): Vector2;

  // Configuration
  deadzone: number;
  sensitivity: number;
  inverted: boolean;
}

interface InputBinding {
  device: 'keyboard' | 'mouse' | 'gamepad' | 'touch';
  input: string;         // e.g., 'KeyW', 'LeftStickX', 'MouseButton0'
  modifiers?: string[];  // e.g., ['LeftShift']
  scale?: number;
}
```

**Implementation Checklist:**
- [ ] Multi-binding per action
- [ ] Modifier key support
- [ ] Axis combination into 2D
- [ ] Sensitivity and inversion
- [ ] Dead zone application

---

### 24.1.3 `src/input/gamepad/GamepadDevice.ts`

**Role:** Gamepad input handling.

**Public API:**
```typescript
class GamepadDevice {
  readonly index: number;
  readonly id: string;
  readonly mapping: GamepadMapping;

  // Buttons
  isButtonPressed(button: GamepadButton): boolean;
  isButtonJustPressed(button: GamepadButton): boolean;
  getButtonValue(button: GamepadButton): number;

  // Axes
  getAxis(axis: GamepadAxis): number;
  getStick(stick: 'left' | 'right'): Vector2;
  getTrigger(trigger: 'left' | 'right'): number;

  // Rumble
  rumble(strongMagnitude: number, weakMagnitude: number, duration: number): void;
  stopRumble(): void;

  // State
  get isConnected(): boolean;
}

enum GamepadButton {
  A, B, X, Y,
  LB, RB, LT, RT,
  BACK, START, GUIDE,
  LS, RS,
  DPAD_UP, DPAD_DOWN, DPAD_LEFT, DPAD_RIGHT
}

enum GamepadAxis {
  LEFT_STICK_X, LEFT_STICK_Y,
  RIGHT_STICK_X, RIGHT_STICK_Y,
  LEFT_TRIGGER, RIGHT_TRIGGER
}
```

**Implementation Checklist:**
- [ ] Standard mapping support
- [ ] Custom mapping for non-standard controllers
- [ ] Dead zone per axis
- [ ] Rumble/haptics
- [ ] Hot-plug detection
- [ ] **Tests:** Various controllers

---

### 24.1.4 `src/input/touch/GestureRecognizer.ts`

**Role:** Multi-touch gesture detection.

**Public API:**
```typescript
class GestureRecognizer {
  // Gestures
  onTap: Signal<(position: Vector2, count: number) => void>;
  onLongPress: Signal<(position: Vector2) => void>;
  onPan: Signal<(delta: Vector2, state: GestureState) => void>;
  onPinch: Signal<(scale: number, center: Vector2, state: GestureState) => void>;
  onRotate: Signal<(angle: number, center: Vector2, state: GestureState) => void>;
  onSwipe: Signal<(direction: Vector2, velocity: number) => void>;

  // Configuration
  tapMaxDuration: number;
  longPressMinDuration: number;
  swipeMinVelocity: number;

  // Update
  update(touches: Touch[]): void;
}

enum GestureState { BEGAN, CHANGED, ENDED, CANCELLED }
```

**Implementation Checklist:**
- [ ] Tap (single, double, triple)
- [ ] Long press
- [ ] Pan/drag
- [ ] Pinch zoom
- [ ] Two-finger rotation
- [ ] Swipe detection
- [ ] **Tests:** All gesture types

---

---

## 25. UI System

---

## 25.1 `src/ui/` – UI System

### Directory Structure (Key Files)

```
src/ui/
├── UISystem.ts
├── UICanvas.ts
├── UIElement.ts
├── Layout.ts
├── components/
│   ├── Button.ts
│   ├── Text.ts
│   ├── Image.ts
│   ├── Panel.ts
│   ├── ScrollView.ts
│   ├── Slider.ts
│   ├── Toggle.ts
│   ├── InputField.ts
│   ├── Dropdown.ts
│   ├── ProgressBar.ts
│   └── ListView.ts
├── layout/
│   ├── FlexLayout.ts
│   ├── GridLayout.ts
│   ├── StackLayout.ts
│   └── AnchorLayout.ts
├── styling/
│   ├── StyleSheet.ts
│   ├── Theme.ts
│   └── Transitions.ts
├── rendering/
│   ├── UIRenderer.ts
│   ├── TextRenderer.ts
│   ├── UIBatcher.ts
│   └── UIAtlas.ts
└── index.ts
```

---

### 25.1.1 `src/ui/UISystem.ts`

**Role:** Central UI management and rendering.

**Public API:**
```typescript
class UISystem {
  // Canvases
  createCanvas(config?: CanvasConfig): UICanvas;
  destroyCanvas(canvas: UICanvas): void;
  get canvases(): UICanvas[];

  // Rendering
  render(context: RenderContext): void;

  // Input
  handleInput(event: InputEvent): boolean;
  get focusedElement(): UIElement | null;
  setFocus(element: UIElement | null): void;

  // Theming
  setTheme(theme: Theme): void;
  get theme(): Theme;

  // Localization
  setLocale(locale: string): void;
  translate(key: string): string;
}

interface CanvasConfig {
  renderMode: 'screenSpace' | 'worldSpace';
  sortingOrder: number;
  referenceResolution: Vector2;
  scaleMode: 'constantPixelSize' | 'scaleWithScreen' | 'constantPhysicalSize';
}
```

**Dependencies:**
- Depends on: `UICanvas`, `UIRenderer`, `Theme`
- Depended by: `Engine`, all UI components

**Implementation Checklist:**
- [ ] Multi-canvas support
- [ ] Screen space and world space modes
- [ ] Resolution scaling
- [ ] Input event routing
- [ ] Focus management
- [ ] Theming system
- [ ] **Performance:** 1000 elements @ 60 FPS
- [ ] **Tests:** Rendering, input, focus

---

### 25.1.2 `src/ui/UIElement.ts`

**Role:** Base class for all UI elements.

**Public API:**
```typescript
abstract class UIElement {
  // Identity
  readonly id: string;
  name: string;
  tag: string;

  // Hierarchy
  parent: UIElement | null;
  children: UIElement[];
  addChild(child: UIElement): void;
  removeChild(child: UIElement): void;
  getChildByName(name: string): UIElement | undefined;

  // Transform
  position: Vector2;
  size: Vector2;
  pivot: Vector2;
  anchor: Anchor;
  rotation: number;
  scale: Vector2;

  // Computed
  get worldPosition(): Vector2;
  get worldBounds(): Rect;

  // State
  visible: boolean;
  enabled: boolean;
  interactable: boolean;

  // Style
  style: Style;
  addClass(className: string): void;
  removeClass(className: string): void;

  // Events
  onClick: Signal<(event: PointerEvent) => void>;
  onPointerEnter: Signal<(event: PointerEvent) => void>;
  onPointerExit: Signal<(event: PointerEvent) => void>;
  onPointerDown: Signal<(event: PointerEvent) => void>;
  onPointerUp: Signal<(event: PointerEvent) => void>;

  // Lifecycle
  onEnable?(): void;
  onDisable?(): void;
  onDestroy?(): void;
}
```

**Implementation Checklist:**
- [ ] Hierarchy management
- [ ] Transform system
- [ ] Anchor and pivot
- [ ] Style application
- [ ] Event handling
- [ ] Lifecycle hooks

---

### 25.1.3 UI Components Group Checklist

**All UI components must implement:**

- [ ] Extends `UIElement`
- [ ] Proper measure/layout
- [ ] Theming support
- [ ] Accessibility attributes
- [ ] Keyboard navigation
- [ ] Touch-friendly hit areas
- [ ] Animation states

**Key Components:**

**Button.ts:**
- [ ] Click handling
- [ ] States: normal, hover, pressed, disabled
- [ ] Icon and text support
- [ ] Configurable transition

**Text.ts:**
- [ ] Font rendering
- [ ] Rich text (bold, italic, color)
- [ ] Text wrapping
- [ ] Alignment (left, center, right, justify)
- [ ] Overflow modes (clip, ellipsis, overflow)

**InputField.ts:**
- [ ] Text input and editing
- [ ] Placeholder text
- [ ] Selection and cursor
- [ ] Copy/paste support
- [ ] Input validation
- [ ] Password mode

**ScrollView.ts:**
- [ ] Content scrolling
- [ ] Scroll bars (optional)
- [ ] Inertia scrolling
- [ ] Scroll snapping
- [ ] Virtual scrolling for large lists

**Slider.ts:**
- [ ] Value selection
- [ ] Range (min, max, step)
- [ ] Horizontal and vertical
- [ ] Fill and handle customization

---

### 25.1.4 `src/ui/layout/FlexLayout.ts`

**Role:** Flexbox-style layout.

**Public API:**
```typescript
class FlexLayout extends Layout {
  direction: 'row' | 'column' | 'row-reverse' | 'column-reverse';
  justifyContent: 'flex-start' | 'flex-end' | 'center' | 'space-between' | 'space-around' | 'space-evenly';
  alignItems: 'flex-start' | 'flex-end' | 'center' | 'stretch' | 'baseline';
  flexWrap: 'nowrap' | 'wrap' | 'wrap-reverse';
  gap: number;

  // Child properties
  setChildFlex(child: UIElement, grow: number, shrink: number, basis: number): void;
  setChildAlign(child: UIElement, align: string): void;
}
```

**Implementation Checklist:**
- [ ] Main axis direction
- [ ] Cross axis alignment
- [ ] Flex grow/shrink/basis
- [ ] Wrap behavior
- [ ] Gap between items
- [ ] **Tests:** Various layouts

---

### 25.1.5 `src/ui/styling/Theme.ts`

**Role:** UI theming system.

**Public API:**
```typescript
interface Theme {
  name: string;

  // Colors
  colors: {
    primary: Color;
    secondary: Color;
    background: Color;
    surface: Color;
    error: Color;
    text: Color;
    textSecondary: Color;
    border: Color;
  };

  // Typography
  fonts: {
    heading: FontStyle;
    body: FontStyle;
    button: FontStyle;
    caption: FontStyle;
  };

  // Spacing
  spacing: {
    xs: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
  };

  // Border radius
  borderRadius: {
    none: number;
    sm: number;
    md: number;
    lg: number;
    full: number;
  };

  // Shadows
  shadows: {
    none: Shadow;
    sm: Shadow;
    md: Shadow;
    lg: Shadow;
  };
}

const Themes = {
  LIGHT: Theme;
  DARK: Theme;
};
```

**Implementation Checklist:**
- [ ] Color palette
- [ ] Typography scale
- [ ] Spacing system
- [ ] Border radius presets
- [ ] Shadow definitions
- [ ] Light and dark themes

---

---

## 26. Audio System

---

## 26.1 `src/audio/` – Audio System

### Directory Structure (Key Files)

```
src/audio/
├── AudioSystem.ts
├── AudioContext.ts
├── AudioSource.ts
├── AudioListener.ts
├── AudioClip.ts
├── AudioMixer.ts
├── AudioBus.ts
├── effects/
│   ├── Reverb.ts
│   ├── Delay.ts
│   ├── Filter.ts
│   ├── Compressor.ts
│   └── Spatializer.ts
├── music/
│   ├── MusicPlayer.ts
│   ├── MusicTrack.ts
│   └── CrossfadeManager.ts
├── analysis/
│   ├── AudioAnalyzer.ts
│   ├── BeatDetector.ts
│   └── SpectrumAnalyzer.ts
└── index.ts
```

---

### 26.1.1 `src/audio/AudioSystem.ts`

**Role:** Central audio management.

**Public API:**
```typescript
class AudioSystem {
  // Lifecycle
  initialize(): Promise<void>;
  resume(): void;
  suspend(): void;
  dispose(): void;

  // Sources
  createSource(): AudioSource;
  destroySource(source: AudioSource): void;

  // Listener
  get listener(): AudioListener;

  // Mixer
  get masterBus(): AudioBus;
  createBus(name: string): AudioBus;
  getBus(name: string): AudioBus | undefined;

  // Music
  readonly music: MusicPlayer;

  // Global
  masterVolume: number;
  muted: boolean;

  // Update
  update(dt: number): void;
}
```

**Dependencies:**
- Depends on: Web Audio API, all audio components
- Depended by: `Engine`, `AudioSourceComponent`

**Implementation Checklist:**
- [ ] Web Audio API wrapper
- [ ] Source pooling
- [ ] Listener for 3D audio
- [ ] Bus/mixer routing
- [ ] Music playback
- [ ] Auto-suspend on tab hidden
- [ ] **Performance:** 100 simultaneous sources
- [ ] **Tests:** Playback, 3D audio

---

### 26.1.2 `src/audio/AudioSource.ts`

**Role:** Individual audio playback source.

**Public API:**
```typescript
class AudioSource {
  // Playback
  play(clip: AudioClip, options?: PlayOptions): void;
  pause(): void;
  resume(): void;
  stop(): void;

  // State
  get isPlaying(): boolean;
  get isPaused(): boolean;
  get currentTime(): number;
  set currentTime(time: number);

  // Properties
  volume: number;
  pitch: number;
  loop: boolean;
  muted: boolean;

  // 3D audio
  spatial: boolean;
  position: Vector3;
  minDistance: number;
  maxDistance: number;
  rolloffFactor: number;
  dopplerLevel: number;

  // Routing
  outputBus: AudioBus;

  // Events
  onEnd: Signal<() => void>;
}

interface PlayOptions {
  delay?: number;
  offset?: number;
  duration?: number;
  fadeIn?: number;
}
```

**Implementation Checklist:**
- [ ] Clip playback control
- [ ] Volume and pitch
- [ ] Looping
- [ ] 3D spatialization
- [ ] Distance attenuation
- [ ] Doppler effect
- [ ] Bus routing
- [ ] **Tests:** Playback modes

---

### 26.1.3 `src/audio/AudioMixer.ts`

**Role:** Audio bus mixing and routing.

**Public API:**
```typescript
class AudioMixer {
  // Buses
  createBus(name: string, parent?: AudioBus): AudioBus;
  getBus(name: string): AudioBus | undefined;
  get masterBus(): AudioBus;

  // Snapshots
  saveSnapshot(name: string): void;
  loadSnapshot(name: string, transitionTime?: number): void;
}

class AudioBus {
  readonly name: string;

  // Volume
  volume: number;
  muted: boolean;
  solo: boolean;

  // Effects
  addEffect(effect: AudioEffect): void;
  removeEffect(effect: AudioEffect): void;
  get effects(): AudioEffect[];

  // Routing
  parent: AudioBus | null;
  children: AudioBus[];
}
```

**Implementation Checklist:**
- [ ] Hierarchical bus structure
- [ ] Volume and mute per bus
- [ ] Solo for debugging
- [ ] Effect insert chain
- [ ] Snapshot system
- [ ] **Tests:** Mixing, effects

---

### 26.1.4 `src/audio/analysis/BeatDetector.ts`

**Role:** Real-time beat detection.

**Public API:**
```typescript
class BeatDetector {
  // Configuration
  sensitivity: number;
  frequencyRange: [number, number];

  // Analysis
  analyze(source: AudioSource): void;
  stop(): void;

  // State
  get bpm(): number;
  get beatIntensity(): number;
  get isOnBeat(): boolean;

  // Events
  onBeat: Signal<(intensity: number) => void>;
}
```

**Implementation Checklist:**
- [ ] Energy-based beat detection
- [ ] BPM estimation
- [ ] Frequency band filtering
- [ ] Beat callback events

---

---

## 27. Asset System

---

## 27.1 `src/assets/` – Asset Pipeline

### Directory Structure (Key Files)

```
src/assets/
├── AssetManager.ts
├── AssetLoader.ts
├── AssetBundle.ts
├── AssetDatabase.ts
├── loaders/
│   ├── TextureLoader.ts
│   ├── MeshLoader.ts
│   ├── AudioLoader.ts
│   ├── ShaderLoader.ts
│   ├── AnimationLoader.ts
│   ├── MaterialLoader.ts
│   ├── SceneLoader.ts
│   ├── GLTFLoader.ts
│   ├── FBXLoader.ts
│   └── OBJLoader.ts
├── processing/
│   ├── TextureCompressor.ts
│   ├── MeshOptimizer.ts
│   └── AssetImporter.ts
├── caching/
│   ├── AssetCache.ts
│   ├── MemoryCache.ts
│   └── IndexedDBCache.ts
└── index.ts
```

---

### 27.1.1 `src/assets/AssetManager.ts`

**Role:** Central asset loading and management.

**Public API:**
```typescript
class AssetManager {
  // Loading
  load<T extends Asset>(path: string, type?: AssetType): Promise<T>;
  loadAll<T extends Asset>(paths: string[], type?: AssetType): Promise<T[]>;
  loadBundle(bundlePath: string): Promise<AssetBundle>;

  // Access
  get<T extends Asset>(path: string): T | undefined;
  has(path: string): boolean;

  // Unloading
  unload(path: string): void;
  unloadBundle(bundle: AssetBundle): void;
  unloadUnused(): void;

  // Progress
  get loadingProgress(): number;
  get loadingCount(): number;
  onProgress: Signal<(loaded: number, total: number) => void>;

  // Caching
  setCachePolicy(policy: CachePolicy): void;
  clearCache(): Promise<void>;
}

type AssetType = 'texture' | 'mesh' | 'audio' | 'shader' | 'material' | 'animation' | 'scene' | 'prefab';
```

**Dependencies:**
- Depends on: All loaders, `AssetCache`, `AssetDatabase`
- Depended by: All systems needing assets

**Implementation Checklist:**
- [ ] Type-specific loading
- [ ] Bundle loading
- [ ] Reference counting
- [ ] Automatic unloading
- [ ] Progress tracking
- [ ] Caching (memory + IndexedDB)
- [ ] **Performance:** Parallel loading
- [ ] **Tests:** Loading, caching, unloading

---

### 27.1.2 `src/assets/loaders/GLTFLoader.ts`

**Role:** glTF/GLB model loading.

**Public API:**
```typescript
class GLTFLoader {
  // Loading
  static load(url: string, options?: GLTFOptions): Promise<GLTFAsset>;
  static loadFromBuffer(buffer: ArrayBuffer, options?: GLTFOptions): Promise<GLTFAsset>;

  // Options
  interface GLTFOptions {
    loadTextures: boolean;
    loadAnimations: boolean;
    loadMaterials: boolean;
    generateMipmaps: boolean;
    flipY: boolean;
  }
}

interface GLTFAsset {
  scenes: Scene[];
  meshes: Mesh[];
  materials: Material[];
  textures: Texture[];
  animations: AnimationClip[];
  skeleton?: Skeleton;
}
```

**Implementation Checklist:**
- [ ] glTF 2.0 specification compliance
- [ ] GLB binary format
- [ ] PBR materials
- [ ] Skeletal animation
- [ ] Morph targets
- [ ] Draco compression
- [ ] KTX2/Basis textures
- [ ] Extensions (KHR_*)
- [ ] **Tests:** Various glTF files

---

### 27.1.3 `src/assets/caching/AssetCache.ts`

**Role:** Multi-tier asset caching.

**Public API:**
```typescript
class AssetCache {
  // Memory cache
  readonly memory: MemoryCache;

  // Persistent cache
  readonly persistent: IndexedDBCache;

  // Operations
  get<T>(key: string): T | undefined;
  set<T>(key: string, value: T, options?: CacheOptions): void;
  delete(key: string): void;
  clear(): void;

  // Statistics
  get memoryUsage(): number;
  get persistentUsage(): number;
}

interface CacheOptions {
  ttl?: number;           // Time-to-live in ms
  priority?: 'low' | 'normal' | 'high';
  persistent?: boolean;   // Also store in IndexedDB
}
```

**Implementation Checklist:**
- [ ] Memory cache with LRU eviction
- [ ] IndexedDB for persistent cache
- [ ] TTL expiration
- [ ] Priority-based eviction
- [ ] Memory budget enforcement
- [ ] **Tests:** Cache behavior

---

---

## 28. Serialization

---

## 28.1 `src/serialization/` – Save/Load System

### Directory Structure (Key Files)

```
src/serialization/
├── Serializer.ts
├── Deserializer.ts
├── BinarySerializer.ts
├── JSONSerializer.ts
├── SaveManager.ts
├── SaveSlot.ts
├── Schema.ts
├── Migration.ts
├── Compression.ts
└── index.ts
```

---

### 28.1.1 `src/serialization/SaveManager.ts`

**Role:** Game save/load management.

**Public API:**
```typescript
class SaveManager {
  // Save slots
  getSaveSlots(): Promise<SaveSlot[]>;
  createSaveSlot(name: string): Promise<SaveSlot>;
  deleteSaveSlot(slot: SaveSlot): Promise<void>;

  // Save/Load
  save(slot: SaveSlot, data: SaveData): Promise<void>;
  load(slot: SaveSlot): Promise<SaveData>;
  quickSave(): Promise<void>;
  quickLoad(): Promise<void>;

  // Auto-save
  enableAutoSave(intervalMs: number): void;
  disableAutoSave(): void;

  // Cloud sync
  syncToCloud(slot: SaveSlot): Promise<void>;
  syncFromCloud(slot: SaveSlot): Promise<void>;

  // Events
  onSaveStart: Signal<(slot: SaveSlot) => void>;
  onSaveComplete: Signal<(slot: SaveSlot) => void>;
  onLoadComplete: Signal<(slot: SaveSlot) => void>;
}

interface SaveSlot {
  id: string;
  name: string;
  timestamp: Date;
  playtime: number;
  thumbnail?: string;
  metadata: Record<string, any>;
}
```

**Dependencies:**
- Depends on: `Serializer`, `Compression`, storage APIs
- Depended by: Game systems

**Implementation Checklist:**
- [ ] Multiple save slots
- [ ] Quick save/load
- [ ] Auto-save with interval
- [ ] Cloud sync integration
- [ ] Save thumbnail capture
- [ ] Metadata storage
- [ ] **Tests:** Save/load cycles

---

### 28.1.2 `src/serialization/BinarySerializer.ts`

**Role:** Efficient binary serialization.

**Public API:**
```typescript
class BinarySerializer {
  // Serialization
  serialize(data: any, schema?: Schema): ArrayBuffer;
  deserialize<T>(buffer: ArrayBuffer, schema?: Schema): T;

  // Streaming
  createWriter(): BinaryWriter;
  createReader(buffer: ArrayBuffer): BinaryReader;
}

class BinaryWriter {
  writeInt8(value: number): void;
  writeInt16(value: number): void;
  writeInt32(value: number): void;
  writeFloat32(value: number): void;
  writeFloat64(value: number): void;
  writeString(value: string): void;
  writeBytes(value: Uint8Array): void;
  writeVector3(value: Vector3): void;
  writeQuaternion(value: Quaternion): void;

  toArrayBuffer(): ArrayBuffer;
}
```

**Implementation Checklist:**
- [ ] Primitive type encoding
- [ ] String encoding (UTF-8)
- [ ] Array/object encoding
- [ ] Math type shortcuts
- [ ] Schema-based optimization
- [ ] Endianness handling
- [ ] **Tests:** Round-trip accuracy

---

---

## Next Document

Continue to `PRD-Final-10-Tooling.md` for Tooling specifications.
