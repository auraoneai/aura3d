# G3D Asset System

Complete asset management system for the G3D 5.0 engine with production-ready implementations for loading, caching, and managing various asset types.

## Features

- **Multiple Format Support**: glTF, OBJ, PNG, JPEG, WebP, HDR, MP3, OGG, WAV
- **Async Loading**: Promise-based loading with progress tracking
- **Smart Caching**: LRU/LFU/FIFO eviction policies with memory budget management
- **Asset Bundles**: Manifest-based bundles with dependency resolution
- **Reference Counting**: Automatic memory management with strong/weak references
- **Background Loading**: Priority-based queue with concurrent loading
- **Error Handling**: Automatic retry with exponential backoff
- **Type Safety**: Full TypeScript support with generics

## Quick Start

```typescript
import { AssetManager, GLTFLoader, ImageLoader, AudioLoader, LoadPriority } from './assets';

// Create asset manager
const manager = new AssetManager({
  cache: {
    maxMemory: 512 * 1024 * 1024, // 512MB
    evictionPolicy: EvictionPolicy.LRU
  },
  enableBackgroundLoading: true
});

// Register loaders
manager.registerLoader(new GLTFLoader());
manager.registerLoader(new ImageLoader());
manager.registerLoader(new AudioLoader());

// Load assets
const model = await manager.load('model.gltf', {
  priority: LoadPriority.HIGH,
  onProgress: (loaded, total) => {
    console.log(`Progress: ${(loaded/total*100).toFixed(1)}%`);
  }
});

// Batch load
const assets = await manager.loadBatch([
  'texture1.png',
  'texture2.png',
  'audio.mp3'
]);

// Background loading
manager.loadBackground(['preload1.png', 'preload2.png']);
```

## Architecture

### Core Components

#### Asset
Base class for all assets with:
- Unique ID and name
- Load state tracking (unloaded, loading, loaded, error, disposed)
- Reference counting for memory management
- Metadata storage
- Memory size estimation

```typescript
class TextureAsset extends Asset {
  private texture: WebGLTexture;

  getMemorySize(): number {
    return this.width * this.height * 4; // RGBA bytes
  }

  dispose(): void {
    gl.deleteTexture(this.texture);
    super.dispose();
  }
}
```

#### AssetLoader
Central loading system with:
- Multiple loader registration
- Async loading with promises
- Progress callbacks
- Automatic retry on failure
- Batch loading with concurrency control
- Request deduplication

```typescript
const loader = new AssetLoader();
loader.registerLoader(new GLTFLoader());

const asset = await loader.load('model.gltf', {
  retries: 3,
  timeout: 30000,
  onProgress: (loaded, total) => console.log(`${loaded}/${total}`)
});
```

#### AssetCache
In-memory caching with:
- LRU/LFU/FIFO eviction policies
- Memory budget management
- Automatic eviction when over budget
- Cache statistics (hit rate, memory usage)
- Stale asset detection

```typescript
const cache = new AssetCache({
  maxMemory: 512 * 1024 * 1024,
  evictionPolicy: EvictionPolicy.LRU
});

cache.set('texture', textureAsset);
const asset = cache.get('texture');

const stats = cache.getStats();
console.log(`Hit rate: ${(stats.hitRate * 100).toFixed(1)}%`);
```

#### AssetBundle
Bundle/pack support with:
- JSON manifest format
- Dependency resolution
- Partial loading
- Topological sorting for load order

```typescript
const bundle = await AssetBundle.fromManifest('bundle.json', loader);

// Load specific assets with dependencies
await bundle.load('character-model', { loadDependencies: true });

// Load all
await bundle.loadAll();
```

#### AssetReference
Lazy references with:
- Automatic loading on access
- Strong/weak reference modes
- Type-safe asset access
- Load callbacks

```typescript
const textureRef = new AssetReference('texture.png', {
  type: ReferenceType.STRONG,
  autoLoad: true,
  assetManager: manager
});

const texture = await textureRef.get(); // Auto-loads if needed
textureRef.release(); // Decrements reference count
```

#### AssetManager
Central coordination with:
- Loader and cache management
- Priority-based loading queue
- Background loading
- Bundle management
- Asset aliases

```typescript
const manager = new AssetManager();

// Set alias
manager.setAlias('player', 'models/characters/player.gltf');

// Load with priority
const asset = await manager.load('player', {
  priority: LoadPriority.CRITICAL
});

// Background loading
manager.loadBackground(['bg1.png', 'bg2.png']);

// Statistics
console.log(manager.getCacheStats());
console.log(manager.getLoaderStats());
```

### Loaders

#### GLTFLoader
Full glTF 2.0 support:
- Binary (.glb) and JSON (.gltf) formats
- PBR materials with textures
- Mesh geometry with multiple primitives
- Skeletal animation data
- Scene hierarchy
- Extensions support (draco, etc.)

```typescript
const loader = new GLTFLoader();
const asset = await loader.load('model.gltf');

const data = asset.getData();
for (const mesh of data.meshes) {
  for (const primitive of mesh.primitives) {
    const positions = GLTFLoader.getAccessorData(
      primitive.attributes.POSITION,
      data
    );
  }
}
```

#### OBJLoader
Wavefront OBJ support:
- Vertex positions, normals, UVs
- Multiple objects and groups
- MTL material files
- Automatic triangulation

```typescript
const loader = new OBJLoader();
const asset = await loader.load('model.obj');

const data = asset.getData();
for (const obj of data.objects) {
  for (const group of obj.groups) {
    console.log(`${group.name}: ${group.positions.length / 3} vertices`);
  }
}
```

#### ImageLoader
Image loading with:
- Standard formats (PNG, JPEG, WebP)
- HDR format for environment maps
- ImageBitmap for efficient GPU upload
- Automatic mipmap generation

```typescript
const loader = new ImageLoader({
  generateMipmaps: true,
  useImageBitmap: true
});

const asset = await loader.load('texture.png');
console.log(`Loaded ${asset.width}x${asset.height} image`);
```

#### AudioLoader
Audio loading with:
- MP3, OGG, WAV support
- Web Audio API decoding
- Streaming for large files
- HTMLAudioElement fallback

```typescript
const loader = new AudioLoader({
  useWebAudio: true,
  streaming: false
});

const asset = await loader.load('music.mp3');
console.log(`Loaded ${asset.duration.toFixed(2)}s audio`);
```

## Bundle Format

Bundle manifests are JSON files defining a collection of assets:

```json
{
  "name": "character-bundle",
  "version": "1.0.0",
  "baseUrl": "https://cdn.example.com/assets/",
  "assets": [
    {
      "id": "character-model",
      "path": "models/character.gltf",
      "type": "gltf",
      "size": 1024000,
      "dependencies": ["character-texture", "character-skeleton"]
    },
    {
      "id": "character-texture",
      "path": "textures/character.png",
      "type": "image",
      "size": 512000
    },
    {
      "id": "character-skeleton",
      "path": "animations/skeleton.bin",
      "type": "binary",
      "size": 256000
    }
  ]
}
```

## Memory Management

The asset system provides multiple strategies for memory management:

### Reference Counting

```typescript
const asset = await manager.load('model.gltf');
asset.addReference(); // Increment
asset.removeReference(); // Decrement

// Automatic cleanup when count reaches 0
```

### Cache Eviction

```typescript
// Evict to target memory
manager.evictToMemory(256 * 1024 * 1024); // Evict to 256MB

// Evict stale assets (not accessed in 5 minutes)
manager.evictStale(5 * 60 * 1000);

// Manual eviction
manager.unload('old-asset.png', true); // dispose=true
```

### Strong vs Weak References

```typescript
// Strong reference - keeps asset in memory
const strongRef = new StrongAssetReference('texture.png', {
  assetManager: manager
});

// Weak reference - allows eviction
const weakRef = new WeakAssetReference('bg.png', {
  assetManager: manager
});
```

## Performance Tips

1. **Use Background Loading**: Preload assets during idle time
   ```typescript
   manager.loadBackground(['asset1.png', 'asset2.png']);
   ```

2. **Set Priorities**: Critical assets load first
   ```typescript
   await manager.load('player.gltf', { priority: LoadPriority.CRITICAL });
   await manager.load('decoration.obj', { priority: LoadPriority.LOW });
   ```

3. **Batch Loading**: Load related assets together
   ```typescript
   await manager.loadBatch(['model.gltf', 'texture.png', 'normal.png']);
   ```

4. **Use Bundles**: Package related assets with dependencies
   ```typescript
   const bundle = await manager.loadBundle('level1.json');
   await bundle.loadAll();
   ```

5. **Monitor Cache**: Track hit rate and memory usage
   ```typescript
   const stats = manager.getCacheStats();
   if (stats.hitRate < 0.7) {
     // Increase cache size or preload more assets
   }
   ```

6. **Aliases**: Use semantic names instead of paths
   ```typescript
   manager.setAlias('player', 'models/characters/player_v2.gltf');
   const player = await manager.load('player');
   ```

## Statistics

Track performance with built-in statistics:

```typescript
// Cache stats
const cacheStats = manager.getCacheStats();
console.log(`Cache size: ${cacheStats.size}`);
console.log(`Memory: ${cacheStats.memoryUsage / 1024 / 1024} MB`);
console.log(`Hit rate: ${(cacheStats.hitRate * 100).toFixed(1)}%`);
console.log(`Evictions: ${cacheStats.evictions}`);

// Loader stats
const loaderStats = manager.getLoaderStats();
console.log(`Total loads: ${loaderStats.totalLoads}`);
console.log(`Success rate: ${(loaderStats.successfulLoads / loaderStats.totalLoads * 100).toFixed(1)}%`);
console.log(`Total bytes: ${loaderStats.totalBytes / 1024 / 1024} MB`);
console.log(`Avg duration: ${loaderStats.totalDuration / loaderStats.totalLoads} ms`);
```

## Error Handling

Robust error handling with automatic retry:

```typescript
try {
  const asset = await manager.load('model.gltf', {
    retries: 3,
    retryDelay: 1000,
    timeout: 30000
  });
} catch (error) {
  console.error('Failed to load asset:', error);

  // Get load error details
  const cached = manager.get('model.gltf');
  if (cached?.hasError) {
    console.error('Load error:', cached.loadError);
  }
}
```

## Examples

### Complete Scene Loading

```typescript
async function loadScene(manager: AssetManager) {
  // Load scene bundle
  const bundle = await manager.loadBundle('scenes/forest.json');

  // Load critical assets first
  await bundle.loadAssets(['terrain', 'skybox'], {
    loadDependencies: true,
    concurrency: 2
  });

  // Background load everything else
  const remaining = bundle.getManifest().assets
    .map(e => e.id)
    .filter(id => !bundle.get(id));

  bundle.loadAssets(remaining, {
    loadDependencies: true,
    concurrency: 4
  });
}
```

### Texture Streaming

```typescript
async function loadTextureWithMipmaps(manager: AssetManager) {
  const imageLoader = new ImageLoader({
    generateMipmaps: true,
    useImageBitmap: true,
    maxMipLevel: 8
  });

  manager.registerLoader(imageLoader);

  const asset = await manager.load('texture.png');
  const data = asset.getData();

  // Upload base level
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, data.data);

  // Upload mipmaps
  if (data.mipLevels) {
    for (let i = 0; i < data.mipLevels.length; i++) {
      gl.texImage2D(gl.TEXTURE_2D, i + 1, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, data.mipLevels[i]);
    }
  }
}
```

### Progressive Loading

```typescript
async function progressiveLoad(manager: AssetManager, urls: string[]) {
  const total = urls.length;
  let loaded = 0;

  for (const url of urls) {
    await manager.load(url, {
      onProgress: (bytes, totalBytes) => {
        const progress = ((loaded + bytes / totalBytes) / total) * 100;
        updateProgressBar(progress);
      }
    });

    loaded++;
  }
}
```

## File Structure

```
src/assets/
├── Asset.ts              # Base asset class (370 lines)
├── AssetLoader.ts        # Central loading system (573 lines)
├── AssetCache.ts         # Caching with eviction (519 lines)
├── AssetBundle.ts        # Bundle management (506 lines)
├── AssetReference.ts     # Lazy references (338 lines)
├── AssetManager.ts       # Central coordination (488 lines)
├── index.ts              # Barrel exports (100 lines)
├── loaders/
│   ├── GLTFLoader.ts     # glTF 2.0 loader (560 lines)
│   ├── OBJLoader.ts      # Wavefront OBJ loader (533 lines)
│   ├── ImageLoader.ts    # Image loader (504 lines)
│   └── AudioLoader.ts    # Audio loader (362 lines)
└── README.md             # This file

Total: ~4,850 lines of production-ready TypeScript
```

## License

Part of the G3D 5.0 engine.
