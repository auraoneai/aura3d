# Phase E: Infrastructure - Execution Prompt

## Overview

**Phase:** Phase E - Infrastructure  
**Status:** Ready to Execute  
**Previous Phase:** Phase D (AI & World Systems) - ✅ COMPLETE  
**PRD Document:** `PRD-Final-09-Infrastructure.md`

**Total Files:** ~100 TypeScript files  
**Estimated Effort:** 4-6 weeks  
**Dependencies:** Phase A (Core), Phase B (Rendering), Phase C (Physics), Phase D (AI & World)

---

## Phase E Scope

### Part 1: Networking System (`src/net/`)

**Current Status:** Some files exist (10 files), needs expansion

#### 1.1 Core Networking (~15 files)
- [ ] `NetManager.ts` - Central networking coordination (may need expansion)
- [ ] `Connection.ts` - Connection management
- [ ] `Transport.ts` - Transport abstraction interface
- [ ] `WebSocketTransport.ts` - WebSocket transport (exists, verify completeness)
- [ ] `WebRTCTransport.ts` - WebRTC transport (exists, verify completeness)
- [ ] `Serialization.ts` - Network serialization
- [ ] `BitStream.ts` - Bit-level streaming for compression

#### 1.2 Replication (`src/net/replication/`)
**Files Required:** 5 files
- [ ] `ReplicationManager.ts` - Entity state replication
- [ ] `NetworkedComponent.ts` - Networked component marker
- [ ] `StateSnapshot.ts` - State snapshot system
- [ ] `DeltaCompression.ts` - Delta compression for snapshots
- [ ] `InterestManagement.ts` - Interest management (AOI)

**Key Features:**
- Entity network ID assignment
- Authority management
- Snapshot creation and application
- Component replication rules
- Variable send rates
- **Performance Target:** 1000 entities replicated @ 60 FPS

#### 1.3 Prediction (`src/net/prediction/`)
**Files Required:** 3 files
- [ ] `ClientPrediction.ts` - Client-side prediction
- [ ] `ServerReconciliation.ts` - Server reconciliation
- [ ] `InputBuffer.ts` - Input buffering

**Key Features:**
- Input recording with timestamps
- Local prediction application
- Server state reconciliation
- Rollback and replay
- Smooth error correction

#### 1.4 Matchmaking (`src/net/matchmaking/`)
**Files Required:** 3 files
- [ ] `MatchmakingClient.ts` - Matchmaking client
- [ ] `LobbyManager.ts` - Lobby management
- [ ] `RoomManager.ts` - Room management

**Key Features:**
- Matchmaking with criteria
- Lobby creation and joining
- Room management
- Player queuing

#### 1.5 Voice Chat (`src/net/voice/`)
**Files Required:** 3 files
- [ ] `VoiceChat.ts` - Voice communication system
- [ ] `AudioEncoder.ts` - Audio encoding (Opus)
- [ ] `SpatialVoice.ts` - Spatial voice audio

**Key Features:**
- WebRTC audio streams
- Push-to-talk and voice activation
- Opus codec encoding
- Spatial audio integration
- Noise suppression
- **Performance Target:** 16 players with voice @ 60 FPS

#### 1.6 Security (`src/net/security/`)
**Files Required:** 3 files
- [ ] `PacketEncryption.ts` - Packet encryption
- [ ] `AntiCheat.ts` - Anti-cheat measures
- [ ] `RateLimiter.ts` - Rate limiting

**Key Features:**
- Packet encryption
- Anti-cheat validation
- Rate limiting per client

**Existing Files to Review/Expand:**
- `NetworkManager.ts` - Verify matches PRD spec
- `NetworkSystem.ts` - ECS integration
- `NetworkMessage.ts` - Message system
- `NetworkTime.ts` - Network time synchronization
- `RPCSystem.ts` - Remote procedure calls
- `StateSync.ts` - State synchronization
- `NetworkEntity.ts` - Networked entity wrapper

---

### Part 2: Input System (`src/input/`)

**Current Status:** Some files exist (11 files), needs expansion

#### 2.1 Core Input (~8 files)
- [ ] `InputSystem.ts` - Central input processing (exists, verify completeness)
- [ ] `InputManager.ts` - Device abstraction (exists, verify completeness)
- [ ] `InputAction.ts` - Abstract input action (exists, verify completeness)
- [ ] `InputBinding.ts` - Input binding (exists, verify completeness)
- [ ] `InputContext.ts` - Input context switching (exists, verify completeness)
- [ ] `VirtualInput.ts` - Virtual input abstraction (exists, verify completeness)

#### 2.2 Device Implementations (`src/input/keyboard/`, `src/input/mouse/`, `src/input/gamepad/`, `src/input/touch/`, `src/input/pointer/`)
**Files Required:** ~15 files

**Keyboard:**
- [ ] `keyboard/KeyboardDevice.ts` - Keyboard device wrapper
- [ ] `keyboard/KeyCodes.ts` - Key code definitions

**Mouse:**
- [ ] `mouse/MouseDevice.ts` - Mouse device wrapper
- [ ] `mouse/MouseButton.ts` - Mouse button definitions

**Gamepad:**
- [ ] `gamepad/GamepadDevice.ts` - Gamepad device wrapper (exists as Gamepad.ts, verify)
- [ ] `gamepad/GamepadMapping.ts` - Controller mapping
- [ ] `gamepad/RumbleManager.ts` - Haptic feedback

**Touch:**
- [ ] `touch/TouchDevice.ts` - Touch device wrapper (exists as Touch.ts, verify)
- [ ] `touch/GestureRecognizer.ts` - Multi-touch gesture detection
- [ ] `touch/TouchJoystick.ts` - Virtual joystick

**Pointer:**
- [ ] `pointer/PointerLock.ts` - Pointer lock API
- [ ] `pointer/CursorManager.ts` - Cursor management

**Key Features:**
- Multi-device support
- Action-based input abstraction
- Frame-based press/release detection
- Dead zone handling for analog
- Input buffering
- Gesture recognition (tap, pan, pinch, rotate, swipe)
- **Performance Target:** All input types @ 60 FPS

**Existing Files to Review/Expand:**
- `Keyboard.ts` - Verify completeness
- `Mouse.ts` - Verify completeness
- `Gamepad.ts` - Verify completeness
- `Touch.ts` - Verify completeness

---

### Part 3: UI System (`src/ui/`)

**Current Status:** Some files exist (12 files), needs expansion

#### 3.1 Core UI (~5 files)
- [ ] `UISystem.ts` - Central UI management (exists, verify completeness)
- [ ] `UICanvas.ts` - UI canvas (exists, verify completeness)
- [ ] `UIElement.ts` - Base element class (exists, verify completeness)
- [ ] `UIRenderer.ts` - UI rendering (exists, verify completeness)
- [ ] `UILayout.ts` - Layout system (exists, verify completeness)

#### 3.2 UI Components (`src/ui/components/`)
**Files Required:** ~12 files
- [ ] `components/Button.ts` - Button component (exists as UIButton.ts, verify)
- [ ] `components/Text.ts` - Text component (exists as UIText.ts, verify)
- [ ] `components/Image.ts` - Image component (exists as UIImage.ts, verify)
- [ ] `components/Panel.ts` - Panel container
- [ ] `components/ScrollView.ts` - Scroll view (exists as UIScrollView.ts, verify)
- [ ] `components/Slider.ts` - Slider (exists as UISlider.ts, verify)
- [ ] `components/Toggle.ts` - Toggle switch
- [ ] `components/InputField.ts` - Input field (exists as UIInputField.ts, verify)
- [ ] `components/Dropdown.ts` - Dropdown menu
- [ ] `components/ProgressBar.ts` - Progress bar
- [ ] `components/ListView.ts` - List view
- [ ] `components/Modal.ts` - Modal dialog

**Key Features:**
- Extends UIElement
- Proper measure/layout
- Theming support
- Accessibility attributes
- Keyboard navigation
- Touch-friendly hit areas
- Animation states

#### 3.3 Layout Systems (`src/ui/layout/`)
**Files Required:** 4 files
- [ ] `layout/FlexLayout.ts` - Flexbox layout
- [ ] `layout/GridLayout.ts` - Grid layout
- [ ] `layout/StackLayout.ts` - Stack layout
- [ ] `layout/AnchorLayout.ts` - Anchor-based layout

**Key Features:**
- Flexbox with all properties
- Grid layout with rows/columns
- Stack layout (vertical/horizontal)
- Anchor-based positioning

#### 3.4 Styling (`src/ui/styling/`)
**Files Required:** 3 files
- [ ] `styling/StyleSheet.ts` - Style sheet system
- [ ] `styling/Theme.ts` - Theming system
- [ ] `styling/Transitions.ts` - UI transitions

**Key Features:**
- CSS-like style sheets
- Light and dark themes
- Color palette
- Typography scale
- Spacing system
- Border radius presets
- Shadow definitions
- Smooth transitions

**Performance Target:** 10k elements @ 60 FPS

**Existing Files to Review/Expand:**
- All existing UI files need verification against PRD spec

---

### Part 4: Audio System (`src/audio/`)

**Current Status:** Some files exist (11 files), needs expansion

#### 4.1 Core Audio (~7 files)
- [ ] `AudioSystem.ts` - Central audio management (exists, verify completeness)
- [ ] `AudioContext.ts` - Web Audio context wrapper (exists, verify completeness)
- [ ] `AudioSource.ts` - Audio playback source (exists, verify completeness)
- [ ] `AudioListener.ts` - 3D audio listener (exists, verify completeness)
- [ ] `AudioClip.ts` - Audio clip asset (exists, verify completeness)
- [ ] `AudioMixer.ts` - Audio mixing (exists, verify completeness)
- [ ] `AudioPool.ts` - Audio source pooling (exists, verify completeness)

#### 4.2 Audio Effects (`src/audio/effects/`)
**Files Required:** 5 files
- [ ] `effects/Reverb.ts` - Reverb effect
- [ ] `effects/Delay.ts` - Delay effect
- [ ] `effects/Filter.ts` - Filter effect (low-pass, high-pass, band-pass)
- [ ] `effects/Compressor.ts` - Compressor effect
- [ ] `effects/Spatializer.ts` - 3D spatialization

**Key Features:**
- Reverb with room simulation
- Delay with feedback
- Frequency filtering
- Dynamic range compression
- 3D spatial audio

#### 4.3 Music System (`src/audio/music/`)
**Files Required:** 3 files
- [ ] `music/MusicPlayer.ts` - Music playback
- [ ] `music/MusicTrack.ts` - Music track definition
- [ ] `music/CrossfadeManager.ts` - Crossfade between tracks

**Key Features:**
- Music playback
- Adaptive music
- Crossfading
- Looping

#### 4.4 Audio Analysis (`src/audio/analysis/`)
**Files Required:** 3 files
- [ ] `analysis/AudioAnalyzer.ts` - Audio analysis
- [ ] `analysis/BeatDetector.ts` - Beat detection (exists as AudioEffect.ts, verify)
- [ ] `analysis/SpectrumAnalyzer.ts` - Spectrum analysis

**Key Features:**
- Real-time audio analysis
- Beat detection (BPM estimation)
- Frequency spectrum analysis
- Energy-based detection

**Additional Files:**
- [ ] `SpatialAudio.ts` - Spatial audio system (exists, verify completeness)
- [ ] `AudioBus.ts` - Audio bus routing
- [ ] `ReverbZone.ts` - Environmental reverb zones
- [ ] `AudioOcclusion.ts` - Sound obstruction

**Performance Target:** 64 simultaneous spatial sounds @ 60 FPS

**Existing Files to Review/Expand:**
- All existing audio files need verification against PRD spec

---

### Part 5: Asset System (`src/assets/`)

**Current Status:** Some files exist (14 files), needs expansion

#### 5.1 Core Assets (~6 files)
- [ ] `AssetManager.ts` - Central asset management (exists, verify completeness)
- [ ] `AssetLoader.ts` - Generic asset loader (exists, verify completeness)
- [ ] `AssetBundle.ts` - Asset bundles (exists, verify completeness)
- [ ] `AssetCache.ts` - Asset caching (exists, verify completeness)
- [ ] `Asset.ts` - Base asset class (exists, verify completeness)
- [ ] `AssetReference.ts` - Asset reference system (exists, verify completeness)

#### 5.2 Asset Loaders (`src/assets/loaders/`)
**Files Required:** ~10 files
- [ ] `loaders/TextureLoader.ts` - Texture loading (exists as ImageLoader.ts, verify)
- [ ] `loaders/MeshLoader.ts` - Mesh loading
- [ ] `loaders/AudioLoader.ts` - Audio loading (exists, verify completeness)
- [ ] `loaders/ShaderLoader.ts` - Shader loading
- [ ] `loaders/AnimationLoader.ts` - Animation loading
- [ ] `loaders/MaterialLoader.ts` - Material loading
- [ ] `loaders/SceneLoader.ts` - Scene loading
- [ ] `loaders/GLTFLoader.ts` - glTF/GLB loading (exists, verify completeness)
- [ ] `loaders/FBXLoader.ts` - FBX loading
- [ ] `loaders/OBJLoader.ts` - OBJ loading (exists, verify completeness)

**Key Features:**
- Type-specific loaders
- Progress tracking
- Error handling
- Format support (glTF 2.0, FBX, OBJ)
- Draco compression
- KTX2/Basis textures
- **Performance Target:** Parallel loading

#### 5.3 Asset Processing (`src/assets/processing/`)
**Files Required:** 3 files
- [ ] `processing/TextureCompressor.ts` - Texture compression
- [ ] `processing/MeshOptimizer.ts` - Mesh optimization
- [ ] `processing/AssetImporter.ts` - Asset import pipeline

**Key Features:**
- Texture compression (BC, ASTC, ETC)
- Mesh optimization
- Import pipeline

#### 5.4 Asset Caching (`src/assets/caching/`)
**Files Required:** 3 files
- [ ] `caching/MemoryCache.ts` - Memory cache with LRU
- [ ] `caching/IndexedDBCache.ts` - Persistent IndexedDB cache
- [ ] `caching/AssetCache.ts` - Multi-tier cache (exists, verify)

**Key Features:**
- LRU eviction
- IndexedDB persistence
- TTL expiration
- Priority-based eviction
- Memory budget enforcement

#### 5.5 Asset Database (`src/assets/`)
**Files Required:** 1 file
- [ ] `AssetDatabase.ts` - Asset database for editor

**Key Features:**
- Asset metadata
- Dependency tracking
- Editor integration

**Existing Files to Review/Expand:**
- All existing asset files need verification against PRD spec

---

### Part 6: Serialization System (`src/serialization/`)

**Current Status:** Does not exist, needs creation

#### 6.1 Core Serialization (~8 files)
**Files Required:** 8 files
- [ ] `Serializer.ts` - Base serializer interface
- [ ] `Deserializer.ts` - Base deserializer interface
- [ ] `BinarySerializer.ts` - Binary serialization
- [ ] `JSONSerializer.ts` - JSON serialization
- [ ] `SaveManager.ts` - Save/load management
- [ ] `SaveSlot.ts` - Save slot system
- [ ] `Schema.ts` - Serialization schema
- [ ] `Migration.ts` - Save data migration

**Key Features:**
- Binary and JSON formats
- Multiple save slots
- Quick save/load
- Auto-save with interval
- Cloud sync integration
- Save thumbnail capture
- Metadata storage
- Schema-based optimization
- Version migration

**Additional Files:**
- [ ] `Compression.ts` - Data compression (gzip, lz4)

---

## Implementation Guidelines

### Code Quality Requirements

**EVERY FILE MUST:**
- ✅ Be 100% production-ready code
- ✅ Have complete implementations (no TODOs, stubs, placeholders)
- ✅ Be properly typed with TypeScript (minimal `any` types)
- ✅ Include JSDoc comments for public APIs
- ✅ Follow consistent naming conventions
- ✅ Include error handling
- ✅ Be optimized for performance

**EVERY FILE MUST NOT CONTAIN:**
- ❌ `TODO` comments
- ❌ `FIXME` comments
- ❌ `// placeholder` or similar
- ❌ `throw new Error('Not implemented')`
- ❌ Empty function bodies
- ❌ Mock implementations
- ❌ Commented-out code blocks

### Performance Targets

**Networking:**
- 64 players supported
- 1000 entities replicated @ 60 FPS
- 16 players with voice @ 60 FPS

**Input:**
- All input types @ 60 FPS
- Low latency (< 16ms)

**UI:**
- 10k elements @ 60 FPS
- Smooth animations

**Audio:**
- 64 simultaneous spatial sounds @ 60 FPS
- Low latency audio (< 50ms)

**Assets:**
- Parallel loading
- Efficient caching
- Fast asset access

### Testing Requirements

**Unit Tests:**
- All core algorithms must have unit tests
- Test coverage target: > 85%
- Test file naming: `*.test.ts` or `*.spec.ts`

**Integration Tests:**
- Networking: 16-player game with prediction
- UI: Full UI system with all components
- Audio: Multiple simultaneous sounds
- Assets: Loading and caching

**Visual Tests:**
- UI rendering
- UI animations
- UI interactions

---

## Execution Order

### Phase E.1: Networking (Week 1-2)
1. Core networking (NetManager, Transport, Connection)
2. Replication system
3. Prediction system
4. Matchmaking
5. Voice chat
6. Security

### Phase E.2: Input System (Week 2-3)
1. Core input system
2. Device implementations (keyboard, mouse, gamepad, touch, pointer)
3. Gesture recognition
4. Input recording/replay

### Phase E.3: UI System (Week 3-4)
1. Core UI system
2. UI components
3. Layout systems
4. Styling and theming

### Phase E.4: Audio System (Week 4-5)
1. Core audio system
2. Audio effects
3. Music system
4. Audio analysis

### Phase E.5: Assets & Serialization (Week 5-6)
1. Asset system expansion
2. Asset loaders
3. Asset processing
4. Serialization system

---

## Dependencies

### External Dependencies
- **WebSocket API:** For WebSocket transport
- **WebRTC API:** For WebRTC transport and voice chat
- **Web Audio API:** For audio system
- **IndexedDB API:** For persistent asset caching
- **Opus Codec:** For voice encoding (WebAssembly)

### Internal Dependencies
- **Phase A:** Core math, ECS, Vector3, Matrix4, Quaternion
- **Phase B:** Rendering pipeline, materials, shaders
- **Phase C:** Physics system (for networked physics)
- **Phase D:** AI systems (for networked AI)

---

## File Structure

```
src/
├── net/
│   ├── Core Files (NetManager, Connection, Transport, etc.)
│   ├── replication/        (5 files)
│   ├── prediction/         (3 files)
│   ├── matchmaking/        (3 files)
│   ├── voice/              (3 files)
│   └── security/           (3 files)
├── input/
│   ├── Core Files (InputSystem, InputManager, etc.)
│   ├── keyboard/           (2 files)
│   ├── mouse/              (2 files)
│   ├── gamepad/            (3 files)
│   ├── touch/              (3 files)
│   └── pointer/            (2 files)
├── ui/
│   ├── Core Files (UISystem, UICanvas, UIElement, etc.)
│   ├── components/         (~12 files)
│   ├── layout/             (4 files)
│   └── styling/            (3 files)
├── audio/
│   ├── Core Files (AudioSystem, AudioSource, etc.)
│   ├── effects/            (5 files)
│   ├── music/              (3 files)
│   └── analysis/           (3 files)
├── assets/
│   ├── Core Files (AssetManager, AssetLoader, etc.)
│   ├── loaders/            (~10 files)
│   ├── processing/         (3 files)
│   └── caching/            (3 files)
└── serialization/          (8 files)
```

---

## Index File Updates

### `src/net/index.ts`
Export all networking modules:
- Core networking
- Replication
- Prediction
- Matchmaking
- Voice
- Security

### `src/input/index.ts`
Export all input modules:
- Core input
- All device types
- Gesture recognition

### `src/ui/index.ts`
Export all UI modules:
- Core UI
- All components
- Layout systems
- Styling

### `src/audio/index.ts`
Export all audio modules:
- Core audio
- Effects
- Music
- Analysis

### `src/assets/index.ts`
Export all asset modules:
- Core assets
- All loaders
- Processing
- Caching

### `src/serialization/index.ts`
Export all serialization modules:
- Serializers
- Save manager
- Compression

### `src/index.ts`
Add exports:
```typescript
export * from './net';
export * from './input';
export * from './ui';
export * from './audio';
export * from './assets';
export * from './serialization';
```

---

## Completion Criteria

**Phase E is complete when:**

1. ✅ All ~100 files implemented with no TODOs
2. ✅ Unit test coverage > 85%
3. ✅ All performance targets met:
   - Network: 16-player game with prediction
   - UI: 10k elements @ 60 FPS
   - Audio: 64 simultaneous spatial sounds
4. ✅ Integration test: Multiplayer game with full UI
5. ✅ All exports properly configured
6. ✅ Documentation complete
7. ✅ No TypeScript errors

---

## Notes

- **Existing Files:** Many infrastructure files already exist. Review and expand them to match PRD specifications.
- **Networking:** Focus on WebSocket and WebRTC transports. Consider WebAssembly for performance-critical parts.
- **Input:** Ensure all device types are supported with proper abstraction.
- **UI:** Build a complete UI framework with all common components.
- **Audio:** Integrate with Web Audio API for 3D spatial audio.
- **Assets:** Support common formats (glTF, OBJ, FBX) with efficient loading and caching.
- **Serialization:** Support both binary and JSON formats for save/load.

---

## Next Phase

After Phase E completion:
- **Phase F:** Tooling & Domain Packs (Editor, Visual Scripting, Profiling, Domain Packs) - ~200 files

---

**Ready to execute Phase E!**

