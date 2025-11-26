# G3D Voxel World Example

A complete Minecraft-style voxel world example demonstrating the G3D 5.0 game engine's voxel system, procedural generation, and chunk streaming capabilities.

## Features

### World Generation
- **Procedural Terrain**: Multi-octave Perlin noise for realistic heightmaps
- **Biomes**: 6 distinct biomes (Plains, Desert, Forest, Mountains, Ocean, Tundra)
- **Cave Systems**: 3D cave generation with multiple layers
- **Ore Distribution**: Coal, Iron, Gold, and Diamond ores at appropriate depths
- **Tree Generation**: Procedural trees in forest and plains biomes
- **Water & Lava**: Fluid blocks with proper rendering

### Chunk Management
- **Infinite World**: Streaming chunk loading based on player position
- **View Distance**: Configurable render distance (default 8 chunks)
- **LOD System**: Level-of-detail for distant chunks
- **Memory Management**: Automatic chunk unloading to stay within memory limits
- **Mesh Optimization**: Greedy meshing for efficient rendering

### Block System
- **20 Block Types**: Diverse materials from dirt to diamond ore
- **Physical Properties**: Hardness, transparency, light emission
- **Material System**: PBR properties (roughness, metallic)
- **Block Registry**: Extensible system for custom blocks

### Player System
- **Creative Mode**: Fly, unlimited blocks, instant breaking
- **Survival Mode**: Physics, gravity, swimming, inventory management
- **Minecraft-style Controls**: WASD movement, space to jump, shift to sneak
- **Collision Detection**: Accurate AABB collision with blocks
- **Block Interaction**: Raycasting for block selection and placement

### Inventory System
- **Hotbar**: 9 quick-access slots with visual display
- **Full Inventory**: 27 additional storage slots
- **Item Stacking**: Up to 64 items per stack
- **Creative Inventory**: Unlimited blocks in creative mode

### HUD & UI
- **Crosshair**: Center screen targeting reticle
- **Hotbar Display**: Visual representation of inventory slots
- **Block Preview**: See selected block with count
- **Debug Info**: FPS, position, chunk coordinates, memory usage
- **Break Progress**: Visual feedback for block breaking
- **Messages**: Toast notifications for game events

### Performance
- **Target**: 60 FPS with 8+ chunk render distance
- **Optimizations**:
  - Chunk batching and meshing
  - Frustum culling
  - Greedy meshing algorithm
  - Memory pooling
- **Statistics**: Real-time performance monitoring

## Getting Started

### Installation

```bash
# Navigate to example directory
cd examples/voxel-world

# Install dependencies
pnpm install

# Run development server
pnpm run dev
```

### Building

```bash
# Build for production
pnpm run build

# Preview production build
pnpm run preview
```

## Controls

### Movement
- **W/A/S/D**: Move forward/left/backward/right
- **Space**: Jump (or fly up in creative mode)
- **Shift**: Sneak (or fly down in creative mode)
- **Double Space**: Toggle fly mode (creative only)
- **Left Ctrl**: Sprint

### Camera
- **Mouse**: Look around (click canvas to lock pointer)
- **ESC**: Release pointer lock

### Blocks
- **Left Click**: Break block (hold to mine)
- **Right Click**: Place block
- **1-9**: Select hotbar slot
- **Mouse Wheel**: Scroll through hotbar

### UI
- **F3**: Toggle debug information
- **E**: Open inventory (future feature)

## Block Types

### Natural Blocks
- **Grass**: Green surface block, drops dirt
- **Dirt**: Brown earth, basic building material
- **Stone**: Gray rock, drops cobblestone when mined
- **Sand**: Yellow granular block, found in deserts
- **Water**: Blue transparent fluid
- **Ice**: Frozen water in tundra biomes
- **Snow**: White powder in cold biomes

### Ores
- **Coal Ore**: Common, found at any depth
- **Iron Ore**: Uncommon, found below y=64
- **Gold Ore**: Rare, found below y=32
- **Diamond Ore**: Very rare, found below y=16

### Wood
- **Wood (Logs)**: Tree trunks, crafting material
- **Planks**: Processed wood
- **Leaves**: Tree foliage, transparent

### Crafted Blocks
- **Cobblestone**: Mined stone
- **Glass**: Transparent building material
- **Brick**: Decorative building block

### Special Blocks
- **Bedrock**: Indestructible bottom layer at y=0
- **Lava**: Glowing molten rock, emits light

## Architecture

### File Structure

```
voxel-world/
├── src/
│   ├── main.ts              # Entry point and game loop
│   ├── BlockTypes.ts        # Block definitions and registry
│   ├── TerrainGenerator.ts  # Procedural terrain generation
│   ├── ChunkManager.ts      # Chunk loading and streaming
│   ├── VoxelPlayer.ts       # Player controller and physics
│   ├── Inventory.ts         # Inventory management
│   └── VoxelHUD.ts          # UI and HUD rendering
├── index.html               # HTML entry point
├── package.json             # Dependencies
└── README.md                # This file
```

### System Flow

1. **Initialization**
   - Create VoxelWorld with chunk size
   - Initialize TerrainGenerator with seed
   - Create ChunkManager with view distance
   - Spawn player at world origin

2. **Game Loop**
   - Update player physics and input
   - Update chunk manager (load/unload chunks)
   - Process terrain generation queue
   - Build chunk meshes
   - Render world
   - Update HUD

3. **Chunk Lifecycle**
   - Create chunk at position
   - Generate terrain using noise
   - Calculate lighting
   - Build optimized mesh
   - Render to screen
   - Unload when out of range

### Key Algorithms

#### Terrain Generation
- Multi-octave Perlin noise for height maps
- Biome selection based on temperature/moisture
- 3D cave noise for underground systems
- Ore placement using noise thresholds

#### Meshing
- Greedy meshing algorithm for face reduction
- Neighbor-aware face culling
- Transparent block sorting
- Vertex color for lighting

#### Physics
- AABB collision detection
- Separating axis theorem
- Gravity and friction
- Swimming mechanics

## Customization

### Changing World Seed

```typescript
// In main.ts
const generator = new TerrainGenerator(12345); // Your custom seed
```

### Adding Custom Blocks

```typescript
// In BlockTypes.ts
BlockRegistry.register({
  name: 'My Block',
  type: BlockType.Custom,
  material: {
    type: VoxelType.Custom,
    color: [1, 0, 0, 1], // Red
    emissive: 0,
    roughness: 0.8,
    metallic: 0,
    transparent: false,
    solid: true
  },
  hardness: 2.0,
  toolRequired: 'pickaxe',
  dropsItem: BlockType.Custom,
  sound: 'stone',
  animated: false,
  lightLevel: 0
});
```

### Adjusting View Distance

```typescript
// In main.ts
chunkManager.setViewDistance(12); // Render distance in chunks
```

### Changing Player Speed

```typescript
// In VoxelPlayer.ts
private moveSpeed: number = 6.0; // Faster movement
private flySpeed: number = 15.0; // Faster flying
```

## Performance Tips

1. **Lower View Distance**: Reduces chunks to render
2. **Disable Debug Info**: F3 overlay has performance cost
3. **Creative Mode**: Instant block breaking, no physics
4. **Memory Limit**: Adjust in ChunkManager for your system

## Future Enhancements

- [ ] WebGL/WebGPU rendering
- [ ] Multiplayer support
- [ ] Crafting system
- [ ] More biomes and structures
- [ ] Sound effects and music
- [ ] Day/night lighting
- [ ] Shadows and ambient occlusion
- [ ] Particle effects
- [ ] Entity system (mobs, items)
- [ ] Save/load world data

## Technical Details

### Memory Usage
- Each chunk: ~12-128 KB (depending on complexity)
- 100 chunks: ~1.2-12.8 MB
- 500 chunks: ~6-64 MB

### Performance Targets
- Chunk generation: <5ms per chunk
- Mesh building: <10ms per chunk
- Frame time: <16.67ms (60 FPS)

### Coordinate Systems
- World coordinates: Absolute position in voxel space
- Chunk coordinates: Chunk grid position
- Local coordinates: Position within chunk (0-15)

## Credits

Built with G3D 5.0 Game Engine

## License

MIT License - See main G3D repository for details
