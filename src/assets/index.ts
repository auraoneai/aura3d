/**
 * G3D Asset System
 *
 * Complete asset management system for the G3D 5.0 engine with support for:
 * - Multiple asset formats (glTF, OBJ, images, audio)
 * - Async loading with progress tracking
 * - Automatic caching with LRU eviction
 * - Asset bundles and dependency management
 * - Reference counting and memory management
 * - Background loading and prioritization
 *
 * @module assets
 */

// Core
export {
  Asset,
  AssetLoadState
} from './Asset';
export type {
  AssetMetadata,
  AssetOptions
} from './Asset';

export {
  AssetLoader
} from './AssetLoader';
export type {
  IAssetLoader,
  LoadOptions,
  LoadProgressCallback,
  BatchLoadOptions,
  LoadResult
} from './AssetLoader';

export {
  AssetCache,
  AssetEvictionPolicy
} from './AssetCache';
export type {
  CacheOptions,
  CacheStats
} from './AssetCache';

export {
  AssetBundle
} from './AssetBundle';
export type {
  BundleManifest,
  BundleManifestEntry,
  BundleLoadOptions,
  BundleLoadProgress
} from './AssetBundle';

export {
  AssetReference,
  ReferenceType,
  createAssetReference,
  WeakAssetReference,
  StrongAssetReference
} from './AssetReference';
export type {
  AssetReferenceOptions
} from './AssetReference';

export {
  AssetManager,
  LoadPriority
} from './AssetManager';
export type {
  AssetManagerOptions
} from './AssetManager';

// Loaders
export {
  GLTFLoader,
  GLTFAsset
} from './loaders/GLTFLoader';
export type {
  GLTFAssetData,
  GLTFMaterial,
  GLTFMesh,
  GLTFPrimitive,
  GLTFNode,
  GLTFScene,
  GLTFAnimation,
  GLTFAnimationSampler,
  GLTFAnimationChannel,
  GLTFAnimationChannelTarget,
  GLTFSkin
} from './loaders/GLTFLoader';

export {
  OBJLoader,
  OBJAsset
} from './loaders/OBJLoader';
export type {
  OBJAssetData,
  OBJMaterial,
  OBJObject,
  OBJGroup
} from './loaders/OBJLoader';

export {
  ImageLoader,
  ImageAsset,
  ImageFormat
} from './loaders/ImageLoader';
export type {
  ImageData
} from './loaders/ImageLoader';

export {
  AudioLoader,
  AudioAsset,
  AudioFormat
} from './loaders/AudioLoader';
export type {
  AudioData
} from './loaders/AudioLoader';
