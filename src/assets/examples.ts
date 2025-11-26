/**
 * G3D Asset System Usage Examples
 *
 * Comprehensive examples demonstrating all features of the asset system.
 */

import {
  AssetManager,
  AssetCache,
  AssetBundle,
  AssetReference,
  GLTFLoader,
  GLTFAsset,
  OBJLoader,
  OBJAsset,
  ImageLoader,
  ImageAsset,
  AudioLoader,
  AudioAsset,
  LoadPriority,
  AssetEvictionPolicy,
  ReferenceType
} from './index';

/**
 * Example 1: Basic Asset Loading
 */
export async function example1_BasicLoading() {
  // Create asset manager
  const manager = new AssetManager();

  // Register loaders
  manager.registerLoader(new GLTFLoader());
  manager.registerLoader(new ImageLoader());
  manager.registerLoader(new AudioLoader());

  // Load a single asset
  const model = await manager.load('models/character.gltf');
  console.log(`Loaded: ${model.name}`);

  // Load with progress tracking
  const texture = await manager.load('textures/wood.png', {
    onProgress: (loaded, total) => {
      const percent = (loaded / total * 100).toFixed(1);
      console.log(`Loading texture: ${percent}%`);
    }
  });

  // Batch load
  const assets = await manager.loadBatch([
    'textures/wall.png',
    'textures/floor.png',
    'audio/footsteps.mp3'
  ]);

  console.log(`Loaded ${assets.length} assets`);
}

/**
 * Example 2: Caching and Memory Management
 */
export async function example2_CachingAndMemory() {
  const manager = new AssetManager({
    cache: {
      maxMemory: 256 * 1024 * 1024, // 256MB
      evictionPolicy: AssetEvictionPolicy.LRU,
      autoMonitor: true,
      monitorInterval: 5000
    }
  });

  manager.registerLoader(new ImageLoader());

  // Load assets
  await manager.loadBatch([
    'texture1.png',
    'texture2.png',
    'texture3.png'
  ]);

  // Check cache stats
  const stats = manager.getCacheStats();
  console.log(`Cache size: ${stats.size}`);
  console.log(`Memory usage: ${(stats.memoryUsage / 1024 / 1024).toFixed(1)} MB`);
  console.log(`Hit rate: ${(stats.hitRate * 100).toFixed(1)}%`);

  // Get cached asset
  const cached = manager.get('texture1.png');
  if (cached) {
    console.log('Found in cache!');
  }

  // Evict to free memory
  const evicted = manager.evictToMemory(128 * 1024 * 1024);
  console.log(`Evicted ${evicted} assets`);

  // Evict stale assets (not accessed in 5 minutes)
  const stale = manager.evictStale(5 * 60 * 1000);
  console.log(`Evicted ${stale} stale assets`);
}

/**
 * Example 3: Priority-Based Loading
 */
export async function example3_PriorityLoading() {
  const manager = new AssetManager({
    enableBackgroundLoading: true
  });

  manager.registerLoader(new GLTFLoader());
  manager.registerLoader(new ImageLoader());

  // Load critical assets immediately
  const player = await manager.load('models/player.gltf', {
    priority: LoadPriority.CRITICAL
  });

  // Load important assets with high priority
  const weapon = await manager.load('models/weapon.gltf', {
    priority: LoadPriority.HIGH
  });

  // Queue background loading for non-critical assets
  manager.loadBackground([
    'textures/skybox1.png',
    'textures/skybox2.png',
    'models/decoration1.obj',
    'models/decoration2.obj'
  ]);

  console.log(`Background queue size: ${manager.getBackgroundQueueSize()}`);
}

/**
 * Example 4: Asset Bundles
 */
export async function example4_AssetBundles() {
  const manager = new AssetManager();
  manager.registerLoader(new GLTFLoader());
  manager.registerLoader(new ImageLoader());

  // Create bundle manifest
  const manifest = {
    name: 'level-1',
    version: '1.0.0',
    baseUrl: 'https://cdn.example.com/assets/',
    assets: [
      {
        id: 'terrain',
        path: 'models/terrain.gltf',
        type: 'gltf',
        dependencies: ['terrain-texture']
      },
      {
        id: 'terrain-texture',
        path: 'textures/terrain.png',
        type: 'image'
      },
      {
        id: 'building',
        path: 'models/building.gltf',
        type: 'gltf',
        dependencies: ['building-texture']
      },
      {
        id: 'building-texture',
        path: 'textures/building.png',
        type: 'image'
      }
    ]
  };

  // Load bundle from manifest
  const bundle = await manager.loadBundle('bundles/level-1.json');

  // Load specific asset with dependencies
  await bundle.load('building', { loadDependencies: true });

  // Load all assets in bundle
  await bundle.loadAll({
    concurrency: 4,
    onProgress: (loaded, total) => {
      console.log(`Bundle progress: ${loaded}/${total}`);
    }
  });

  // Check dependencies
  const deps = bundle.getDependencies('building');
  console.log(`Building dependencies:`, deps);

  // Get load progress
  const progress = bundle.getLoadProgress();
  console.log(`Loaded ${progress.loaded}/${progress.total} assets`);
}

/**
 * Example 5: Asset References
 */
export async function example5_AssetReferences() {
  const manager = new AssetManager();
  manager.registerLoader(new ImageLoader());

  // Strong reference (keeps asset in memory)
  const strongRef = new AssetReference('important-texture.png', {
    type: ReferenceType.STRONG,
    autoLoad: true,
    assetManager: manager
  });

  // Access triggers load
  const texture = await strongRef.get();
  console.log(`Loaded: ${texture.name}`);

  // Weak reference (allows eviction)
  const weakRef = new AssetReference('background.png', {
    type: ReferenceType.WEAK,
    autoLoad: true,
    assetManager: manager
  });

  // Add callbacks
  strongRef
    .onLoad(asset => console.log(`Asset loaded: ${asset.name}`))
    .onError(error => console.error(`Load error: ${error.message}`));

  // Release references
  strongRef.release();
  weakRef.release();
}

/**
 * Example 6: Error Handling and Retry
 */
export async function example6_ErrorHandling() {
  const manager = new AssetManager();
  manager.registerLoader(new ImageLoader());

  try {
    // Load with automatic retry
    const asset = await manager.load('unreliable-server/texture.png', {
      retries: 3,
      retryDelay: 1000,
      timeout: 10000,
      onProgress: (loaded, total) => {
        console.log(`Progress: ${loaded}/${total}`);
      }
    });

    console.log('Loaded successfully!');
  } catch (error) {
    console.error('Failed after retries:', error);

    // Check error details
    const cached = manager.get('unreliable-server/texture.png');
    if (cached?.hasError) {
      console.error('Error details:', cached.loadError);
    }
  }
}

/**
 * Example 7: Custom Asset Loader
 */
export async function example7_CustomLoader() {
  const manager = new AssetManager();

  // Create custom loader for JSON files
  class JSONLoader {
    async load(url: string) {
      const response = await fetch(url);
      const json = await response.json();

      // Return custom asset
      return {
        id: url,
        name: url,
        data: json,
        getMemorySize: () => JSON.stringify(json).length
      };
    }

    canLoad(url: string) {
      return url.endsWith('.json');
    }

    getSupportedExtensions() {
      return ['json'];
    }
  }

  manager.registerLoader(new JSONLoader() as any);

  // Load JSON asset
  const config = await manager.load('config.json');
  console.log('Config loaded:', config);
}

/**
 * Example 8: glTF Model Loading
 */
export async function example8_GLTFLoading() {
  const manager = new AssetManager();
  const gltfLoader = new GLTFLoader();
  manager.registerLoader(gltfLoader);

  // Load glTF model
  const asset = await manager.load('models/robot.gltf') as GLTFAsset;
  const data = asset.getData();

  if (!data) return;

  console.log(`Loaded glTF model:`);
  console.log(`- Scenes: ${data.scenes.length}`);
  console.log(`- Nodes: ${data.nodes.length}`);
  console.log(`- Meshes: ${data.meshes.length}`);
  console.log(`- Materials: ${data.materials.length}`);
  console.log(`- Animations: ${data.animations.length}`);

  // Process meshes
  for (const mesh of data.meshes) {
    console.log(`Mesh: ${mesh.name || 'unnamed'}`);

    for (const primitive of mesh.primitives) {
      // Get vertex data
      if (primitive.attributes.POSITION !== undefined) {
        const positions = GLTFLoader.getAccessorData(
          primitive.attributes.POSITION,
          data
        );
        console.log(`  Vertices: ${positions.length / 3}`);
      }

      // Get indices
      if (primitive.indices !== undefined) {
        const indices = GLTFLoader.getAccessorData(
          primitive.indices,
          data
        );
        console.log(`  Triangles: ${indices.length / 3}`);
      }
    }
  }
}

/**
 * Example 9: OBJ Model Loading
 */
export async function example9_OBJLoading() {
  const manager = new AssetManager();
  manager.registerLoader(new OBJLoader());

  // Load OBJ model
  const asset = await manager.load('models/spaceship.obj') as OBJAsset;
  const data = asset.getData();

  if (!data) return;

  console.log(`Loaded OBJ model:`);
  console.log(`- Objects: ${data.objects.length}`);
  console.log(`- Materials: ${data.materials.size}`);

  // Process objects
  for (const obj of data.objects) {
    console.log(`Object: ${obj.name}`);

    for (const group of obj.groups) {
      const vertexCount = group.positions.length / 3;
      const triangleCount = group.indices.length / 3;

      console.log(`  Group: ${group.name}`);
      console.log(`    Material: ${group.material || 'none'}`);
      console.log(`    Vertices: ${vertexCount}`);
      console.log(`    Triangles: ${triangleCount}`);
    }
  }

  // Process materials
  for (const [name, material] of data.materials) {
    console.log(`Material: ${name}`);
    if (material.diffuse) {
      console.log(`  Diffuse: [${material.diffuse.join(', ')}]`);
    }
    if (material.mapDiffuse) {
      console.log(`  Texture: ${material.mapDiffuse}`);
    }
  }
}

/**
 * Example 10: Image Loading with Mipmaps
 */
export async function example10_ImageLoading() {
  const manager = new AssetManager();

  const imageLoader = new ImageLoader({
    generateMipmaps: true,
    useImageBitmap: true,
    maxMipLevel: 8
  });

  manager.registerLoader(imageLoader);

  // Load image
  const asset = await manager.load('textures/brick-wall.png') as ImageAsset;
  const data = asset.getData();

  if (!data) return;

  console.log(`Loaded image:`);
  console.log(`- Size: ${data.width}x${data.height}`);
  console.log(`- Format: ${data.format}`);
  console.log(`- Mipmap levels: ${data.mipLevels?.length || 0}`);
  console.log(`- Memory: ${(asset.getMemorySize() / 1024).toFixed(1)} KB`);

  // Process mipmap chain
  if (data.mipLevels) {
    for (let i = 0; i < data.mipLevels.length; i++) {
      const mip = data.mipLevels[i];
      console.log(`  Mip ${i + 1}: ${mip.width}x${mip.height}`);
    }
  }
}

/**
 * Example 11: Audio Loading
 */
export async function example11_AudioLoading() {
  const manager = new AssetManager();

  const audioLoader = new AudioLoader({
    useWebAudio: true,
    streaming: false
  });

  manager.registerLoader(audioLoader);

  // Load audio
  const asset = await manager.load('audio/theme.mp3', {
    onProgress: (loaded, total) => {
      console.log(`Loading audio: ${(loaded / total * 100).toFixed(1)}%`);
    }
  }) as AudioAsset;

  const data = asset.getData();

  if (!data) return;

  console.log(`Loaded audio:`);
  console.log(`- Duration: ${data.duration.toFixed(2)}s`);
  console.log(`- Sample rate: ${data.sampleRate} Hz`);
  console.log(`- Channels: ${data.numberOfChannels}`);
  console.log(`- Format: ${data.format}`);
  console.log(`- Memory: ${(asset.getMemorySize() / 1024).toFixed(1)} KB`);
}

/**
 * Example 12: Asset Aliases
 */
export async function example12_Aliases() {
  const manager = new AssetManager();
  manager.registerLoader(new GLTFLoader());

  // Set aliases for versioned assets
  manager.setAlias('player', 'models/characters/player_v2.gltf');
  manager.setAlias('weapon', 'models/weapons/sword_v3.gltf');
  manager.setAlias('enemy', 'models/characters/enemy_v1.gltf');

  // Load using aliases
  const player = await manager.load('player');
  const weapon = await manager.load('weapon');

  console.log('Assets loaded using aliases');

  // Update alias to new version
  manager.setAlias('player', 'models/characters/player_v3.gltf');
}

/**
 * Example 13: Complete Scene Loading
 */
export async function example13_CompleteScene() {
  const manager = new AssetManager({
    cache: {
      maxMemory: 512 * 1024 * 1024,
      evictionPolicy: AssetEvictionPolicy.LRU
    },
    enableBackgroundLoading: true
  });

  // Register all loaders
  manager.registerLoader(new GLTFLoader());
  manager.registerLoader(new OBJLoader());
  manager.registerLoader(new ImageLoader());
  manager.registerLoader(new AudioLoader());

  console.log('Loading scene...');

  // Phase 1: Load critical assets
  console.log('Phase 1: Critical assets');
  await manager.loadBatch([
    'models/player.gltf',
    'textures/ui/loading.png'
  ], { priority: LoadPriority.CRITICAL });

  // Phase 2: Load scene geometry
  console.log('Phase 2: Scene geometry');
  const bundle = await manager.loadBundle('scenes/forest-level.json');
  await bundle.loadAssets(['terrain', 'skybox'], {
    loadDependencies: true,
    concurrency: 2
  });

  // Phase 3: Load interactive objects
  console.log('Phase 3: Interactive objects');
  await manager.loadBatch([
    'models/tree.obj',
    'models/rock.obj',
    'models/building.gltf'
  ], { priority: LoadPriority.HIGH });

  // Phase 4: Background load decorations and audio
  console.log('Phase 4: Background loading');
  manager.loadBackground([
    'models/grass.obj',
    'models/flower.obj',
    'audio/ambient-forest.mp3',
    'audio/bird-chirp.mp3'
  ]);

  // Monitor progress
  setInterval(() => {
    const stats = manager.getCacheStats();
    console.log(`Cache: ${stats.size} assets, ${(stats.memoryUsage / 1024 / 1024).toFixed(1)} MB`);
    console.log(`Background queue: ${manager.getBackgroundQueueSize()}`);
  }, 1000);

  console.log('Scene loaded!');
}

/**
 * Example 14: Streaming Large Assets
 */
export async function example14_Streaming() {
  const manager = new AssetManager();

  // Use streaming for large audio files
  const streamingAudioLoader = new AudioLoader({
    streaming: true
  });

  manager.registerLoader(streamingAudioLoader);

  // Load large audio file with streaming
  const music = await manager.load('audio/soundtrack.mp3') as AudioAsset;
  console.log(`Streaming audio loaded (${music.duration.toFixed(1)}s)`);

  // The audio can start playing while still loading
  const data = music.getData();
  if (data?.element) {
    data.element.play();
  }
}

/**
 * Example 15: Statistics and Monitoring
 */
export async function example15_Statistics() {
  const manager = new AssetManager();
  manager.registerLoader(new ImageLoader());

  // Load some assets
  await manager.loadBatch([
    'texture1.png',
    'texture2.png',
    'texture3.png'
  ]);

  // Get cache statistics
  const cacheStats = manager.getCacheStats();
  console.log('\nCache Statistics:');
  console.log(`- Size: ${cacheStats.size} assets`);
  console.log(`- Memory: ${(cacheStats.memoryUsage / 1024 / 1024).toFixed(2)} MB / ${(cacheStats.maxMemory / 1024 / 1024).toFixed(0)} MB`);
  console.log(`- Hit rate: ${(cacheStats.hitRate * 100).toFixed(1)}%`);
  console.log(`- Hits: ${cacheStats.hits}`);
  console.log(`- Misses: ${cacheStats.misses}`);
  console.log(`- Evictions: ${cacheStats.evictions}`);

  // Get loader statistics
  const loaderStats = manager.getLoaderStats();
  console.log('\nLoader Statistics:');
  console.log(`- Total loads: ${loaderStats.totalLoads}`);
  console.log(`- Successful: ${loaderStats.successfulLoads}`);
  console.log(`- Failed: ${loaderStats.failedLoads}`);
  console.log(`- Total bytes: ${(loaderStats.totalBytes / 1024 / 1024).toFixed(2)} MB`);
  console.log(`- Average duration: ${(loaderStats.totalDuration / loaderStats.totalLoads).toFixed(0)} ms`);

  // Get assets by state
  const loaded = manager.getLoadedAssets();
  const loading = manager.getLoadingAssets();
  const errored = manager.getErroredAssets();

  console.log('\nAsset States:');
  console.log(`- Loaded: ${loaded.length}`);
  console.log(`- Loading: ${loading.length}`);
  console.log(`- Errored: ${errored.length}`);
}
