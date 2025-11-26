import { Logger } from '../../core/Logger';
import { IdGenerator } from '../../core/IdGenerator';
import { Texture, TextureFormat, TextureFilter, TextureWrap } from './Texture';
import { Rect } from '../../math/Rect';
import { Vector2 } from '../../math/Vector2';

const logger = Logger.create('TextureAtlas');

/**
 * Sprite definition within a texture atlas.
 */
export interface AtlasSprite {
  /** Unique sprite identifier */
  id: string;
  /** Sprite name */
  name: string;
  /** Position in atlas (pixels) */
  x: number;
  /** Position in atlas (pixels) */
  y: number;
  /** Width in pixels */
  width: number;
  /** Height in pixels */
  height: number;
  /** UV coordinates (normalized 0-1) */
  uv: Rect;
  /** Original image if available */
  image?: HTMLImageElement | HTMLCanvasElement;
  /** Whether sprite is rotated 90 degrees */
  rotated?: boolean;
  /** Padding around sprite */
  padding?: number;
}

/**
 * Atlas packing options.
 */
export interface AtlasPackOptions {
  /** Maximum atlas width (default: 2048) */
  maxWidth?: number;
  /** Maximum atlas height (default: 2048) */
  maxHeight?: number;
  /** Padding between sprites in pixels (default: 2) */
  padding?: number;
  /** Allow rotating sprites 90 degrees for better packing (default: false) */
  allowRotation?: boolean;
  /** Power-of-two dimensions (default: true) */
  powerOfTwo?: boolean;
  /** Extrude edge pixels to prevent bleeding (default: 1) */
  extrude?: number;
}

/**
 * Shelf node for shelf packing algorithm.
 */
interface ShelfNode {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Texture atlas for sprite batching and runtime texture packing.
 * Uses shelf-packing algorithm for efficient space utilization.
 *
 * @example
 * ```typescript
 * // Create an atlas
 * const atlas = new TextureAtlas({
 *   maxWidth: 2048,
 *   maxHeight: 2048,
 *   padding: 2,
 * });
 *
 * // Add sprites from images
 * const sprite1 = await atlas.addSprite('player', playerImage);
 * const sprite2 = await atlas.addSprite('enemy', enemyImage);
 * const sprite3 = await atlas.addSprite('bullet', bulletImage);
 *
 * // Build the atlas texture
 * const texture = await atlas.build();
 *
 * // Use sprite UV coordinates for rendering
 * const playerUV = atlas.getSprite('player')?.uv;
 * if (playerUV) {
 *   spriteMaterial.setVector4('uUVRect', [
 *     playerUV.x, playerUV.y, playerUV.width, playerUV.height
 *   ]);
 * }
 *
 * // Add sprites dynamically
 * atlas.addSprite('explosion', explosionImage).then(sprite => {
 *   atlas.rebuild(); // Repack and update texture
 * });
 *
 * // Get sprite by name
 * const sprite = atlas.getSprite('player');
 * console.log(`UV: ${sprite.uv.x}, ${sprite.uv.y}`);
 * ```
 */
export class TextureAtlas {
  /** Unique atlas identifier */
  readonly id: string;

  /** Atlas label */
  readonly label: string;

  /** Packing options */
  private options: Required<AtlasPackOptions>;

  /** Registered sprites */
  private sprites = new Map<string, AtlasSprite>();

  /** Sprite lookup by ID */
  private spritesById = new Map<string, AtlasSprite>();

  /** Current atlas texture */
  private texture: Texture | null = null;

  /** Canvas for building atlas */
  private canvas: HTMLCanvasElement;

  /** Canvas rendering context */
  private ctx: CanvasRenderingContext2D;

  /** Current atlas width */
  private currentWidth = 0;

  /** Current atlas height */
  private currentHeight = 0;

  /** Whether atlas needs rebuilding */
  private dirty = false;

  /**
   * Creates a new TextureAtlas instance.
   *
   * @param options - Atlas packing options
   *
   * @example
   * ```typescript
   * const atlas = new TextureAtlas({
   *   maxWidth: 4096,
   *   maxHeight: 4096,
   *   padding: 4,
   *   allowRotation: true,
   * });
   * ```
   */
  constructor(options: AtlasPackOptions = {}) {
    this.id = IdGenerator.nextAssetId();
    this.label = 'TextureAtlas';

    this.options = {
      maxWidth: options.maxWidth || 2048,
      maxHeight: options.maxHeight || 2048,
      padding: options.padding || 2,
      allowRotation: options.allowRotation || false,
      powerOfTwo: options.powerOfTwo !== false,
      extrude: options.extrude || 1,
    };

    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;

    logger.debug(`Created texture atlas: ${this.id}`, this.options);
  }

  /**
   * Adds a sprite to the atlas.
   *
   * @param name - Sprite name
   * @param image - Image element or canvas
   * @returns Promise resolving to sprite definition
   *
   * @example
   * ```typescript
   * const sprite = await atlas.addSprite('player', playerImage);
   * console.log(`Added sprite: ${sprite.name} (${sprite.width}x${sprite.height})`);
   * ```
   */
  async addSprite(
    name: string,
    image: HTMLImageElement | HTMLCanvasElement
  ): Promise<AtlasSprite> {
    // Wait for image to load if needed
    if (image instanceof HTMLImageElement && !image.complete) {
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error(`Failed to load image: ${name}`));
      });
    }

    const sprite: AtlasSprite = {
      id: IdGenerator.nextAssetId(),
      name,
      x: 0,
      y: 0,
      width: image.width,
      height: image.height,
      uv: new Rect(0, 0, 0, 0),
      image,
      rotated: false,
      padding: this.options.padding,
    };

    this.sprites.set(name, sprite);
    this.spritesById.set(sprite.id, sprite);
    this.dirty = true;

    logger.trace(`Added sprite: ${name} (${sprite.width}x${sprite.height})`);

    return sprite;
  }

  /**
   * Adds multiple sprites at once.
   *
   * @param sprites - Array of [name, image] tuples
   * @returns Promise resolving to array of sprite definitions
   *
   * @example
   * ```typescript
   * const sprites = await atlas.addSprites([
   *   ['player', playerImage],
   *   ['enemy', enemyImage],
   *   ['bullet', bulletImage],
   * ]);
   * ```
   */
  async addSprites(
    sprites: Array<[string, HTMLImageElement | HTMLCanvasElement]>
  ): Promise<AtlasSprite[]> {
    return Promise.all(sprites.map(([name, image]) => this.addSprite(name, image)));
  }

  /**
   * Removes a sprite from the atlas.
   *
   * @param name - Sprite name
   * @returns True if sprite was removed
   *
   * @example
   * ```typescript
   * atlas.removeSprite('oldSprite');
   * atlas.rebuild();
   * ```
   */
  removeSprite(name: string): boolean {
    const sprite = this.sprites.get(name);
    if (!sprite) {
      return false;
    }

    this.sprites.delete(name);
    this.spritesById.delete(sprite.id);
    this.dirty = true;

    logger.trace(`Removed sprite: ${name}`);
    return true;
  }

  /**
   * Gets a sprite by name.
   *
   * @param name - Sprite name
   * @returns Sprite definition or undefined
   *
   * @example
   * ```typescript
   * const sprite = atlas.getSprite('player');
   * if (sprite) {
   *   console.log(`UV: ${sprite.uv.x}, ${sprite.uv.y}`);
   * }
   * ```
   */
  getSprite(name: string): AtlasSprite | undefined {
    return this.sprites.get(name);
  }

  /**
   * Gets a sprite by ID.
   *
   * @param id - Sprite ID
   * @returns Sprite definition or undefined
   */
  getSpriteById(id: string): AtlasSprite | undefined {
    return this.spritesById.get(id);
  }

  /**
   * Gets all sprites in the atlas.
   *
   * @returns Array of sprite definitions
   *
   * @example
   * ```typescript
   * const allSprites = atlas.getAllSprites();
   * allSprites.forEach(sprite => {
   *   console.log(`${sprite.name}: ${sprite.width}x${sprite.height}`);
   * });
   * ```
   */
  getAllSprites(): AtlasSprite[] {
    return Array.from(this.sprites.values());
  }

  /**
   * Gets the atlas texture.
   *
   * @returns Atlas texture or null if not built
   *
   * @example
   * ```typescript
   * const texture = atlas.getTexture();
   * if (texture) {
   *   material.setTexture('uAtlas', texture);
   * }
   * ```
   */
  getTexture(): Texture | null {
    return this.texture;
  }

  /**
   * Gets atlas dimensions.
   *
   * @returns Size vector [width, height]
   */
  getSize(): Vector2 {
    return new Vector2(this.currentWidth, this.currentHeight);
  }

  /**
   * Checks if atlas needs rebuilding.
   *
   * @returns True if sprites have been added/removed
   */
  isDirty(): boolean {
    return this.dirty;
  }

  /**
   * Builds the atlas texture from registered sprites.
   * Packs sprites using shelf algorithm and creates the texture.
   *
   * @returns Promise resolving to atlas texture
   *
   * @example
   * ```typescript
   * await atlas.addSprites([...]);
   * const texture = await atlas.build();
   * ```
   */
  async build(): Promise<Texture> {
    logger.debug(`Building atlas with ${this.sprites.size} sprites`);

    // Pack sprites using shelf algorithm
    const packed = this.packSprites();

    // Determine final atlas size
    const { width, height } = this.calculateAtlasSize(packed);
    this.currentWidth = width;
    this.currentHeight = height;

    // Resize canvas
    this.canvas.width = width;
    this.canvas.height = height;

    // Clear canvas
    this.ctx.clearRect(0, 0, width, height);

    // Draw sprites to canvas
    for (const sprite of packed) {
      if (!sprite.image) continue;

      if (sprite.rotated) {
        // Draw rotated sprite
        this.ctx.save();
        this.ctx.translate(sprite.x + sprite.height, sprite.y);
        this.ctx.rotate(Math.PI / 2);
        this.ctx.drawImage(sprite.image, 0, 0);
        this.ctx.restore();
      } else {
        // Draw normal sprite
        this.ctx.drawImage(sprite.image, sprite.x, sprite.y);
      }

      // Extrude edges to prevent bleeding
      if (this.options.extrude > 0) {
        this.extrudeSprite(sprite);
      }

      // Calculate UV coordinates
      sprite.uv = new Rect(
        sprite.x / width,
        sprite.y / height,
        sprite.width / width,
        sprite.height / height
      );
    }

    // Create or update texture
    if (this.texture) {
      this.texture.resize(width, height);
      this.texture.setData({ data: this.canvas });
    } else {
      this.texture = new Texture({
        width,
        height,
        format: TextureFormat.RGBA8,
        minFilter: TextureFilter.LinearMipmapLinear,
        magFilter: TextureFilter.Linear,
        wrapU: TextureWrap.ClampToEdge,
        wrapV: TextureWrap.ClampToEdge,
        anisotropy: 16,
        label: `${this.label}_Texture`,
      });
      this.texture.setData({ data: this.canvas });
      this.texture.generateMipmaps();
    }

    this.dirty = false;

    logger.info(`Built atlas: ${width}x${height}`, {
      sprites: this.sprites.size,
      utilization: this.calculateUtilization().toFixed(2) + '%',
    });

    return this.texture;
  }

  /**
   * Rebuilds the atlas if dirty.
   *
   * @returns Promise resolving to atlas texture
   *
   * @example
   * ```typescript
   * atlas.addSprite('newSprite', image);
   * await atlas.rebuild(); // Only rebuilds if needed
   * ```
   */
  async rebuild(): Promise<Texture> {
    if (!this.dirty && this.texture) {
      return this.texture;
    }
    return this.build();
  }

  /**
   * Packs sprites using shelf packing algorithm.
   *
   * @returns Array of packed sprites with positions
   */
  private packSprites(): AtlasSprite[] {
    const sprites = Array.from(this.sprites.values());

    // Sort sprites by height (descending) for better packing
    sprites.sort((a, b) => b.height - a.height);

    const shelves: ShelfNode[] = [];
    let currentShelf: ShelfNode | null = null;

    for (const sprite of sprites) {
      const padding = this.options.padding;
      const spriteWidth = sprite.width + padding * 2;
      const spriteHeight = sprite.height + padding * 2;

      let placed = false;

      // Try to place on existing shelf
      if (currentShelf) {
        if (currentShelf.x + spriteWidth <= this.options.maxWidth) {
          sprite.x = currentShelf.x + padding;
          sprite.y = currentShelf.y + padding;
          currentShelf.x += spriteWidth;
          currentShelf.height = Math.max(currentShelf.height, spriteHeight);
          placed = true;
        }
      }

      // Create new shelf if needed
      if (!placed) {
        const shelfY = shelves.reduce((y, shelf) => y + shelf.height, 0);
        if (shelfY + spriteHeight > this.options.maxHeight) {
          logger.warn(`Atlas overflow: Cannot fit sprite ${sprite.name}`);
          continue;
        }

        currentShelf = {
          x: spriteWidth,
          y: shelfY,
          width: spriteWidth,
          height: spriteHeight,
        };

        sprite.x = padding;
        sprite.y = shelfY + padding;
        shelves.push(currentShelf);
      }
    }

    return sprites;
  }

  /**
   * Calculates optimal atlas size based on packed sprites.
   *
   * @param sprites - Packed sprites
   * @returns Atlas dimensions
   */
  private calculateAtlasSize(sprites: AtlasSprite[]): { width: number; height: number } {
    let maxX = 0;
    let maxY = 0;

    for (const sprite of sprites) {
      maxX = Math.max(maxX, sprite.x + sprite.width + this.options.padding);
      maxY = Math.max(maxY, sprite.y + sprite.height + this.options.padding);
    }

    let width = maxX;
    let height = maxY;

    // Round to power of two if requested
    if (this.options.powerOfTwo) {
      width = this.nextPowerOfTwo(width);
      height = this.nextPowerOfTwo(height);
    }

    // Clamp to max size
    width = Math.min(width, this.options.maxWidth);
    height = Math.min(height, this.options.maxHeight);

    return { width, height };
  }

  /**
   * Extrudes sprite edges to prevent texture bleeding.
   *
   * @param sprite - Sprite to extrude
   */
  private extrudeSprite(sprite: AtlasSprite): void {
    const extrude = this.options.extrude;
    if (extrude <= 0 || !sprite.image) return;

    const x = sprite.x;
    const y = sprite.y;
    const w = sprite.width;
    const h = sprite.height;

    // Top edge
    this.ctx.drawImage(sprite.image, 0, 0, w, 1, x, y - extrude, w, extrude);

    // Bottom edge
    this.ctx.drawImage(sprite.image, 0, h - 1, w, 1, x, y + h, w, extrude);

    // Left edge
    this.ctx.drawImage(sprite.image, 0, 0, 1, h, x - extrude, y, extrude, h);

    // Right edge
    this.ctx.drawImage(sprite.image, w - 1, 0, 1, h, x + w, y, extrude, h);

    // Corners
    this.ctx.drawImage(sprite.image, 0, 0, 1, 1, x - extrude, y - extrude, extrude, extrude);
    this.ctx.drawImage(sprite.image, w - 1, 0, 1, 1, x + w, y - extrude, extrude, extrude);
    this.ctx.drawImage(sprite.image, 0, h - 1, 1, 1, x - extrude, y + h, extrude, extrude);
    this.ctx.drawImage(sprite.image, w - 1, h - 1, 1, 1, x + w, y + h, extrude, extrude);
  }

  /**
   * Calculates space utilization percentage.
   *
   * @returns Utilization as percentage (0-100)
   */
  private calculateUtilization(): number {
    if (this.currentWidth === 0 || this.currentHeight === 0) {
      return 0;
    }

    let usedArea = 0;
    for (const sprite of this.sprites.values()) {
      usedArea += sprite.width * sprite.height;
    }

    const totalArea = this.currentWidth * this.currentHeight;
    return (usedArea / totalArea) * 100;
  }

  /**
   * Finds next power of two greater than or equal to n.
   *
   * @param n - Input number
   * @returns Next power of two
   */
  private nextPowerOfTwo(n: number): number {
    if (n <= 0) return 1;
    n--;
    n |= n >> 1;
    n |= n >> 2;
    n |= n >> 4;
    n |= n >> 8;
    n |= n >> 16;
    return n + 1;
  }

  /**
   * Exports atlas data as JSON.
   *
   * @returns Atlas metadata
   *
   * @example
   * ```typescript
   * const data = atlas.export();
   * localStorage.setItem('atlasData', JSON.stringify(data));
   * ```
   */
  export(): Record<string, any> {
    const sprites: Record<string, any> = {};

    for (const [name, sprite] of this.sprites) {
      sprites[name] = {
        id: sprite.id,
        x: sprite.x,
        y: sprite.y,
        width: sprite.width,
        height: sprite.height,
        uv: sprite.uv.toJSON(),
        rotated: sprite.rotated,
      };
    }

    return {
      id: this.id,
      label: this.label,
      width: this.currentWidth,
      height: this.currentHeight,
      sprites,
      options: this.options,
    };
  }

  /**
   * Destroys the atlas and releases resources.
   */
  destroy(): void {
    this.sprites.clear();
    this.spritesById.clear();

    if (this.texture) {
      this.texture.destroy();
      this.texture = null;
    }

    logger.debug(`Destroyed texture atlas: ${this.id}`);
  }
}
