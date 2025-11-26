/**
 * Texture System
 *
 * Comprehensive texture management for the G3D rendering engine.
 * Supports 2D, Cube, Array, and 3D textures with full mipmap control.
 *
 * @module rendering/texture
 */

export {
  Texture,
  TextureType,
  TextureFilter,
  TextureWrap,
  TextureFormat,
  CubeFace,
} from './Texture';

export type {
  TextureDescriptor,
  TextureData,
} from './Texture';

export {
  TextureLoader,
} from './TextureLoader';

export type {
  TextureLoadOptions,
  TextureLoadResult,
  ImageFormat,
} from './TextureLoader';

export {
  RenderTexture,
  AttachmentType,
} from './RenderTexture';

export type {
  RenderTextureDescriptor,
} from './RenderTexture';

export {
  TextureAtlas,
} from './TextureAtlas';

export type {
  AtlasSprite,
  AtlasPackOptions,
} from './TextureAtlas';
